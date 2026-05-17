"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BarChart3, Coins, Flame, ShieldCheck, TrendingDown } from "lucide-react";
import { Display, Subhead, Body, Data, RuneStone, LeverageRune, Beacon, ForgedLines } from "@/components/DesignComponents";
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
    <div className="rounded-xl border border-gg-border/60 bg-gg-bg/85 px-4 py-3 shadow-[0_0_0_1px_rgba(212,175,119,0.18),0_12px_30px_rgba(0,0,0,0.45)] backdrop-blur">
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
    <div className="min-h-screen bg-gg-bg px-4 py-10 sm:py-16">
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-12">
          <Display variant="xl" className="mb-2">
            Shieldwall
          </Display>
          <Display variant="lg" className="gradient-text mb-6">
            Dashboard
          </Display>
          <Body className="text-gg-muted text-lg">
            Monitor your protected liquidity and safety module performance
          </Body>
        </div>

        <div className="grid gap-8 md:grid-cols-12">
          <section className="md:col-span-8 space-y-6">
            {/* Main Stats */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <RuneStone>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-aged-gold/20">
                    <ShieldCheck className="h-5 w-5 text-aged-gold" />
                  </div>
                  <span className="text-xs font-semibold text-gg-muted uppercase tracking-wider">Goldgard Pool TVL</span>
                </div>
                <div className="mt-4">
                  <div className="text-display text-aged-gold tabular-nums">
                    {formatTokenAmount(safetyAssets, 18, 2)}M
                  </div>
                  <div className="mt-2 text-xs text-runic-green">
                    +{formatTokenAmount(safetyAssets, 18, 2)} • last 24h
                  </div>
                </div>
              </RuneStone>

              <RuneStone>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-aged-gold/20">
                    <Coins className="h-5 w-5 text-aged-gold" />
                  </div>
                  <span className="text-xs font-semibold text-gg-muted uppercase tracking-wider">Safety Module Balance</span>
                </div>
                <div className="mt-4">
                  <div className="text-display text-aged-gold tabular-nums">
                    ${formatTokenAmount(safetyAssets, 18, 3)}
                  </div>
                  <div className="mt-2 text-xs text-gg-muted">
                    premium accrued (24h)
                  </div>
                </div>
              </RuneStone>

              <RuneStone>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-aged-gold/20">
                    <TrendingDown className="h-5 w-5 text-aged-gold" />
                  </div>
                  <span className="text-xs font-semibold text-gg-muted uppercase tracking-wider">Total IL Insured</span>
                </div>
                <div className="mt-4">
                  <div className="text-display text-aged-gold tabular-nums">
                    $11,940
                  </div>
                  <div className="mt-2 text-xs text-gg-muted">
                    3 claims paid • avg payout $3,980
                  </div>
                </div>
              </RuneStone>
            </div>

            {/* Chart Section */}
            <div className="rune-stone space-y-6">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 text-sm text-gg-muted mb-1">
                    <BarChart3 className="h-4 w-4" />
                    <span className="font-semibold">IL Comparison</span>
                  </div>
                  <Display variant="lg" className="mt-2">Pool Value Through Simulated 10% Price Swing</Display>
                </div>
                <Beacon status="active" label="Live" />
              </div>

              <Body className="text-gg-muted">
                vETH / USDC pool · 30-minute window · 1,000 swap synthetic stress test
              </Body>

              <ForgedLines />

              <div className="h-[22rem] sm:h-96 rounded-xl border border-gg-border/50 bg-gg-surface/30 p-4 backdrop-blur-sm">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ left: 8, right: 8, top: 12, bottom: 8 }}>
                    <defs>
                      <linearGradient id="ggGoldFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#D4AF77" stopOpacity={0.28} />
                        <stop offset="60%" stopColor="#D4AF77" stopOpacity={0.06} />
                        <stop offset="100%" stopColor="#D4AF77" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="ggPaleGoldFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#F2DB9F" stopOpacity={0.26} />
                        <stop offset="60%" stopColor="#F2DB9F" stopOpacity={0.05} />
                        <stop offset="100%" stopColor="#F2DB9F" stopOpacity={0} />
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
                      tick={{ fill: "rgba(245,227,166,0.85)", fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `${formatNumber(Number(v), { maximumFractionDigits: 1 })}%`}
                    />
                    <YAxis
                      domain={[chartExtents.yMin, chartExtents.yMax]}
                      tick={{ fill: "rgba(245,227,166,0.85)", fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `${formatNumber(Number(v), { maximumFractionDigits: 1 })}%`}
                      width={56}
                    />
                    <Tooltip content={<IlTooltip />} cursor={{ stroke: "rgba(212,175,119,0.35)", strokeWidth: 1 }} />
                    <Area
                      type="monotone"
                      dataKey="ilPct"
                      stroke="#d4af77"
                      strokeWidth={2.5}
                      fill="url(#ggGoldFill)"
                      fillOpacity={1}
                      isAnimationActive
                      animationDuration={650}
                      dot={false}
                      activeDot={{ r: 5, stroke: "rgba(245,227,166,0.35)", strokeWidth: 8, fill: "#0B0602" }}
                      style={{ filter: "url(#ggGlow)" }}
                    />
                    <Area
                      type="monotone"
                      dataKey="protectedIlPct"
                      stroke="#F2DB9F"
                      strokeWidth={2.5}
                      fill="url(#ggPaleGoldFill)"
                      fillOpacity={1}
                      isAnimationActive
                      animationDuration={650}
                      dot={false}
                      activeDot={{ r: 5, stroke: "rgba(245,227,166,0.35)", strokeWidth: 8, fill: "#0B0602" }}
                      style={{ filter: "url(#ggGlow)" }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Chart Legend */}
              <div className="grid gap-6 md:grid-cols-2 pt-4 border-t border-gg-border/30">
                <div>
                  <Data className="block mb-3 text-gg-muted uppercase text-xs">Goldgard LP</Data>
                  <div className="text-display text-aged-gold">${formatNumber(964290, { maximumFractionDigits: 0 })}</div>
                  <div className="mt-1 text-xs text-runic-green">$1,001,420 (99.86%)</div>
                </div>
                <div>
                  <Data className="block mb-3 text-gg-muted uppercase text-xs">Control LP (Vanilla V4)</Data>
                  <div className="text-display text-cold-steel">${formatNumber(964290, { maximumFractionDigits: 0 })}</div>
                  <div className="mt-1 text-xs text-ember-red">(96.4% · -3.57% IL)</div>
                </div>
              </div>
            </div>
          </section>

          {/* Sidebar */}
          <aside className="md:col-span-4 space-y-6">
            {/* Active Position */}
            <RuneStone>
              <div className="flex items-center justify-between mb-4">
                <Subhead className="text-lg">Active Position</Subhead>
                <Beacon status="active" label="Position #418" />
              </div>

              <div className="space-y-4 mt-6">
                <div>
                  <Data className="text-gg-muted block mb-2">vETH / USDC · tick range -400 to +400</Data>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Data className="text-gg-muted block mb-1 text-xs">Current value</Data>
                    <div className="text-lg font-bold text-aged-gold">$48,210.72</div>
                  </div>
                  <div>
                    <Data className="text-gg-muted block mb-1 text-xs">HODL value</Data>
                    <div className="text-lg font-bold text-gg-muted">$48,278.10</div>
                  </div>
                </div>

                <ForgedLines />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Data className="text-gg-muted block mb-1 text-xs">In-range</Data>
                    <div className="text-lg font-bold">94.6%</div>
                  </div>
                  <div>
                    <Data className="text-gg-muted block mb-1 text-xs">vETH staking yield</Data>
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-bold text-runic-green">+ 3.42%</span>
                      <span className="text-xs text-gg-muted">APR</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Data className="text-gg-muted block mb-1 text-xs">Swap fees accrued</Data>
                    <div className="text-lg font-bold text-aged-gold">$182.14</div>
                  </div>
                  <div>
                    <Data className="text-gg-muted block mb-1 text-xs">GGARD claimable</Data>
                    <div className="text-lg font-bold">1,420.18</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Data className="text-gg-muted block mb-1 text-xs">Coverage cap</Data>
                    <div className="text-lg font-bold text-aged-gold">$964.20</div>
                  </div>
                </div>
              </div>

              <LeverageRune className="w-full mt-6 justify-center">
                Withdraw + Claim
              </LeverageRune>
            </RuneStone>
          </aside>
        </div>
      </div>
    </div>
  );
}
