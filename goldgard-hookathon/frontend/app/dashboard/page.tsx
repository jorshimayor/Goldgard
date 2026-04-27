"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, Coins, ShieldCheck, TrendingDown } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAccount, useReadContract } from "wagmi";

import { getDemoConfig, isConfiguredAddress } from "../../lib/demoConfig";
import { shortAddr } from "../../lib/format";
import { safetyModuleAbi } from "../../lib/abi/safetyModule";
import { rewardDistributorAbi } from "../../lib/abi/rewardDistributor";

type Point = { step: number; control: number; protected: number };

function computeILBps(r: number) {
  const sqrtR = Math.sqrt(r);
  const factor = (2 * sqrtR) / (1 + r);
  return Math.max(0, (1 - factor) * 10_000);
}

export default function DashboardPage() {
  const cfg = useMemo(() => getDemoConfig(), []);
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
      const control = 10_000 - ilBps;
      const protectedValue = 10_000 - Math.max(0, ilBps - 350);
      points.push({ step: i, control, protected: protectedValue });
    }
    return points;
  }, [simMoveBps]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10">
      <div className="grid gap-6 md:grid-cols-12">
        <section className="md:col-span-8">
          <div className="rounded-3xl border border-gg-border bg-gg-surface p-6 shadow-gg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm text-gg-muted">Shieldwall Dashboard</div>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight">Control Pool vs Goldgard Pool</h2>
              </div>
              <Link
                href="/demo"
                className="inline-flex h-10 items-center justify-center rounded-xl bg-gg-gold px-4 text-sm font-semibold text-[#0A1428] hover:bg-gg-gold-2"
              >
                Add Protected Liquidity
              </Link>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-gg-border bg-gg-surface p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <ShieldCheck className="h-4 w-4 text-gg-gold" /> Safety Module
                </div>
                <div className="mt-2 text-2xl font-semibold">
                  {safetyAssets !== undefined ? Number(safetyAssets) / 1e18 : "—"}
                </div>
                <div className="mt-1 text-xs text-gg-muted">Total assets (demo units)</div>
              </div>

              <div className="rounded-2xl border border-gg-border bg-gg-surface p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Coins className="h-4 w-4 text-gg-gold" /> GGARD Rewards
                </div>
                <div className="mt-2 text-2xl font-semibold">
                  {ggardBalance !== undefined ? Number(ggardBalance) / 1e18 : "—"}
                </div>
                <div className="mt-1 text-xs text-gg-muted">Claimable ERC-6909 balance</div>
              </div>

              <div className="rounded-2xl border border-gg-border bg-gg-surface p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <TrendingDown className="h-4 w-4 text-gg-blood" /> IL Protection
                </div>
                <div className="mt-2 text-2xl font-semibold">80%+</div>
                <div className="mt-1 text-xs text-gg-muted">Liquidity-seconds eligibility gate</div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-sm text-gg-muted">
                <BarChart3 className="h-4 w-4" />
                IL vs Protected Value (simulated)
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={100}
                  max={2000}
                  step={50}
                  value={simMoveBps}
                  onChange={(e) => setSimMoveBps(Number(e.target.value))}
                />
                <div className="w-20 text-right text-xs text-gg-muted">{(simMoveBps / 100).toFixed(1)}%</div>
              </div>
            </div>

            <div className="mt-4 h-72 rounded-2xl border border-gg-border bg-gg-surface p-3">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis dataKey="step" hide />
                  <YAxis domain={[9400, 10000]} tick={{ fill: "rgba(232,238,248,0.65)", fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(10,20,40,0.9)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 12,
                      color: "#E8EEF8",
                    }}
                  />
                  <Line type="monotone" dataKey="control" stroke="#B81D2D" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="protected" stroke="#D4AF77" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        <aside className="md:col-span-4">
          <div className="rounded-3xl border border-gg-border bg-gg-surface p-6 shadow-gg">
            <div className="text-sm text-gg-muted">Contract Set</div>
            <div className="mt-1 text-xl font-semibold tracking-tight">Sepolia / Local Demo</div>

            <div className="mt-5 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-gg-muted">Hook</span>
                <span className="font-mono">{shortAddr(cfg.hook)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-gg-muted">PoolManager</span>
                <span className="font-mono">{shortAddr(cfg.poolManager)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-gg-muted">SafetyModule</span>
                <span className="font-mono">{shortAddr(cfg.safetyModule)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-gg-muted">HedgeReserve</span>
                <span className="font-mono">{shortAddr(cfg.hedgeReserve)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-gg-muted">Rewards</span>
                <span className="font-mono">{shortAddr(cfg.rewards)}</span>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-gg-border bg-gg-surface p-4 text-sm text-gg-muted">
              To deploy locally, run the Foundry deploy script from the contracts folder. It writes a fresh
              config into <span className="font-mono">app/config/demoConfig.local.json</span>.
            </div>

            <button
              onClick={async () => {
                setSimBusy(true);
                setSimLog(null);
                try {
                  const res = await fetch("/api/simulate", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ directionUp: true, moveBps: 1000, steps: 5 }),
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
              className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl bg-gg-gold text-sm font-semibold text-[#0A1428] hover:bg-gg-gold-2 disabled:opacity-40"
              disabled={simBusy}
            >
              {simBusy ? "Running On-chain Swing…" : "Run 10% Swing (Local)"}
            </button>

            {simLog ? (
              <pre className="mt-4 max-h-56 overflow-auto rounded-2xl border border-gg-border bg-[#0A1428]/40 p-3 text-xs text-gg-muted">
                {simLog}
              </pre>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
