"use client";

import { useMemo, useState } from "react";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import { parseUnits } from "viem";
import { ArrowRight, CheckCircle2, CircleDashed, ExternalLink, Flame, Shield } from "lucide-react";

import { getDemoConfigForChain, isConfiguredAddress } from "../../lib/demoConfig";
import { mockErc20Abi } from "../../lib/abi/mockErc20";
import { swapRouterNoChecksAbi } from "../../lib/abi/swapRouterNoChecks";

type Step = "trade" | "prep" | "execute" | "review";

export default function DemoConsolePage() {
  const chainId = useChainId();
  const cfg = useMemo(() => getDemoConfigForChain(chainId), [chainId]);
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
      if (cfg.chainId === 31337) {
        const res = await fetch("/api/faucet", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chainId,
            address,
            tokenAmount: amount || "1000",
          }),
        });
        const json = (await res.json()) as { ok: boolean; error?: string };
        if (!json.ok) throw new Error(json.error ?? "Faucet failed");
      } else {
        await writeContractAsync({
          abi: mockErc20Abi,
          address: (dir === "0to1" ? cfg.token0 : cfg.token1) as `0x${string}`,
          functionName: "mint",
          args: [address, amountWei],
        });
      }
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
    <div className="min-h-screen bg-gradient-to-b from-[#0a1428] via-[#0a1428] to-[#0a0f1a] px-4 py-10 sm:py-16">
      <div className="mx-auto w-full max-w-3xl">
        {/* Header */}
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-gg-gold/30 bg-gg-surface/50 px-4 py-2 text-xs font-semibold text-gg-gold backdrop-blur-sm mb-4">
            <Shield className="h-3.5 w-3.5" />
            Atomic swap → rebalance → premium
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            <span className="block text-white mb-2">Demo</span>
            <span className="gradient-text text-4xl md:text-5xl font-bold">Console</span>
          </h1>
          <p className="text-gg-muted text-lg max-w-xl">
            One transaction. The hook watches the oracle in <span className="font-mono text-gg-gold">beforeSwap</span>, takes a premium & rebalances in <span className="font-mono text-gg-gold">afterSwap</span>, then updates eligibility on liquidity events.
          </p>
        </div>

        {/* Config Warnings */}
        {!okConfig ? (
          <div className="mb-6 rounded-xl border border-gg-border/50 bg-gg-gold/5 p-4 text-sm text-gg-muted">
            <p className="font-semibold text-foreground mb-1">Demo config not configured</p>
            Deploy locally and regenerate <span className="font-mono text-gg-gold">app/config/demoConfig.local.json</span>.
          </div>
        ) : null}

        {wrongNetwork ? (
          <div className="mb-6 rounded-xl border border-gg-border/50 bg-gg-blood/10 p-4 text-sm text-gg-blood">
            <p className="font-semibold mb-1">Wrong network selected</p>
            Switch to chainId <span className="font-mono">{cfg.chainId}</span> to run the demo.
          </div>
        ) : null}

        {/* Main Card */}
        <div className="card-glow rounded-2xl p-8 backdrop-blur-sm space-y-8">
          {/* Step Indicators */}
          <div className="grid gap-3 grid-cols-4">
            {(["trade", "prep", "execute", "review"] as const).map((s) => (
              <div
                key={s}
                className={`rounded-xl border px-3 py-3 text-xs font-semibold transition-all duration-300 ${
                  step === s
                    ? "border-gg-gold bg-gg-gold/10 text-gg-gold"
                    : "border-gg-border/50 bg-gg-surface/30 text-gg-muted"
                }`}
              >
                <div className="flex items-center gap-2 justify-center">
                  {step === s ? (
                    <CircleDashed className="h-4 w-4 animate-pulse-glow" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  <span className="capitalize">{s}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Trade Input Section */}
          <div className="border-t border-gg-border/30 pt-8 space-y-6">
            <h2 className="text-xl font-bold">Configure Trade</h2>

            <div className="grid gap-6 sm:grid-cols-2">
              {/* Direction */}
              <div className="space-y-3">
                <label className="block text-sm font-semibold text-gg-muted">Trade Direction</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["0to1", "1to0"] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => setDir(d)}
                      className={`group relative h-12 rounded-xl font-semibold text-sm overflow-hidden transition-all duration-300 border ${
                        dir === d
                          ? "border-gg-gold bg-gg-gold/10 text-gg-gold"
                          : "border-gg-border/50 bg-gg-surface/30 text-foreground hover:border-gg-gold/50"
                      }`}
                    >
                      <div className="relative flex items-center justify-center gap-1 h-full">
                        <span>{d === "0to1" ? "LST" : "USDC"}</span>
                        <ArrowRight className="h-3 w-3" />
                        <span>{d === "0to1" ? "USDC" : "LST"}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount */}
              <div className="space-y-3">
                <label className="block text-sm font-semibold text-gg-muted">Amount</label>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="1000.0"
                  inputMode="decimal"
                  className="h-12 w-full rounded-xl border border-gg-border/50 bg-gg-surface/30 px-4 text-foreground placeholder-gg-muted/50 text-sm focus:border-gg-gold focus:outline-none transition-colors duration-300"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="border-t border-gg-border/30 pt-8 space-y-4">
            <h2 className="text-xl font-bold mb-4">Execute Swap</h2>

            <div className="grid gap-3 sm:grid-cols-3">
              <button
                disabled={!address || !okConfig || wrongNetwork || amountWei === 0n || busy}
                onClick={mint}
                className="group relative h-12 rounded-xl border border-gg-border/50 bg-gg-surface/30 font-semibold text-sm overflow-hidden transition-all duration-300 hover:border-gg-gold/50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-gg-gold/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="relative flex items-center justify-center gap-2">
                  <Flame className="h-4 w-4 text-gg-gold" />
                  {cfg.chainId === 31337 ? "Get Tokens (Faucet)" : "Mint Tokens"}
                </div>
              </button>

              <button
                disabled={!address || !okConfig || wrongNetwork || amountWei === 0n || busy}
                onClick={approve}
                className="group relative h-12 rounded-xl border border-gg-border/50 bg-gg-surface/30 font-semibold text-sm overflow-hidden transition-all duration-300 hover:border-gg-gold/50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-gg-gold/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="relative">Approve Router</div>
              </button>

              <button
                disabled={!address || !okConfig || wrongNetwork || amountWei === 0n || busy}
                onClick={execute}
                className="group relative h-12 rounded-xl font-semibold text-sm overflow-hidden transition-all duration-300 text-[#0A1428] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-gg-gold to-gg-gold2 group-hover:scale-105 transition-transform duration-300" />
                <div className="relative flex items-center justify-center gap-2">
                  Execute <ArrowRight className="h-4 w-4" />
                </div>
              </button>
            </div>

            {/* Error Message */}
            {error ? (
              <div className="rounded-xl border border-gg-border/50 bg-gg-blood/10 p-4 text-sm text-gg-blood">
                <p className="font-semibold mb-1">Error</p>
                {error}
              </div>
            ) : null}

            {/* Transaction Result */}
            {txHash ? (
              <div className="card-glow rounded-xl p-4 space-y-3">
                <div className="text-sm font-semibold text-gg-gold flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Transaction Submitted
                </div>
                <div className="flex items-center justify-between gap-3 bg-gg-surface/30 rounded-lg p-3">
                  <span className="font-mono text-xs text-gg-muted break-all">{txHash}</span>
                  <a
                    href={`https://sepolia.etherscan.io/tx/${txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-gg-gold hover:text-gg-gold2 transition-colors whitespace-nowrap flex-shrink-0"
                  >
                    View <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            ) : null}
          </div>

          {/* Next Step CTA */}
          <div className="border-t border-gg-border/30 pt-8">
            <p className="text-gg-muted text-sm">
              Next: verify the premium and reward accrual on the{" "}
              <a href="/dashboard" className="text-gg-gold hover:text-gg-gold2 font-semibold transition-colors">
                dashboard
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
