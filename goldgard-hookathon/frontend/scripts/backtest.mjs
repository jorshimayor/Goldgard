import { createPublicClient, http, parseAbi, parseAbiItem, decodeEventLog } from "viem";

const BPS = 10_000n;
const ONE_1E18 = 1_000_000_000_000_000_000n;

function env(name, def) {
  const v = process.env[name];
  return v == null || v === "" ? def : v;
}

function toBigInt(x) {
  return typeof x === "bigint" ? x : BigInt(x);
}

function ilBpsFromRatio1e18(ratio1e18) {
  if (ratio1e18 === 0n) return 0n;
  const sqrtR1e18 = sqrtBigInt(ratio1e18 * ONE_1E18);
  const factor1e18 = mulDiv(2n * sqrtR1e18, ONE_1E18, ONE_1E18 + ratio1e18);
  if (factor1e18 >= ONE_1E18) return 0n;
  return mulDiv(ONE_1E18 - factor1e18, BPS, ONE_1E18);
}

function mulDiv(a, b, den) {
  return (a * b) / den;
}

function sqrtBigInt(n) {
  if (n < 0n) throw new Error("sqrt negative");
  if (n < 2n) return n;
  let x0 = n / 2n;
  let x1 = (x0 + n / x0) / 2n;
  while (x1 < x0) {
    x0 = x1;
    x1 = (x0 + n / x0) / 2n;
  }
  return x0;
}

function price1e18FromSqrtPriceX96(sqrtPriceX96) {
  const s = toBigInt(sqrtPriceX96);
  return mulDiv(s * s, ONE_1E18, 1n << 192n);
}

const swapEvent = parseAbiItem(
  "event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)"
);

const poolAbi = parseAbi([
  "function token0() view returns (address)",
  "function token1() view returns (address)",
]);

