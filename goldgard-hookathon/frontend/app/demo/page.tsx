"use client";

import { useMemo, useState } from "react";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import { parseUnits } from "viem";
import { ArrowRight, CheckCircle2, CircleDashed, ExternalLink, Flame, Shield } from "lucide-react";

import { getDemoConfig, isConfiguredAddress } from "../../lib/demoConfig";
import { mockErc20Abi } from "../../lib/abi/mockErc20";
import { swapRouterNoChecksAbi } from "../../lib/abi/swapRouterNoChecks";

type Step = "trade" | "prep" | "execute" | "review";

export default function DemoConsolePage() {
  const cfg = useMemo(() => getDemoConfig(), []);
  const chainId = useChainId();
  const { address } = useAccount();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [step, setStep] = useState<Step>("trade");
  const [dir, setDir] = useState<"0to1" | "1to0">("0to1");
  const [amount, setAmount] = useState("1000");
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const okConfig =
    isConfiguredAddress(cfg.poolManager) &&
    isConfiguredAddress(cfg.swapRouter) &&
    isConfiguredAddress(cfg.hook) &&
    isConfiguredAddress(cfg.token0) &&
    isConfiguredAddress(cfg.token1);

  const amountWei = useMemo(() => {
    try {
      return parseUnits(amount || "0", 18);
    } catch {
      return 0n;
    }
  }, [amount]);

  async function mint() {
    if (!address) return;
    setBusy(true);
    setError(null);
    try {
      await writeContractAsync({
        abi: mockErc20Abi,
        address: (dir === "0to1" ? cfg.token0 : cfg.token1) as `0x${string}`,
        functionName: "mint",
        args: [address, amountWei],
      });
      setStep("prep");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      const token = dir === "0to1" ? cfg.token0 : cfg.token1;
      await writeContractAsync({
        abi: mockErc20Abi,
        address: token as `0x${string}`,
        functionName: "approve",
        args: [cfg.swapRouter as `0x${string}`, amountWei],
      });
      setStep("execute");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function execute() {
    if (!client) return;
    setBusy(true);
    setError(null);
    try {
      const hash = await writeContractAsync({
        abi: swapRouterNoChecksAbi,
        address: cfg.swapRouter as `0x${string}`,
        functionName: "swap",
        args: [
          {
            currency0: cfg.token0 as `0x${string}`,
            currency1: cfg.token1 as `0x${string}`,
            fee: cfg.fee,
            tickSpacing: cfg.tickSpacing,
            hooks: cfg.hook as `0x${string}`,
          },
          {
            zeroForOne: dir === "0to1",
            amountSpecified: -amountWei,
            sqrtPriceLimitX96: dir === "0to1" ? 4295128740n : 1461446703485210103287273052203988822378723970341n,
          },
        ],
      });
      setTxHash(hash);
      setStep("review");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const wrongNetwork = okConfig && chainId !== cfg.chainId;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="rounded-3xl border border-gg-border bg-gg-surface p-6 shadow-gg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-gg-border bg-gg-surface px-3 py-1 text-xs text-gg-muted">
              <Shield className="h-3.5 w-3.5 text-gg-gold" />
              Atomic swap → rebalance → premium
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">Demo Console</h1>
            <p className="mt-2 text-sm text-gg-muted">
              One transaction. The hook watches the oracle in beforeSwap, takes a premium + rebalances in afterSwap,
              then updates eligibility on liquidity events.
            </p>
          </div>
        </div>

        {!okConfig ? (
          <div className="mt-6 rounded-2xl border border-gg-border bg-gg-surface p-4 text-sm text-gg-muted">
            Demo config not set. Deploy locally and regenerate{" "}
            <span className="font-mono">app/config/demoConfig.local.json</span>.
          </div>
        ) : null}

        {wrongNetwork ? (
          <div className="mt-6 rounded-2xl border border-gg-border bg-[#2a0f16]/50 p-4 text-sm text-gg-muted">
            Wrong network selected. Switch to chainId <span className="font-mono">{cfg.chainId}</span> to run the demo.
          </div>
        ) : null}

        <div className="mt-6 grid gap-4">
          <div className="grid gap-3 sm:grid-cols-4">
            {(["trade", "prep", "execute", "review"] as const).map((s) => (
              <div
                key={s}
                className={`rounded-2xl border px-3 py-2 text-xs ${
                  step === s ? "border-gg-gold bg-gg-surface" : "border-gg-border bg-gg-surface"
                }`}
              >
                <div className="flex items-center gap-2">
                  {step === s ? (
                    <CircleDashed className="h-4 w-4 text-gg-gold" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-gg-muted" />
                  )}
                  <span className="capitalize">{s}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-gg-border bg-gg-surface p-4">
            <div className="grid gap-4 sm:grid-cols-3 sm:items-end">
              <div className="sm:col-span-2">
                <div className="text-xs text-gg-muted">Trade</div>
                <div className="mt-1 flex gap-2">
                  <button
                    onClick={() => setDir("0to1")}
                    className={`h-10 flex-1 rounded-xl border text-sm font-semibold ${
                      dir === "0to1" ? "border-gg-gold bg-gg-surface" : "border-gg-border bg-gg-surface"
                    }`}
                  >
                    LST → USDC
                  </button>
                  <button
                    onClick={() => setDir("1to0")}
                    className={`h-10 flex-1 rounded-xl border text-sm font-semibold ${
                      dir === "1to0" ? "border-gg-gold bg-gg-surface" : "border-gg-border bg-gg-surface"
                    }`}
                  >
                    USDC → LST
                  </button>
                </div>
              </div>

              <label className="block">
                <div className="text-xs text-gg-muted">Amount</div>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border border-gg-border bg-[#0A1428]/40 px-3 text-sm text-foreground outline-none"
                  inputMode="decimal"
                />
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-gg-border bg-gg-surface p-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                disabled={!address || !okConfig || wrongNetwork || amountWei === 0n || busy}
                onClick={mint}
                className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-gg-border bg-gg-surface text-sm font-semibold hover:bg-gg-surface2 disabled:opacity-40"
              >
                <Flame className="h-4 w-4 text-gg-gold" />
                Mint Test Tokens
              </button>

              <button
                disabled={!address || !okConfig || wrongNetwork || amountWei === 0n || busy}
                onClick={approve}
                className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-gg-border bg-gg-surface text-sm font-semibold hover:bg-gg-surface2 disabled:opacity-40"
              >
                Approve Router
              </button>

              <button
                disabled={!address || !okConfig || wrongNetwork || amountWei === 0n || busy}
                onClick={execute}
                className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-gg-gold text-sm font-semibold text-[#0A1428] hover:bg-gg-gold-2 disabled:opacity-40"
              >
                Execute Demo <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            {error ? (
              <div className="mt-4 rounded-xl border border-gg-border bg-[#2a0f16]/50 p-3 text-sm text-gg-muted">
                {error}
              </div>
            ) : null}

            {txHash ? (
              <div className="mt-4 rounded-xl border border-gg-border bg-gg-surface p-3 text-sm">
                <div className="text-xs text-gg-muted">Transaction</div>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <span className="font-mono text-xs">{txHash}</span>
                  <a
                    href={`https://sepolia.etherscan.io/tx/${txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-gg-gold hover:text-gg-gold-2"
                  >
                    View <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-6 text-sm text-gg-muted">
          Next: verify the premium and reward accrual on the{" "}
          <a className="text-gg-gold hover:text-gg-gold-2" href="/dashboard">
            dashboard
          </a>
          .
        </div>
      </div>
    </div>
  );
}

