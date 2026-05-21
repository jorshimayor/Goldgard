"use client";

import { useMemo, useState } from "react";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import { parseUnits } from "viem";
import { ArrowRight, CheckCircle2, CircleDashed, ExternalLink, Flame, Shield } from "lucide-react";
import { Display, Subhead, Body, Data, RuneStone, LeverageRune } from "@/components/DesignComponents";

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
    <div className="min-h-screen bg-gg-bg px-4 py-10 sm:py-16">
      <div className="mx-auto w-full max-w-3xl">
        {/* Header */}
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-aged-gold/30 bg-gg-surface/55 px-4 py-2 text-xs font-semibold text-aged-gold backdrop-blur-sm mb-4">
            <Shield className="h-3.5 w-3.5" />
            Atomic swap → rebalance → premium
          </div>
          <Display variant="xl" className="mb-4">
            Demo Console
          </Display>
          {/** <Body className="text-gg-muted text-lg max-w-xl">
            One transaction. The hook watches the oracle in <Data as="code">beforeSwap</Data>, takes a premium & rebalances in <Data as="code">afterSwap</Data>, then updates eligibility on liquidity events.
          </Body>
          */}
        </div>

        {/* Config Warnings */}
        {!okConfig ? (
          <div className="mb-6 rounded-xl border border-gg-border/50 bg-aged-gold/5 p-4 text-sm text-gg-muted">
            <p className="font-semibold text-foreground mb-1">Demo config not configured</p>
            Deploy locally and regenerate <Data as="code">app/config/demoConfig.local.json</Data>.
          </div>
        ) : null}

        {wrongNetwork ? (
          <div className="mb-6 rounded-xl border border-gg-border/50 bg-ember-red/10 p-4 text-sm text-ember-red">
            <p className="font-semibold mb-1">Wrong network selected</p>
            Switch to chainId <Data as="code">{cfg.chainId}</Data> to run the demo.
          </div>
        ) : null}

        {/* Main Card */}
        <RuneStone>
          {/* Step Indicators */}
          <div className="grid gap-3 grid-cols-4">
            {(["trade", "prep", "execute", "review"] as const).map((s) => (
              <div
                key={s}
                className={`rounded-xl border px-3 py-3 text-xs font-semibold transition-all duration-300 ${
                  step === s
                    ? "border-aged-gold bg-aged-gold/10 text-aged-gold"
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
            <Subhead>Configure Trade</Subhead>

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
                          ? "border-aged-gold bg-aged-gold/10 text-aged-gold"
                          : "border-gg-border/50 bg-gg-surface/30 text-foreground hover:border-aged-gold/50"
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
                  className="h-12 w-full rounded-xl border border-gg-border/50 bg-gg-surface/30 px-4 text-foreground placeholder-gg-muted/50 text-sm focus:border-aged-gold focus:outline-none transition-colors duration-300"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="border-t border-gg-border/30 pt-8 space-y-4">
            <Subhead>Execute Swap</Subhead>

            <div className="grid gap-3 sm:grid-cols-3">
              <button
                disabled={!address || !okConfig || wrongNetwork || amountWei === 0n || busy}
                onClick={mint}
                className="group relative h-12 rounded-xl border border-gg-border/50 bg-gg-surface/30 font-semibold text-sm overflow-hidden transition-all duration-300 hover:border-aged-gold/50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-aged-gold/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="relative flex items-center justify-center gap-2">
                  <Flame className="h-4 w-4 text-aged-gold" />
                  {cfg.chainId === 31337 ? "Get Tokens (Faucet)" : "Mint Tokens"}
                </div>
              </button>

              <button
                disabled={!address || !okConfig || wrongNetwork || amountWei === 0n || busy}
                onClick={approve}
                className="group relative h-12 rounded-xl border border-gg-border/50 bg-gg-surface/30 font-semibold text-sm overflow-hidden transition-all duration-300 hover:border-aged-gold/50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-aged-gold/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="relative">Approve Router</div>
              </button>

              <LeverageRune
                disabled={!address || !okConfig || wrongNetwork || amountWei === 0n || busy}
                onClick={execute}
              >
                Execute
              </LeverageRune>
            </div>

            {/* Error Message */}
            {error ? (
              <div className="rounded-xl border border-gg-border/50 bg-ember-red/10 p-4 text-sm text-ember-red">
                <p className="font-semibold mb-1">Error</p>
                {error}
              </div>
            ) : null}

            {/* Transaction Result */}
            {txHash ? (
              <RuneStone>
                <div className="text-sm font-semibold text-aged-gold flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Transaction Submitted
                </div>
                <div className="flex items-center justify-between gap-3 bg-gg-surface/30 rounded-lg p-3 mt-3">
                  <Data as="code" className="break-all">{txHash}</Data>
                  <a
                    href={`https://sepolia.etherscan.io/tx/${txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-aged-gold hover:text-pale-gold transition-colors whitespace-nowrap flex-shrink-0"
                  >
                    View <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </RuneStone>
            ) : null}
          </div>

          {/* Next Step CTA */}
          <div className="border-t border-gg-border/30 pt-8">
            <Body className="text-gg-muted text-sm">
              Next: verify the premium and reward accrual on the{" "}
              <a href="/dashboard" className="text-aged-gold hover:text-pale-gold font-semibold transition-colors">
                dashboard
              </a>
              .
            </Body>
          </div>
        </RuneStone>
      </div>
    </div>
  );
}