const erc20Abi = parseAbi([
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

const known = {
  WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  STETH: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
  WSTETH: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
};

const pools = [
  {
    name: "vETH/USDC (proxy: UniswapV3 USDC/WETH 0.05%)",
    address: "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640",
    volumeSide: "token0",
    principalSide: "token0",
    defaultPrincipalAmount: 1_000_000n * 1_000_000n,
  },
  {
    name: "stETH/ETH (proxy: UniswapV3 wstETH/WETH 0.01%)",
    address: "0x109830a1aaad605bbf02a9dfa7b0b92ec2fb7daa",
    volumeSide: "token1",
    principalSide: "token1",
    defaultPrincipalAmount: 100n * ONE_1E18,
  },
];

async function getPoolMeta(client, poolAddress) {
  const [token0, token1] = await Promise.all([
    client.readContract({ address: poolAddress, abi: poolAbi, functionName: "token0" }),
    client.readContract({ address: poolAddress, abi: poolAbi, functionName: "token1" }),
  ]);

  const [dec0, dec1, sym0, sym1] = await Promise.all([
    client.readContract({ address: token0, abi: erc20Abi, functionName: "decimals" }),
    client.readContract({ address: token1, abi: erc20Abi, functionName: "decimals" }),
    client.readContract({ address: token0, abi: erc20Abi, functionName: "symbol" }),
    client.readContract({ address: token1, abi: erc20Abi, functionName: "symbol" }),
  ]);

  return { token0, token1, dec0, dec1, sym0, sym1 };
}

function absSigned(x) {
  const b = toBigInt(x);
  return b < 0n ? -b : b;
}

function classifySegments(points, windowSwaps) {
  if (points.length === 0) return [];
  const segments = [];
  for (let i = 0; i + windowSwaps <= points.length; i += windowSwaps) {
    const slice = points.slice(i, i + windowSwaps);
    if (slice.length < 2) continue;

    const p0 = slice[0].price1e18;
    const p1 = slice[slice.length - 1].price1e18;
    const driftAbs = p0 === 0n ? 0n : (p1 > p0 ? p1 - p0 : p0 - p1);

    let sumAbsRet = 0n;
    for (let j = 1; j < slice.length; j++) {
      const a = slice[j - 1].price1e18;
      const b = slice[j].price1e18;
      if (a === 0n) continue;
      const diff = b > a ? b - a : a - b;
      sumAbsRet += mulDiv(diff, ONE_1E18, a);
    }

    segments.push({
      startIndex: i,
      endIndex: i + windowSwaps,
      startBlock: slice[0].blockNumber,
      endBlock: slice[slice.length - 1].blockNumber,
      startPrice1e18: p0,
      endPrice1e18: p1,
      driftAbs,
      volProxy: sumAbsRet,
    });
  }

  segments.sort((a, b) =>
    a.volProxy > b.volProxy ? -1 : a.volProxy < b.volProxy ? 1 : 0
  );
  return segments;
}

function pickRegimes(segments) {
  if (segments.length < 3) return { volatile: null, calm: null, drift: null };
  const volatile = segments[0];
  const calm = segments[segments.length - 1];

  const remaining = segments
    .slice(1, segments.length - 1)
    .sort((a, b) => (a.driftAbs > b.driftAbs ? -1 : a.driftAbs < b.driftAbs ? 1 : 0));
  const drift = remaining[0] ?? null;

  return { volatile, calm, drift };
}

async function runPool(client, pool) {
  const premiumBps = toBigInt(env("PREMIUM_BPS", "2"));
  const windowSwaps = Number(env("WINDOW_SWAPS", "800"));

  const latest = await client.getBlockNumber();
  const lookbackBlocks = BigInt(env("LOOKBACK_BLOCKS", "20000"));
  const envFrom = env("FROM_BLOCK", "");
  const envTo = env("TO_BLOCK", "");
  const fromBlock =
    envFrom !== "" ? BigInt(envFrom) : latest > lookbackBlocks ? latest - lookbackBlocks : 0n;
  const toBlock = envTo !== "" ? BigInt(envTo) : latest;

  const meta = await getPoolMeta(client, pool.address);

  const logs = [];
  async function getLogsAdaptive(fromBlock, toBlock, stepBlocks) {
    for (let b = fromBlock; b <= toBlock; b += stepBlocks) {
      const end = b + stepBlocks - 1n > toBlock ? toBlock : b + stepBlocks - 1n;
      try {
        const batch = await client.getLogs({
          address: pool.address,
          event: swapEvent,
          fromBlock: b,
          toBlock: end,
        });
        logs.push(...batch);
      } catch (e) {
        const msg = String(e?.shortMessage ?? e?.message ?? e);
        if (stepBlocks > 50n && msg.toLowerCase().includes("timed out")) {
          await getLogsAdaptive(b, end, stepBlocks / 2n);
        } else {
          throw e;
        }
      }
      if (logs.length > Number(env("MAX_LOGS", "150000"))) break;
    }
  }

  const step = BigInt(env("LOG_STEP_BLOCKS", "500"));
  await getLogsAdaptive(fromBlock, toBlock, step);

  if (logs.length === 0) {
    return { pool, meta, fromBlock, toBlock, note: "No swap logs in range.", regimes: null };
  }

  const points = [];
  for (const l of logs) {
    const decoded = decodeEventLog({ abi: [swapEvent], data: l.data, topics: l.topics });
    const { sqrtPriceX96 } = decoded.args;
    points.push({ blockNumber: l.blockNumber, price1e18: price1e18FromSqrtPriceX96(sqrtPriceX96) });
  }

  points.sort((a, b) => (a.blockNumber < b.blockNumber ? -1 : 1));

  const effectiveWindowSwaps =
    points.length >= windowSwaps * 3
      ? windowSwaps
      : Math.max(50, Math.floor(points.length / 3));
  const segments = classifySegments(points, effectiveWindowSwaps);
  const regimes = pickRegimes(segments);

  function segmentVolume(seg) {
    if (!seg) return 0n;
    let sum = 0n;
    for (let i = seg.startIndex; i < seg.endIndex && i < logs.length; i++) {
      const l = logs[i];
      const decoded = decodeEventLog({ abi: [swapEvent], data: l.data, topics: l.topics });
      if (pool.volumeSide === "token0") sum += absSigned(decoded.args.amount0);
      else sum += absSigned(decoded.args.amount1);
    }
    return sum;
  }

  const principalEnv = env("PRINCIPAL_AMOUNT", "");
  const principalAmount =
    principalEnv !== "" ? toBigInt(principalEnv) : pool.defaultPrincipalAmount;
  const principalDecimals =
    pool.principalSide === "token0" ? BigInt(meta.dec0) : BigInt(meta.dec1);
  const principalSymbol =
    pool.principalSide === "token0" ? meta.sym0 : meta.sym1;

  function summarize(seg) {
    if (!seg) return null;
    const ratio1e18 = seg.startPrice1e18 === 0n ? 0n : mulDiv(seg.endPrice1e18, ONE_1E18, seg.startPrice1e18);
    const ilBps = ilBpsFromRatio1e18(ratio1e18);
    const payout = mulDiv(principalAmount, ilBps, BPS);

    const volume = segmentVolume(seg);
    const premium = mulDiv(volume, premiumBps, BPS);
    const shortfall = payout > premium ? payout - premium : 0n;
    const neededBps = volume === 0n ? null : (payout * BPS + volume - 1n) / volume;

    return {
      startBlock: seg.startBlock,
      endBlock: seg.endBlock,
      ilBps: Number(ilBps),
      principalAmount,
      principalDecimals: Number(principalDecimals),
      principalSymbol,
      payout,
      volume,
      premium,
      shortfall,
      neededBps: neededBps == null ? null : Number(neededBps),
    };
  }

  return {
    pool,
    meta,
    fromBlock,
    toBlock,
    logs: logs.length,
    effectiveWindowSwaps,
    regimes: {
      volatile: summarize(regimes.volatile),
      calm: summarize(regimes.calm),
      drift: summarize(regimes.drift),
    },
  };
}

function fmtUnits(x, decimals) {
  const n = toBigInt(x);
  const sign = n < 0n ? "-" : "";
  const v = n < 0n ? -n : n;
  const d = BigInt(decimals);
  if (d === 0n) return `${sign}${v}`;
  const base = 10n ** d;
  const whole = v / base;
  const frac = (v % base).toString().padStart(Number(d), "0");
  return `${sign}${whole}.${frac}`;
}

function section(title) {
  console.log(`\n## ${title}\n`);
}

async function main() {
  const rpcUrl = env("RPC_URL", "https://ethereum.publicnode.com");
  const client = createPublicClient({ transport: http(rpcUrl) });

  console.log(`# Goldgard Backtest (Quick-run)\n`);
  console.log(`- rpcUrl: ${rpcUrl}`);
  console.log(`- lookbackBlocks: ${env("LOOKBACK_BLOCKS", "20000")}`);
  console.log(`- premiumBps: ${env("PREMIUM_BPS", "2")}`);
  console.log(`- principalAmount: ${env("PRINCIPAL_AMOUNT", "") || "(pool default)"}`);
  console.log(`- windowSwaps: ${env("WINDOW_SWAPS", "800")}`);

  for (const pool of pools) {
    section(pool.name);
    const res = await runPool(client, pool);
    console.log(`- pool: ${pool.address}`);
    console.log(`- token0: ${res.meta.sym0} (${res.meta.token0})`);
    console.log(`- token1: ${res.meta.sym1} (${res.meta.token1})`);
    console.log(`- blockRange: ${res.fromBlock}..${res.toBlock}`);
    console.log(`- swaps: ${res.logs ?? 0}`);
    console.log(`- windowSwaps(effective): ${res.effectiveWindowSwaps}`);
    if (res.note) {
      console.log(`- note: ${res.note}`);
      continue;
    }

    const regimes = res.regimes;
    for (const k of ["volatile", "calm", "drift"]) {
      const r = regimes[k];
      if (!r) continue;
      console.log(`\n### ${k}`);
      console.log(`- blocks: ${r.startBlock} → ${r.endBlock}`);
      console.log(`- IL: ${r.ilBps} bps`);
      console.log(`- premiumVolume(${r.principalSymbol}): ${fmtUnits(r.volume, r.principalDecimals)}`);
      console.log(`- premiumIn(${r.principalSymbol}): ${fmtUnits(r.premium, r.principalDecimals)}`);
      console.log(`- payoutOut(${r.principalSymbol}): ${fmtUnits(r.payout, r.principalDecimals)}`);
      console.log(`- shortfall(${r.principalSymbol}): ${fmtUnits(r.shortfall, r.principalDecimals)}`);
      console.log(`- premiumBpsNeeded: ${r.neededBps == null ? "n/a" : r.neededBps}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
