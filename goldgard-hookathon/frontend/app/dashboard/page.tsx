"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BarChart3, Coins, Flame, ShieldCheck, TrendingDown } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAccount, useChainId, useReadContract } from "wagmi";
import { formatUnits } from "viem";

import { getDemoConfigForChain, isConfiguredAddress } from "../../lib/demoConfig";
import { formatNumber, shortAddr } from "../../lib/format";
import { safetyModuleAbi } from "../../lib/abi/safetyModule";
import { rewardDistributorAbi } from "../../lib/abi/rewardDistributor";

type Point = {
  step: number;
  movePct: number;
  ilBps: number;
  protectedIlBps: number;
  ilPct: number;
  protectedIlPct: number;
};

function computeILBps(r: number) {
  const sqrtR = Math.sqrt(r);
  const factor = (2 * sqrtR) / (1 + r);
  return Math.max(0, (1 - factor) * 10_000);
}

function formatDecimalString(value: string, maxFractionDigits: number) {
  const [rawInt, rawFrac = ""] = value.split(".");
  const intPart = rawInt.replace(/^(-?)0+(?=\d)/, "$1");

  const fracPart = rawFrac.slice(0, Math.max(0, maxFractionDigits)).replace(/0+$/, "");
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (!fracPart) return withCommas;
  return `${withCommas}.${fracPart}`;
}

function formatTokenAmount(value: bigint | undefined, decimals = 18, maxFractionDigits = 4) {
  if (value === undefined) return "—";
  return formatDecimalString(formatUnits(value, decimals), maxFractionDigits);
}

function IlTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: Point }> }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;

  const unprotected = formatNumber(p.ilPct, { maximumFractionDigits: 2 });
  const protectedIl = formatNumber(p.protectedIlPct, { maximumFractionDigits: 2 });
  const savings = formatNumber(Math.max(0, p.ilPct - p.protectedIlPct), { maximumFractionDigits: 2 });

  return (
    <div className="rounded-xl border border-gg-border/60 bg-[#0A1428]/85 px-4 py-3 shadow-[0_0_0_1px_rgba(212,175,119,0.18),0_12px_30px_rgba(0,0,0,0.45)] backdrop-blur">
      <div className="text-xs font-semibold text-gg-muted mb-1">
        Move: {formatNumber(p.movePct, { maximumFractionDigits: 1 })}%
      </div>
      <div className="space-y-1.5 text-sm">
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-gg-blood" />
            <span className="text-gg-muted">Unprotected IL</span>
          </div>
          <span className="tabular-nums font-semibold text-foreground">{unprotected}%</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-gg-gold" />
            <span className="text-gg-muted">Protected IL</span>
          </div>
          <span className="tabular-nums font-semibold text-foreground">{protectedIl}%</span>
        </div>
        <div className="flex items-center justify-between gap-6 border-t border-gg-border/40 pt-2">
          <span className="text-gg-muted">Savings</span>
          <span className="tabular-nums font-semibold text-gg-gold">-{savings}%</span>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const chainId = useChainId();
  const cfg = useMemo(() => getDemoConfigForChain(chainId), [chainId]);
  const { address } = useAccount();
  const [simMoveBps, setSimMoveBps] = useState(1000);
  const [simBusy, setSimBusy] = useState(false);
  const [simLog, setSimLog] = useState<string | null>(null);

  const ggardArgs = useMemo(() => {
    if (!address) return null;
    return [address, 1n] as const;
  }, [address]);

  const { data: safetyAssets } = useReadContract({
    abi: safetyModuleAbi,
    address: isConfiguredAddress(cfg.safetyModule) ? (cfg.safetyModule as `0x${string}`) : undefined,
    functionName: "totalAssets",
    query: { enabled: isConfiguredAddress(cfg.safetyModule) },
  });

  const { data: ggardId } = useReadContract({
    abi: rewardDistributorAbi,
    address: isConfiguredAddress(cfg.rewards) ? (cfg.rewards as `0x${string}`) : undefined,
    functionName: "GGARD_ID",
    query: { enabled: isConfiguredAddress(cfg.rewards) },
  });

  const { data: ggardBalance } = useReadContract({
    abi: rewardDistributorAbi,
    address: isConfiguredAddress(cfg.rewards) ? (cfg.rewards as `0x${string}`) : undefined,
    functionName: "balanceOf",
    args: address && ggardId !== undefined ? ([address, ggardId] as const) : ggardArgs!,
    query: { enabled: Boolean(address && ggardId !== undefined && isConfiguredAddress(cfg.rewards)) },
  });

  const chartData = useMemo<Point[]>(() => {
    const steps = 12;
    const dir = 1;
    const points: Point[] = [];
    for (let i = 0; i <= steps; i++) {
      const move = (simMoveBps * i) / steps;
      const r = 1 + (dir * move) / 10_000;
      const ilBps = computeILBps(r);
      const protectedIlBps = Math.max(0, ilBps - 350);
      points.push({
        step: i,
        movePct: move / 100,
        ilBps,
        protectedIlBps,
        ilPct: ilBps / 100,
        protectedIlPct: protectedIlBps / 100,
      });
    }
    return points;
  }, [simMoveBps]);

  const chartExtents = useMemo(() => {
    let max = 0;
    for (const p of chartData) {
      max = Math.max(max, p.ilPct, p.protectedIlPct);
    }
    if (!Number.isFinite(max)) return { yMin: 0, yMax: 12 };
    const pad = Math.max(0.6, max * 0.22);
    const yMin = 0;
    const yMax = Math.ceil((max + pad) * 2) / 2;
    return { yMin, yMax: Math.max(2, yMax) };
  }, [chartData]);

  const networkLabel = cfg.chainId === 11155111 ? "Sepolia" : cfg.chainId === 31337 ? "Local" : `Chain ${cfg.chainId}`;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a1428] via-[#0a1428] to-[#0a0f1a] px-4 py-10 sm:py-16">
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-8">
          <h1 className="text-4xl md:text-5xl font-bold mb-2">
            <span className="block text-white mb-1">Shieldwall</span>
            <span className="gradient-text text-4xl md:text-5xl font-bold">Dashboard</span>
          </h1>
          <p className="text-gg-muted text-lg">Monitor your protected liquidity and safety module performance</p>
        </div>

        <div className="grid gap-8 md:grid-cols-12">
          <section className="md:col-span-8 space-y-6">
            {/* Main Stats */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="card-glow group rounded-2xl p-6 backdrop-blur-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-gg-gold/10 group-hover:bg-gg-gold/20 transition-colors">
                    <ShieldCheck className="h-5 w-5 text-gg-gold" />
                  </div>
                  <span className="text-xs font-semibold text-gg-muted uppercase tracking-wider">Safety Module</span>
                </div>
                <div className="mt-4">
                  <div className="text-3xl font-bold text-gg-gold tabular-nums tracking-tight">
                    {formatTokenAmount(safetyAssets, 18, 6)}
                  </div>
                  <div className="mt-2 text-xs text-gg-muted">Total assets (demo units)</div>
                </div>
              </div>

              <div className="card-glow group rounded-2xl p-6 backdrop-blur-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-gg-gold/10 group-hover:bg-gg-gold/20 transition-colors">
                    <Coins className="h-5 w-5 text-gg-gold" />
                  </div>
                  <span className="text-xs font-semibold text-gg-muted uppercase tracking-wider">GGARD Rewards</span>
                </div>
                <div className="mt-4">
                  <div className="text-3xl font-bold text-gg-gold tabular-nums tracking-tight">
                    {formatTokenAmount(ggardBalance, 18, 6)}
                  </div>
                  <div className="mt-2 text-xs text-gg-muted">Claimable ERC-6909 balance</div>
                </div>
              </div>

              <div className="card-glow group rounded-2xl p-6 backdrop-blur-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-gg-blood/20 group-hover:bg-gg-blood/30 transition-colors">
                    <TrendingDown className="h-5 w-5 text-gg-blood" />
                  </div>
                  <span className="text-xs font-semibold text-gg-muted uppercase tracking-wider">IL Protection</span>
                </div>
                <div className="mt-4">
                  <div className="text-3xl font-bold text-gg-blood">80%+</div>
                  <div className="mt-2 text-xs text-gg-muted">Liquidity-seconds eligibility gate</div>
                </div>
              </div>
            </div>

            {/* Chart Section */}
            <div className="card-glow rounded-2xl p-8 backdrop-blur-sm space-y-6">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 text-sm text-gg-muted mb-1">
                    <BarChart3 className="h-4 w-4" />
                    <span className="font-semibold">IL Comparison</span>
                  </div>
                  <h2 className="text-2xl font-bold">Control Pool vs Goldgard Pool</h2>
                </div>
                <Link
                  href="/demo"
                  className="group relative inline-flex h-11 items-center justify-center gap-2 rounded-xl px-6 font-semibold text-[#0A1428] overflow-hidden transition-all duration-300"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-gg-gold to-gg-gold2 group-hover:scale-105 transition-transform duration-300" />
                  <span className="relative flex items-center gap-1">
                    Add Protected Liquidity
                    <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                  </span>
                </Link>
              </div>

              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="text-sm text-gg-muted font-medium">Price Movement Scenario</div>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min={100}
                    max={2000}
                    step={50}
                    value={simMoveBps}
                    onChange={(e) => setSimMoveBps(Number(e.target.value))}
                    className="w-32 sm:w-40 accent-gg-gold"
                  />
                  <div className="text-sm font-bold text-gg-gold w-16 text-right">
                    {formatNumber(simMoveBps / 100, { maximumFractionDigits: 1 })}%
                  </div>
                </div>
              </div>

              <div className="h-[22rem] sm:h-96 rounded-xl border border-gg-border/50 bg-gradient-to-b from-[#0a0f1a]/60 to-[#0a0f1a]/30 p-4 backdrop-blur-sm">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ left: 8, right: 8, top: 12, bottom: 8 }}>
                    <defs>
                      <linearGradient id="ggGoldFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#D4AF77" stopOpacity={0.28} />
                        <stop offset="60%" stopColor="#D4AF77" stopOpacity={0.06} />
                        <stop offset="100%" stopColor="#D4AF77" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="ggBloodFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#B81D2D" stopOpacity={0.22} />
                        <stop offset="60%" stopColor="#B81D2D" stopOpacity={0.06} />
                        <stop offset="100%" stopColor="#B81D2D" stopOpacity={0} />
                      </linearGradient>
                      <filter id="ggGlow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feMerge>
                          <feMergeNode in="blur" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                    </defs>

                    <CartesianGrid stroke="rgba(232,238,248,0.06)" strokeDasharray="3 6" vertical={false} />
                    <XAxis
                      dataKey="movePct"
                      tick={{ fill: "rgba(232,238,248,0.65)", fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `${formatNumber(Number(v), { maximumFractionDigits: 1 })}%`}
                    />
                    <YAxis
                      domain={[chartExtents.yMin, chartExtents.yMax]}
                      tick={{ fill: "rgba(232,238,248,0.65)", fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `${formatNumber(Number(v), { maximumFractionDigits: 1 })}%`}
                      width={56}
                    />
                    <Tooltip content={<IlTooltip />} cursor={{ stroke: "rgba(212,175,119,0.35)", strokeWidth: 1 }} />
                    <Area
                      type="monotone"
                      dataKey="ilPct"
                      stroke="#B81D2D"
                      strokeWidth={2.5}
                      fill="url(#ggBloodFill)"
                      fillOpacity={1}
                      isAnimationActive
                      animationDuration={650}
                      dot={false}
                      activeDot={{ r: 5, stroke: "rgba(184,29,45,0.35)", strokeWidth: 8, fill: "#0A1428" }}
                      style={{ filter: "url(#ggGlow)" }}
                    />
                    <Area
                      type="monotone"
                      dataKey="protectedIlPct"
                      stroke="#D4AF77"
                      strokeWidth={2.5}
                      fill="url(#ggGoldFill)"
                      fillOpacity={1}
                      isAnimationActive
                      animationDuration={650}
                      dot={false}
                      activeDot={{ r: 5, stroke: "rgba(212,175,119,0.35)", strokeWidth: 8, fill: "#0A1428" }}
                      style={{ filter: "url(#ggGlow)" }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Chart Legend */}
              <div className="grid gap-3 md:grid-cols-2 pt-4 border-t border-gg-border/30">
                <div className="flex items-center gap-3 text-sm">
                  <div className="h-1 w-8 bg-gg-blood rounded-full" />
                  <span className="text-gg-muted">Unprotected IL (%)</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="h-1 w-8 bg-gg-gold rounded-full" />
                  <span className="text-gg-muted">Goldgard Protected IL (%)</span>
                </div>
              </div>
            </div>
          </section>

          {/* Sidebar */}
          <aside className="md:col-span-4 space-y-6">
            {/* Contract Info */}
            <div className="card-glow rounded-2xl p-6 backdrop-blur-sm space-y-6">
              <div>
                <div className="text-xs font-semibold text-gg-muted uppercase tracking-wider">Active Network</div>
                <div className="mt-2 text-2xl font-bold">
                  <span className="gradient-text">{networkLabel}</span>
                </div>
              </div>

              <div className="space-y-3 border-t border-gg-border/30 pt-6">
                {[
                  { label: "Hook", value: cfg.hook },
                  { label: "PoolManager", value: cfg.poolManager },
                  { label: "SafetyModule", value: cfg.safetyModule },
                  { label: "HedgeReserve", value: cfg.hedgeReserve },
                  { label: "Rewards", value: cfg.rewards },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-3 group">
                    <span className="text-xs text-gg-muted font-medium">{item.label}</span>
                    <span className="font-mono text-xs text-gg-gold group-hover:text-gg-gold2 transition-colors cursor-pointer">
                      {shortAddr(item.value)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-gg-border/50 bg-gg-gold/5 p-4 text-xs text-gg-muted leading-relaxed">
                <p className="font-semibold text-foreground mb-2">Local Deployment</p>
                To deploy locally, run the Foundry deploy script from the <span className="font-mono">contracts</span> folder. It writes a fresh config into <span className="font-mono">demoConfig.local.json</span>.
              </div>
            </div>

            {/* Simulation */}
            <div className="card-glow rounded-2xl p-6 backdrop-blur-sm space-y-4">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-gg-gold" />
                <h3 className="font-semibold">On-Chain Simulation</h3>
              </div>

              <button
                onClick={async () => {
                  setSimBusy(true);
                  setSimLog(null);
                  try {
                    const res = await fetch("/api/simulate", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ chainId, directionUp: true, moveBps: 1000, steps: 5 }),
                    });
                    const json = (await res.json()) as { ok: boolean; stdout?: string; stderr?: string; error?: string };
                    if (!json.ok) throw new Error(json.error ?? "Simulation failed");
                    setSimLog([json.stdout, json.stderr].filter(Boolean).join("\n"));
                  } catch (e) {
                    setSimLog((e as Error).message);
                  } finally {
                    setSimBusy(false);
                  }
                }}
                disabled={simBusy}
                className="group relative w-full inline-flex h-11 items-center justify-center rounded-xl font-semibold text-[#0A1428] overflow-hidden transition-all duration-300 disabled:opacity-50"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-gg-gold to-gg-gold2 group-hover:scale-105 transition-transform duration-300" />
                <span className="relative">
                  {simBusy ? "Running On-chain Swing…" : "Run 10% Price Swing"}
                </span>
              </button>

              {simLog ? (
                <pre className="max-h-48 overflow-auto rounded-xl border border-gg-border/50 bg-[#0A1428]/60 p-3 text-xs text-gg-muted font-mono leading-relaxed">
                  {simLog}
                </pre>
              ) : null}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
