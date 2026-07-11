import { NextResponse } from "next/server";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  encodeAbiParameters,
  parseUnits,
  formatUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import sepoliaConfig from "@/app/config/demoConfig.sepolia.json";
import localConfig from "@/app/config/demoConfig.local.json";

// Drives a price swing against the demo pool entirely with JSON-RPC
// transactions (viem) — no forge binary needed, so it runs on Vercel.
// Each step nudges the mock oracle and swaps into the pool so spot chases
// the reference price, exercising the hook's dynamic-fee/breaker path.
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_UINT16 = 65535;

const slot0Abi = [
  {
    type: "function",
    name: "getSlot0",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "protocolFee", type: "uint24" },
      { name: "lpFee", type: "uint24" },
    ],
  },
] as const;

const aggregatorAbi = [
  {
    type: "function",
    name: "setAnswer",
    stateMutability: "nonpayable",
    inputs: [{ name: "_answer", type: "int256" }],
    outputs: [],
  },
] as const;

const erc20Abi = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const poolKeyComponents = [
  { name: "currency0", type: "address" },
  { name: "currency1", type: "address" },
  { name: "fee", type: "uint24" },
  { name: "tickSpacing", type: "int24" },
  { name: "hooks", type: "address" },
] as const;

const swapRouterAbi = [
  {
    type: "function",
    name: "swap",
    stateMutability: "payable",
    inputs: [
      { name: "key", type: "tuple", components: poolKeyComponents },
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "zeroForOne", type: "bool" },
          { name: "amountSpecified", type: "int256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [],
  },
] as const;

const poolConfigComponents = [
  { name: "baseLpFee", type: "uint24" },
  { name: "maxLpFee", type: "uint24" },
  { name: "feeSlopeBps", type: "uint16" },
  { name: "deviationBps", type: "uint16" },
  { name: "circuitBreakerBps", type: "uint16" },
  { name: "rebalanceBps", type: "uint16" },
  { name: "twapWindowSeconds", type: "uint32" },
  { name: "circuitBreakerCooldownSeconds", type: "uint32" },
  { name: "pausedUntil", type: "uint64" },
] as const;

const hookAbi = [
  {
    type: "function",
    name: "poolConfig",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: poolConfigComponents,
  },
  {
    type: "function",
    name: "setPoolConfig",
    stateMutability: "nonpayable",
    inputs: [
      { name: "key", type: "tuple", components: poolKeyComponents },
      { name: "cfg", type: "tuple", components: poolConfigComponents },
    ],
    outputs: [],
  },
] as const;

const hedgeAbi = [
  {
    type: "function",
    name: "setMaxSpotOracleDeviationBps",
    stateMutability: "nonpayable",
    inputs: [{ name: "newMaxBps", type: "uint16" }],
    outputs: [],
  },
] as const;

// v4 price-limit bounds (min/max sqrt price ± 1).
const MIN_SQRT_LIMIT = 4295128740n;
const MAX_SQRT_LIMIT = 1461446703485210103287273052203988822378723970341n;

function priceFromSqrt(sqrtPriceX96: bigint): bigint {
  return (sqrtPriceX96 * sqrtPriceX96 * 10n ** 18n) >> 192n;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    chainId?: number;
    directionUp?: boolean;
    moveBps?: number;
    steps?: number;
    amountPerStep?: string;
  };

  const chainId = body.chainId ?? 11155111;
  if (chainId !== 11155111 && chainId !== 31337) {
    return NextResponse.json(
      { ok: false, error: "Unsupported chainId.", chainId },
      { status: 400 },
    );
  }

  const isSepolia = chainId === 11155111;
  const cfg = (isSepolia ? sepoliaConfig : localConfig) as Record<string, unknown>;
  const rpcUrl = isSepolia
    ? process.env.SEPOLIA_RPC_URL
    : process.env.LOCAL_RPC_URL ?? "http://127.0.0.1:8545";
  const privateKeyRaw = isSepolia
    ? process.env.SEPOLIA_PRIVATE_KEY ?? process.env.PRIVATE_KEY
    : process.env.LOCAL_PRIVATE_KEY ??
      process.env.PRIVATE_KEY ??
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

  if (!rpcUrl || !privateKeyRaw) {
    return NextResponse.json(
      {
        ok: false,
        error: isSepolia
          ? "Missing SEPOLIA_RPC_URL/SEPOLIA_PRIVATE_KEY."
          : "Missing LOCAL_RPC_URL/LOCAL_PRIVATE_KEY.",
      },
      { status: 400 },
    );
  }

  const moveBps = BigInt(body.moveBps ?? 1000);
  const steps = Math.min(Math.max(body.steps ?? 5, 1), 10);
  const directionUp = body.directionUp ?? true;
  const amountPerStep = parseUnits(body.amountPerStep ?? "10000", 18);

  const chain = isSepolia
    ? sepolia
    : { ...sepolia, id: 31337, name: "Anvil" };
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain, transport });
  const account = privateKeyToAccount(
    (privateKeyRaw.startsWith("0x")
      ? privateKeyRaw
      : `0x${privateKeyRaw}`) as `0x${string}`,
  );
  const wallet = createWalletClient({ account, chain, transport });

  const key = {
    currency0: cfg.token0 as `0x${string}`,
    currency1: cfg.token1 as `0x${string}`,
    fee: Number(cfg.fee),
    tickSpacing: Number(cfg.tickSpacing),
    hooks: cfg.hook as `0x${string}`,
  };
  const poolId = keccak256(
    encodeAbiParameters(
      [{ type: "tuple", components: poolKeyComponents }],
      [key],
    ),
  );

  try {
    const [startSqrt] = (await publicClient.readContract({
      address: cfg.stateView as `0x${string}`,
      abi: slot0Abi,
      functionName: "getSlot0",
      args: [poolId],
    })) as readonly [bigint, number, number, number];
    const startPrice = priceFromSqrt(startSqrt);

    let nonce = await publicClient.getTransactionCount({
      address: account.address,
      blockTag: "pending", // don't collide with in-flight txs
    });
    const txs: `0x${string}`[] = [];
    const send = async (
      params: Parameters<typeof wallet.writeContract>[0],
      gas: bigint,
    ) => {
      const hash = await wallet.writeContract({
        ...params,
        nonce: nonce++,
        gas,
      } as Parameters<typeof wallet.writeContract>[0]);
      txs.push(hash);
      return hash;
    };

    // Best-effort tuning (owner-only): widen hedge + hook thresholds so the
    // swing itself doesn't halt the demo. Simulated first — skipped when the
    // key isn't the owner. Mirrors SimulatePriceSwing.s.sol.
    try {
      await publicClient.simulateContract({
        address: cfg.hedgeReserve as `0x${string}`,
        abi: hedgeAbi,
        functionName: "setMaxSpotOracleDeviationBps",
        args: [MAX_UINT16],
        account,
      });
      await send(
        {
          address: cfg.hedgeReserve as `0x${string}`,
          abi: hedgeAbi,
          functionName: "setMaxSpotOracleDeviationBps",
          args: [MAX_UINT16],
        } as never,
        150_000n,
      );
    } catch {
      /* not owner — skip */
    }

    try {
      const pc = (await publicClient.readContract({
        address: cfg.hook as `0x${string}`,
        abi: hookAbi,
        functionName: "poolConfig",
        args: [poolId],
      })) as readonly [number, number, number, number, number, number, number, number, bigint];
      const newCfg = {
        baseLpFee: pc[0],
        maxLpFee: pc[1],
        feeSlopeBps: pc[2],
        deviationBps: MAX_UINT16,
        circuitBreakerBps: MAX_UINT16,
        rebalanceBps: pc[5],
        twapWindowSeconds: pc[6],
        circuitBreakerCooldownSeconds: 0,
        pausedUntil: 0n,
      };
      await publicClient.simulateContract({
        address: cfg.hook as `0x${string}`,
        abi: hookAbi,
        functionName: "setPoolConfig",
        args: [key, newCfg],
        account,
      });
      await send(
        {
          address: cfg.hook as `0x${string}`,
          abi: hookAbi,
          functionName: "setPoolConfig",
          args: [key, newCfg],
        } as never,
        200_000n,
      );
    } catch {
      /* not owner — skip */
    }

    // The swing: nudge the oracle, then swap so spot follows. Explicit gas
    // limits let the whole nonce chain go out without waiting per-tx.
    const tokenIn = (directionUp ? cfg.token1 : cfg.token0) as `0x${string}`;
    let lastHash: `0x${string}` | undefined;
    for (let i = 1; i <= steps; i++) {
      const stepBps = (moveBps * BigInt(i)) / BigInt(steps);
      const target = directionUp
        ? (startPrice * (10_000n + stepBps)) / 10_000n
        : (startPrice * (10_000n - stepBps)) / 10_000n;

      await send(
        {
          address: cfg.mockAggregator as `0x${string}`,
          abi: aggregatorAbi,
          functionName: "setAnswer",
          args: [target / 10n ** 10n], // 1e18 → aggregator's 1e8
        } as never,
        100_000n,
      );
      await send(
        {
          address: tokenIn,
          abi: erc20Abi,
          functionName: "mint",
          args: [account.address, amountPerStep],
        } as never,
        120_000n,
      );
      await send(
        {
          address: tokenIn,
          abi: erc20Abi,
          functionName: "approve",
          args: [cfg.swapRouter as `0x${string}`, amountPerStep],
        } as never,
        80_000n,
      );
      lastHash = await send(
        {
          address: cfg.swapRouter as `0x${string}`,
          abi: swapRouterAbi,
          functionName: "swap",
          args: [
            key,
            {
              zeroForOne: !directionUp,
              amountSpecified: -amountPerStep,
              sqrtPriceLimitX96: directionUp
                ? MAX_SQRT_LIMIT
                : MIN_SQRT_LIMIT,
            },
          ],
        } as never,
        900_000n,
      );
    }

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: lastHash!,
      timeout: 45_000,
    });

    const [endSqrt] = (await publicClient.readContract({
      address: cfg.stateView as `0x${string}`,
      abi: slot0Abi,
      functionName: "getSlot0",
      args: [poolId],
    })) as readonly [bigint, number, number, number];

    return NextResponse.json({
      ok: receipt.status === "success",
      steps,
      moveBps: Number(moveBps),
      directionUp,
      startPrice: formatUnits(startPrice, 18),
      endPrice: formatUnits(priceFromSqrt(endSqrt), 18),
      txs,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message.slice(0, 300) },
      { status: 500 },
    );
  }
}
