"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BarChart3, Coins, FileText, Network, Play, ShieldCheck, X, Zap } from "lucide-react";
import { Display, Subhead, Body, Data, RuneStone, Beacon, ForgedLines } from "@/components/DesignComponents";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAccount, useBlockNumber, useChainId, useGasPrice, useReadContract, useSwitchChain } from "wagmi";
import { formatUnits } from "viem";

import { getDemoConfigForChain, isConfiguredAddress } from "../../lib/demoConfig";
import { formatNumber } from "../../lib/format";
import { goldgardHookAbi } from "../../lib/abi/goldgardHook";
import { safetyModuleAbi } from "../../lib/abi/safetyModule";
import { rewardDistributorAbi } from "../../lib/abi/rewardDistributor";
import { erc20Abi } from "../../lib/abi/erc20";
import { chainLabel, rpcWsUrl, supportedChains } from "../../lib/networks";
import { useEventStream } from "../../lib/eventStream";

type SeriesPoint = { t: number; value: number };
type InsuranceSimulationReport = {
  metrics?: {
    premiumCollectedUnits?: number;
    paidPayoutUnits?: number;
    lossCoverageRatio?: number;
    reactiveActivationSuccessRate?: number;
  };
  claims?: {
    generatedLossEvents?: number;
    paid?: number;
    pending?: number;
  };
  validation?: {
    pass?: boolean;
  };
  eventsLogged?: number;
};

function toPositiveInt(value: string, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function toPositiveNumber(value: string, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function formatDecimalString(value: string, maxFractionDigits: number) {
  const [rawInt, rawFrac = ""] = value.split(".");
  const intPart = rawInt.replace(/^(-?)0+(?=\d)/, "$1");

  const fracPart = rawFrac.slice(0, Math.max(0, maxFractionDigits)).replace(/0+$/, "");
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (!fracPart) return withCommas;
  return `${withCommas}.${fracPart}`;
}

function formatTokenAmount(value: bigint | undefined, decimals: number | undefined, maxFractionDigits = 4) {
  if (value === undefined || decimals === undefined) return "—";
  return formatDecimalString(formatUnits(value, decimals), maxFractionDigits);
}

function formatBigIntUnits(value: bigint | undefined) {
  if (value === undefined) return "—";
  const s = value.toString();
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function SeriesTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: SeriesPoint }>;
}) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="rounded-xl border border-gg-border/60 bg-gg-bg/85 px-4 py-3 shadow-[0_0_0_1px_rgba(212,175,119,0.18),0_12px_30px_rgba(0,0,0,0.45)] backdrop-blur">
      <div className="text-xs font-semibold text-gg-muted mb-1">
        {new Date(p.t).toLocaleTimeString()}
      </div>
      <div className="text-sm tabular-nums font-semibold text-foreground">
        {formatNumber(p.value, { maximumFractionDigits: 4 })}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const walletChainId = useChainId();
  const searchParams = useSearchParams();
  const viewChainId = useMemo(() => {
    const raw = searchParams.get("chainId");
    const requested = raw ? Number(raw) : 11155111;
    if (Number.isFinite(requested) && supportedChains.some((c) => c.id === requested)) return requested;
    return 11155111;
  }, [searchParams]);
  const cfg = useMemo(() => getDemoConfigForChain(viewChainId), [viewChainId]);
  const { address, isConnected } = useAccount();
  const { switchChain } = useSwitchChain();

  const [rpcHealthy, setRpcHealthy] = useState<boolean | null>(null);
  const [rpcError, setRpcError] = useState<string | null>(null);
  const healthTimer = useRef<number | null>(null);
  const [wsHealthy, setWsHealthy] = useState<boolean | null>(null);
  const [wsBlockNumber, setWsBlockNumber] = useState<bigint | null>(null);
  const [syncStalled, setSyncStalled] = useState(false);
  const lastBlockSeenAt = useRef<number | null>(null);

  useEffect(() => {
    if (!isConnected) return;
    if (walletChainId === viewChainId) return;
    switchChain({ chainId: viewChainId });
  }, [isConnected, switchChain, viewChainId, walletChainId]);

  const { data: blockNumber } = useBlockNumber({
    chainId: viewChainId,
    watch: true,
    query: { refetchInterval: 4_000 },
  });

  const { data: gasPrice } = useGasPrice({
    chainId: viewChainId,
    query: { refetchInterval: 5_000 },
  });

  const { data: safetyAsset } = useReadContract({
    abi: safetyModuleAbi,
    chainId: viewChainId,
    address: isConfiguredAddress(cfg.safetyModule) ? (cfg.safetyModule as `0x${string}`) : undefined,
    functionName: "asset",
    query: { enabled: isConfiguredAddress(cfg.safetyModule), refetchInterval: 60_000 },
  });

  const { data: safetyAssetDecimals } = useReadContract({
    abi: erc20Abi,
    chainId: viewChainId,
    address: safetyAsset ? (safetyAsset as `0x${string}`) : undefined,
    functionName: "decimals",
    query: { enabled: Boolean(safetyAsset), refetchInterval: 60_000 },
  });

  const { data: safetyAssetSymbol } = useReadContract({
    abi: erc20Abi,
    chainId: viewChainId,
    address: safetyAsset ? (safetyAsset as `0x${string}`) : undefined,
    functionName: "symbol",
    query: { enabled: Boolean(safetyAsset), refetchInterval: 60_000 },
  });

  const { data: safetyAssets } = useReadContract({
    abi: safetyModuleAbi,
    chainId: viewChainId,
    address: isConfiguredAddress(cfg.safetyModule) ? (cfg.safetyModule as `0x${string}`) : undefined,
    functionName: "totalAssets",
    query: { enabled: isConfiguredAddress(cfg.safetyModule), refetchInterval: 4_000 },
  });

  const { data: reactiveAlert } = useReadContract({
    abi: goldgardHookAbi,
    chainId: viewChainId,
    address: isConfiguredAddress(cfg.hook) ? (cfg.hook as `0x${string}`) : undefined,
    functionName: "getReactiveAlert",
    query: { enabled: isConfiguredAddress(cfg.hook), refetchInterval: 4_000 },
  });

  const { data: premiumBps } = useReadContract({
    abi: goldgardHookAbi,
    chainId: viewChainId,
    address: isConfiguredAddress(cfg.hook) ? (cfg.hook as `0x${string}`) : undefined,
    functionName: "premiumBps",
    query: { enabled: isConfiguredAddress(cfg.hook), refetchInterval: 5_000 },
  });

  const { data: coverageCapBps } = useReadContract({
    abi: goldgardHookAbi,
    chainId: viewChainId,
    address: isConfiguredAddress(cfg.hook) ? (cfg.hook as `0x${string}`) : undefined,
    functionName: "coverageCapBps",
    query: { enabled: isConfiguredAddress(cfg.hook), refetchInterval: 5_000 },
  });

  const { data: ggardId } = useReadContract({
    abi: rewardDistributorAbi,
    chainId: viewChainId,
    address: isConfiguredAddress(cfg.rewards) ? (cfg.rewards as `0x${string}`) : undefined,
    functionName: "GGARD_ID",
    query: { enabled: isConfiguredAddress(cfg.rewards), refetchInterval: 30_000 },
  });

  const { data: ggardBalance } = useReadContract({
    abi: rewardDistributorAbi,
    chainId: viewChainId,
    address: isConfiguredAddress(cfg.rewards) ? (cfg.rewards as `0x${string}`) : undefined,
    functionName: "balanceOf",
    args: address && ggardId !== undefined ? [address, ggardId] : undefined,
    query: { enabled: Boolean(address && ggardId !== undefined && isConfiguredAddress(cfg.rewards)), refetchInterval: 5_000 },
  });

  const { data: token0Decimals } = useReadContract({
    abi: erc20Abi,
    chainId: viewChainId,
    address: isConfiguredAddress(cfg.token0) ? (cfg.token0 as `0x${string}`) : undefined,
    functionName: "decimals",
    query: { enabled: isConfiguredAddress(cfg.token0), refetchInterval: 60_000 },
  });

  const { data: token0Symbol } = useReadContract({
    abi: erc20Abi,
    chainId: viewChainId,
    address: isConfiguredAddress(cfg.token0) ? (cfg.token0 as `0x${string}`) : undefined,
    functionName: "symbol",
    query: { enabled: isConfiguredAddress(cfg.token0), refetchInterval: 60_000 },
  });

  const { data: token0Balance } = useReadContract({
    abi: erc20Abi,
    chainId: viewChainId,
    address: isConfiguredAddress(cfg.token0) ? (cfg.token0 as `0x${string}`) : undefined,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && isConfiguredAddress(cfg.token0)), refetchInterval: 5_000 },
  });

  const { data: token1Decimals } = useReadContract({
    abi: erc20Abi,
    chainId: viewChainId,
    address: isConfiguredAddress(cfg.token1) ? (cfg.token1 as `0x${string}`) : undefined,
    functionName: "decimals",
    query: { enabled: isConfiguredAddress(cfg.token1), refetchInterval: 60_000 },
  });

  const { data: token1Symbol } = useReadContract({
    abi: erc20Abi,
    chainId: viewChainId,
    address: isConfiguredAddress(cfg.token1) ? (cfg.token1 as `0x${string}`) : undefined,
    functionName: "symbol",
    query: { enabled: isConfiguredAddress(cfg.token1), refetchInterval: 60_000 },
  });

  const { data: token1Balance } = useReadContract({
    abi: erc20Abi,
    chainId: viewChainId,
    address: isConfiguredAddress(cfg.token1) ? (cfg.token1 as `0x${string}`) : undefined,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && isConfiguredAddress(cfg.token1)), refetchInterval: 5_000 },
  });

  const eventStream = useEventStream(viewChainId, { enabled: true, keepLast: 25, pollMs: 1500 });
  const [eventAlertLevel, setEventAlertLevel] = useState<number | null>(null);
  const [eventAlertUntil, setEventAlertUntil] = useState<bigint | null>(null);

  useEffect(() => {
    const top = eventStream.logs[0];
    if (!top) return;
    if (top.eventName !== "AlertLevelRaised") return;
    const args = top.args as unknown;

    const levelRaw =
      args && typeof args === "object" && "level" in args
        ? (args as { level?: unknown }).level
        : Array.isArray(args)
          ? args[0]
          : undefined;

    const untilRaw =
      args && typeof args === "object" && "until" in args
        ? (args as { until?: unknown }).until
        : Array.isArray(args)
          ? args[1]
          : undefined;

    const level = Number(levelRaw);
    try {
      const until = BigInt(String(untilRaw ?? "0"));
      if (Number.isFinite(level) && level >= 0 && level <= 255) {
        setEventAlertLevel(level);
        setEventAlertUntil(until);
      }
    } catch {
    }
  }, [eventStream.logs]);

  const alertLevel = eventAlertLevel ?? (reactiveAlert?.[0] ?? 0);
  const alertUntil = eventAlertUntil ?? (reactiveAlert?.[1] ?? 0n);
  const alertActive = alertLevel > 0 && BigInt(Math.floor(Date.now() / 1000)) < alertUntil;

  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [insurancePeriods, setInsurancePeriods] = useState("12");
  const [insurancePolicyCount, setInsurancePolicyCount] = useState("120");
  const [insuranceLambda, setInsuranceLambda] = useState("3.2");
  const [insurancePremiumBps, setInsurancePremiumBps] = useState("2");
  const [insuranceBusy, setInsuranceBusy] = useState(false);
  const [insuranceError, setInsuranceError] = useState<string | null>(null);
  const [insuranceReport, setInsuranceReport] = useState<InsuranceSimulationReport | null>(null);
  const [insuranceMarkdown, setInsuranceMarkdown] = useState<string>("");
  const [insuranceModalOpen, setInsuranceModalOpen] = useState(false);
  useEffect(() => {
    if (safetyAssets === undefined) return;
    if (safetyAssetDecimals === undefined) return;

    const now = Date.now();
    const value = Number(formatUnits(safetyAssets, safetyAssetDecimals));
    const cadenceMs = 5_000;

    setSeries((prev) => {
      if (prev.length === 0) {
        const seeded = Array.from({ length: 12 }, (_, index) => ({
          t: now - (11 - index) * cadenceMs,
          value,
        }));
        return seeded;
      }

      const last = prev[prev.length - 1];
      if (last && now - last.t < 3_000) return prev;

      const cutoff = now - 10 * 60 * 1000;
      const next = [...prev, { t: now, value }];
      return next.filter((point) => point.t >= cutoff);
    });
  }, [blockNumber, wsBlockNumber, safetyAssets, safetyAssetDecimals]);

  const seriesDomain = useMemo<[number, number]>(() => {
    if (series.length === 0) return [0, 1];

    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const point of series) {
      if (point.value < min) min = point.value;
      if (point.value > max) max = point.value;
    }

    if (min === max) {
      const pad = Math.max(Math.abs(max) * 0.02, 1);
      return [min - pad, max + pad];
    }

    const pad = (max - min) * 0.1;
    return [min - pad, max + pad];
  }, [series]);

  useEffect(() => {
    async function checkHealth() {
      try {
        const res = await fetch(`/api/rpc/${viewChainId}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
          cache: "no-store",
        });
        const json = (await res.json()) as { result?: string; error?: { message?: string } };
        if (!res.ok) throw new Error(json.error?.message ?? "RPC error");
        const got = Number.parseInt(String(json.result ?? "0x0"), 16);
        if (got !== viewChainId) throw new Error(`RPC returned chainId ${got}`);
        setRpcHealthy(true);
        setRpcError(null);
        try {
          const b = await fetch(`/api/rpc/${viewChainId}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
            cache: "no-store",
          });
          const bj = (await b.json()) as { result?: string; error?: { message?: string } };
          if (!b.ok) throw new Error(bj.error?.message ?? "RPC error");
          if (typeof bj.result !== "string" || !bj.result.startsWith("0x")) throw new Error("RPC bad blockNumber");
          lastBlockSeenAt.current = Date.now();
          setSyncStalled(false);
        } catch (e) {
          setSyncStalled(true);
          setRpcError((e as Error).message);
        }
      } catch (e) {
        setRpcHealthy(false);
        setRpcError((e as Error).message);
      }
    }

    void checkHealth();
    if (healthTimer.current) window.clearInterval(healthTimer.current);
    healthTimer.current = window.setInterval(() => void checkHealth(), 10_000);
    return () => {
      if (healthTimer.current) window.clearInterval(healthTimer.current);
      healthTimer.current = null;
    };
  }, [viewChainId]);

  async function runInsuranceScenario() {
    setInsuranceBusy(true);
    setInsuranceError(null);
    try {
      const res = await fetch("/api/insurance-simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          config: {
            periods: toPositiveInt(insurancePeriods, 12),
            portfolio: {
              policyCount: toPositiveInt(insurancePolicyCount, 120),
            },
            frequency: {
              distribution: "poisson",
              lambda: toPositiveNumber(insuranceLambda, 3.2),
            },
            premiumRules: {
              basePremiumBps: toPositiveInt(insurancePremiumBps, 2),
            },
          },
        }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        error?: string;
        report?: InsuranceSimulationReport;
        markdown?: string;
      };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Insurance simulation failed.");
      setInsuranceReport(json.report ?? null);
      setInsuranceMarkdown(json.markdown ?? "");
    } catch (e) {
      setInsuranceError((e as Error).message);
    } finally {
      setInsuranceBusy(false);
    }
  }

  useEffect(() => {
    const bn = wsBlockNumber ?? blockNumber;
    if (bn === undefined || bn === null) return;
    lastBlockSeenAt.current = Date.now();
    setSyncStalled(false);
  }, [blockNumber, wsBlockNumber]);

  useEffect(() => {
    const t = window.setInterval(() => {
      if (rpcHealthy === false) return;
      if (!lastBlockSeenAt.current) return;
      if (Date.now() - lastBlockSeenAt.current > 30_000) setSyncStalled(true);
    }, 5_000);
    return () => window.clearInterval(t);
  }, [rpcHealthy]);

  useEffect(() => {
    const url = rpcWsUrl(viewChainId);
    if (!url) {
      setWsHealthy(null);
      setWsBlockNumber(null);
      return;
    }

    let socket: WebSocket | null = null;
    let alive = true;
    let subscribeId: string | null = null;

    try {
      socket = new WebSocket(url);
    } catch {
      setWsHealthy(false);
      return;
    }

    socket.onopen = () => {
      if (!alive || !socket) return;
      setWsHealthy(true);
      socket.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_subscribe", params: ["newHeads"] }));
    };

    socket.onmessage = (ev) => {
      if (!alive) return;
      try {
        const msg = JSON.parse(String(ev.data)) as {
          id?: number;
          result?: string;
          params?: { subscription?: string; result?: { number?: string } };
        };
        if (msg.id === 1 && typeof msg.result === "string") {
          subscribeId = msg.result;
          return;
        }
        const hex = msg.params?.result?.number;
        if (typeof hex === "string" && hex.startsWith("0x")) {
          setWsBlockNumber(BigInt(hex));
        }
      } catch {
      }
    };

    socket.onerror = () => {
      if (!alive) return;
      setWsHealthy(false);
    };

    socket.onclose = () => {
      if (!alive) return;
      setWsHealthy(false);
    };

    return () => {
      alive = false;
      try {
        if (socket && subscribeId) {
          socket.send(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "eth_unsubscribe", params: [subscribeId] }));
        }
      } catch {
      }
      try {
        socket?.close();
      } catch {
      }
    };
  }, [viewChainId]);

  const walletMismatch = isConnected && walletChainId !== viewChainId;

  return (
    <div className="min-h-screen bg-gg-bg px-4 py-10 sm:py-16">
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-12">
          <Display variant="xl" className="mb-2">
            Shieldwall
          </Display>
          <Body className="text-gg-muted text-lg">
            Live network telemetry and protocol status
          </Body>
          <div className="mt-6 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2 rounded-xl border border-gg-border/60 bg-gg-surface/40 px-3 py-2 backdrop-blur-sm">
              <Network className="h-4 w-4 text-aged-gold" />
              <div className="bg-transparent text-sm font-semibold text-foreground" data-testid="network-select">
                {chainLabel(viewChainId)}
              </div>
            </div>

            <Beacon
              data-testid="rpc-status"
              status={rpcHealthy === false || syncStalled ? "warning" : "active"}
              label={rpcHealthy === false ? "RPC degraded" : syncStalled ? "Sync stalled" : "RPC ok"}
            />
            {wsHealthy !== null ? (
              <Beacon
                data-testid="ws-status"
                status={wsHealthy ? "active" : "warning"}
                label={wsHealthy ? "WS ok" : "WS off"}
              />
            ) : null}
            <Beacon
              data-testid="events-status"
              status={eventStream.healthy ? "active" : eventStream.error ? "warning" : "neutral"}
              label={eventStream.healthy ? "Events ok" : eventStream.error ? "Events degraded" : "Events off"}
            />
            {walletMismatch ? <Beacon data-testid="wallet-mismatch" status="warning" label="Wallet mismatch" /> : null}
            {rpcError ? (
              <Data className="text-xs text-ember-red">{rpcError}</Data>
            ) : null}

            <div
              className={[
                "relative h-10 w-10 rounded-xl border bg-gg-surface/40 backdrop-blur-sm grid place-items-center",
                alertActive
                  ? "border-aged-gold/60 shadow-[0_0_0_1px_rgba(212,175,119,0.25),0_0_40px_rgba(212,175,119,0.22)]"
                  : "border-gg-border/60",
              ].join(" ")}
            >
              <span
                className={[
                  "text-lg font-semibold select-none",
                  alertActive ? "text-aged-gold animate-pulse" : "text-gg-muted",
                ].join(" ")}
              >
                ᚱ
              </span>
            </div>
            <div className="min-w-[12rem]">
              <div className="text-xs font-semibold text-gg-muted uppercase tracking-wider">Reactive Sentinel</div>
              <div className={alertActive ? "text-aged-gold font-semibold" : "text-gg-muted font-semibold"}>
                {alertActive ? `Alert level ${alertLevel}` : "Quiet"}
              </div>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <Data className="text-xs text-gg-muted">
                block{" "}
                <span className="text-foreground tabular-nums" data-testid="block-number">
                  {wsBlockNumber ?? blockNumber ?? "—"}
                </span>
              </Data>
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-aged-gold" />
                <Data className="text-xs tabular-nums">
                  {gasPrice !== undefined ? `${formatDecimalString(formatUnits(gasPrice, 9), 2)} gwei` : "—"}
                </Data>
              </div>
            </div>
          </div>
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
                  <span className="text-xs font-semibold text-gg-muted uppercase tracking-wider">SafetyModule Assets</span>
                </div>
                <div className="mt-4">
                  <div className="text-display text-aged-gold tabular-nums">
                    {formatTokenAmount(safetyAssets, safetyAssetDecimals, 4)}
                  </div>
                  <div className="mt-2 text-xs text-runic-green">
                    {safetyAssetSymbol ? `live (${safetyAssetSymbol})` : "live"}
                  </div>
                </div>
              </RuneStone>

              <RuneStone>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-aged-gold/20">
                    <Coins className="h-5 w-5 text-aged-gold" />
                  </div>
                  <span className="text-xs font-semibold text-gg-muted uppercase tracking-wider">GGARD Balance</span>
                </div>
                <div className="mt-4">
                  <div className="text-display text-aged-gold tabular-nums">
                    {formatBigIntUnits(ggardBalance)}
                  </div>
                  <div className="mt-2 text-xs text-gg-muted">
                    connected wallet (raw units)
                  </div>
                </div>
              </RuneStone>

              <RuneStone>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-aged-gold/20">
                    <BarChart3 className="h-5 w-5 text-aged-gold" />
                  </div>
                  <span className="text-xs font-semibold text-gg-muted uppercase tracking-wider">Policy Params</span>
                </div>
                <div className="mt-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-4">
                      <Data className="text-gg-muted">premiumBps</Data>
                      <Data className="tabular-nums">{premiumBps !== undefined ? String(premiumBps) : "—"}</Data>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <Data className="text-gg-muted">coverageCapBps</Data>
                      <Data className="tabular-nums">{coverageCapBps !== undefined ? String(coverageCapBps) : "—"}</Data>
                    </div>
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
                    <span className="font-semibold">Reserve History</span>
                  </div>
                  <Display variant="lg" className="mt-2">Safety Module Reserve History</Display>
                </div>
                <Beacon status="active" label="Live" />
              </div>

              <Body className="text-gg-muted">
                Rolling in-memory time series from on-chain reads (updates ≤ 5s)
              </Body>

              <ForgedLines />

              <div className="h-[22rem] sm:h-96 rounded-xl border border-gg-border/50 bg-gg-surface/30 p-4 backdrop-blur-sm">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series} margin={{ left: 8, right: 8, top: 12, bottom: 8 }}>
                    <defs>
                      <linearGradient id="ggGoldFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#D4AF77" stopOpacity={0.28} />
                        <stop offset="60%" stopColor="#D4AF77" stopOpacity={0.06} />
                        <stop offset="100%" stopColor="#D4AF77" stopOpacity={0} />
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
                      dataKey="t"
                      tick={{ fill: "rgba(245,227,166,0.85)", fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => new Date(Number(v)).toLocaleTimeString()}
                    />
                    <YAxis
                      tick={{ fill: "rgba(245,227,166,0.85)", fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      domain={seriesDomain}
                      tickFormatter={(v) => formatNumber(Number(v), { maximumFractionDigits: 3 })}
                      width={56}
                    />
                    <Tooltip content={<SeriesTooltip />} cursor={{ stroke: "rgba(212,175,119,0.35)", strokeWidth: 1 }} />
                    <Area
                      type="monotone"
                      dataKey="value"
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
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* Sidebar */}
          <aside className="md:col-span-4 space-y-6">
            {/* Wallet */}
            <RuneStone>
              <div className="flex items-center justify-between mb-4">
                <Subhead className="text-lg">Wallet</Subhead>
                <Beacon status={address ? "active" : "warning"} label={address ? "Connected" : "Not connected"} />
              </div>

              <div className="space-y-4 mt-6">
                <div className="space-y-2">
                  <Data className="text-gg-muted block mb-1 text-xs">Address</Data>
                  <Data as="code" className="break-all">{address ?? "—"}</Data>
                </div>

                <ForgedLines />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Data className="text-gg-muted block mb-1 text-xs">
                      {token0Symbol ? `${token0Symbol} balance` : "token0 balance"}
                    </Data>
                    <div className="text-lg font-bold text-aged-gold tabular-nums">
                      {formatTokenAmount(token0Balance, token0Decimals, 4)}
                    </div>
                  </div>
                  <div>
                    <Data className="text-gg-muted block mb-1 text-xs">
                      {token1Symbol ? `${token1Symbol} balance` : "token1 balance"}
                    </Data>
                    <div className="text-lg font-bold text-aged-gold tabular-nums">
                      {formatTokenAmount(token1Balance, token1Decimals, 4)}
                    </div>
                  </div>
                </div>
              </div>
            </RuneStone>

            <RuneStone>
              <div className="flex items-center justify-between mb-4">
                <Subhead className="text-lg">Insurance Simulator</Subhead>
                <Beacon
                  status={insuranceBusy ? "warning" : insuranceReport ? "active" : "neutral"}
                  label={insuranceBusy ? "Running" : insuranceReport ? "Report ready" : "Idle"}
                />
              </div>

              <Body className="text-gg-muted text-sm">
                Launch the scenario builder in a modal to run stochastic insurance cases without stretching the sidebar.
              </Body>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-gg-border/50 bg-gg-surface/30 p-4">
                  <Data className="text-gg-muted block text-xs mb-1">Configured Periods</Data>
                  <div className="text-lg font-bold text-aged-gold tabular-nums">{insurancePeriods}</div>
                </div>
                <div className="rounded-xl border border-gg-border/50 bg-gg-surface/30 p-4">
                  <Data className="text-gg-muted block text-xs mb-1">Configured Policies</Data>
                  <div className="text-lg font-bold text-aged-gold tabular-nums">{insurancePolicyCount}</div>
                </div>
              </div>

              {insuranceReport ? (
                <div className="mt-4 rounded-xl border border-gg-border/50 bg-gg-surface/30 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <FileText className="h-4 w-4 text-aged-gold" />
                    Latest Report
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-gg-muted">
                    <div>Premiums: {formatNumber(insuranceReport.metrics?.premiumCollectedUnits ?? 0, { maximumFractionDigits: 2 })}</div>
                    <div>Payouts: {formatNumber(insuranceReport.metrics?.paidPayoutUnits ?? 0, { maximumFractionDigits: 2 })}</div>
                    <div>Validation: {insuranceReport.validation?.pass ? "pass" : "fail"}</div>
                  </div>
                </div>
              ) : null}

              {insuranceError ? (
                <div className="mt-4 rounded-xl border border-gg-border/50 bg-ember-red/10 p-4 text-sm text-ember-red">
                  <p className="font-semibold mb-1">Simulation Error</p>
                  {insuranceError}
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => setInsuranceModalOpen(true)}
                className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-gg-border/50 bg-gg-surface/30 px-4 text-sm font-semibold text-foreground transition-colors hover:border-aged-gold/50"
              >
                <Play className="h-4 w-4 text-aged-gold" />
                Open Scenario Builder
              </button>
            </RuneStone>
          </aside>
        </div>
      </div>

      {insuranceModalOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setInsuranceModalOpen(false)} />
          <div className="relative z-[71] max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-gg-border/60 bg-gg-bg/95 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Subhead className="text-lg">Insurance Scenario Builder</Subhead>
                <Body className="mt-2 text-gg-muted text-sm">
                  Run stochastic insurance scenarios and inspect the latest premium, payout, and reactive trigger results.
                </Body>
              </div>
              <button
                type="button"
                onClick={() => setInsuranceModalOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gg-border/50 bg-gg-surface/30 text-foreground transition-colors hover:border-aged-gold/50"
                aria-label="Close insurance scenario modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 flex items-center justify-between gap-4 flex-wrap">
              <Beacon
                status={insuranceBusy ? "warning" : insuranceReport ? "active" : "neutral"}
                label={insuranceBusy ? "Running" : insuranceReport ? "Report ready" : "Idle"}
              />
              <button
                type="button"
                onClick={() => void runInsuranceScenario()}
                disabled={insuranceBusy}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-gg-border/50 bg-gg-surface/30 px-4 text-sm font-semibold text-foreground transition-colors hover:border-aged-gold/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Play className="h-4 w-4 text-aged-gold" />
                {insuranceBusy ? "Running Scenario..." : "Run Insurance Scenario"}
              </button>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <label className="space-y-2">
                <Data className="text-gg-muted block text-xs">Periods</Data>
                <input
                  value={insurancePeriods}
                  onChange={(e) => setInsurancePeriods(e.target.value)}
                  inputMode="numeric"
                  className="h-11 w-full rounded-xl border border-gg-border/50 bg-gg-surface/30 px-4 text-sm text-foreground focus:border-aged-gold focus:outline-none"
                />
              </label>
              <label className="space-y-2">
                <Data className="text-gg-muted block text-xs">Policies</Data>
                <input
                  value={insurancePolicyCount}
                  onChange={(e) => setInsurancePolicyCount(e.target.value)}
                  inputMode="numeric"
                  className="h-11 w-full rounded-xl border border-gg-border/50 bg-gg-surface/30 px-4 text-sm text-foreground focus:border-aged-gold focus:outline-none"
                />
              </label>
              <label className="space-y-2">
                <Data className="text-gg-muted block text-xs">Frequency Lambda</Data>
                <input
                  value={insuranceLambda}
                  onChange={(e) => setInsuranceLambda(e.target.value)}
                  inputMode="decimal"
                  className="h-11 w-full rounded-xl border border-gg-border/50 bg-gg-surface/30 px-4 text-sm text-foreground focus:border-aged-gold focus:outline-none"
                />
              </label>
              <label className="space-y-2">
                <Data className="text-gg-muted block text-xs">Base Premium Bps</Data>
                <input
                  value={insurancePremiumBps}
                  onChange={(e) => setInsurancePremiumBps(e.target.value)}
                  inputMode="numeric"
                  className="h-11 w-full rounded-xl border border-gg-border/50 bg-gg-surface/30 px-4 text-sm text-foreground focus:border-aged-gold focus:outline-none"
                />
              </label>
            </div>

            {insuranceError ? (
              <div className="mt-4 rounded-xl border border-gg-border/50 bg-ember-red/10 p-4 text-sm text-ember-red">
                <p className="font-semibold mb-1">Simulation Error</p>
                {insuranceError}
              </div>
            ) : null}

            {insuranceReport ? (
              <div className="mt-6 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border border-gg-border/50 bg-gg-surface/30 p-4">
                    <Data className="text-gg-muted block text-xs mb-1">Premium Collected</Data>
                    <div className="text-lg font-bold text-aged-gold tabular-nums">
                      {formatNumber(insuranceReport.metrics?.premiumCollectedUnits ?? 0, { maximumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="rounded-xl border border-gg-border/50 bg-gg-surface/30 p-4">
                    <Data className="text-gg-muted block text-xs mb-1">Paid Payout</Data>
                    <div className="text-lg font-bold text-aged-gold tabular-nums">
                      {formatNumber(insuranceReport.metrics?.paidPayoutUnits ?? 0, { maximumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="rounded-xl border border-gg-border/50 bg-gg-surface/30 p-4">
                    <Data className="text-gg-muted block text-xs mb-1">Loss Coverage Ratio</Data>
                    <div className="text-lg font-bold text-aged-gold tabular-nums">
                      {formatNumber((insuranceReport.metrics?.lossCoverageRatio ?? 0) * 100, {
                        maximumFractionDigits: 2,
                      })}
                      %
                    </div>
                  </div>
                  <div className="rounded-xl border border-gg-border/50 bg-gg-surface/30 p-4">
                    <Data className="text-gg-muted block text-xs mb-1">Reactive Success</Data>
                    <div className="text-lg font-bold text-aged-gold tabular-nums">
                      {formatNumber((insuranceReport.metrics?.reactiveActivationSuccessRate ?? 0) * 100, {
                        maximumFractionDigits: 2,
                      })}
                      %
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-gg-border/50 bg-gg-surface/30 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <FileText className="h-4 w-4 text-aged-gold" />
                    Report Summary
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-gg-muted sm:grid-cols-2">
                    <div>Loss events: {insuranceReport.claims?.generatedLossEvents ?? 0}</div>
                    <div>Claims paid: {insuranceReport.claims?.paid ?? 0}</div>
                    <div>Pending claims: {insuranceReport.claims?.pending ?? 0}</div>
                    <div>Validation: {insuranceReport.validation?.pass ? "pass" : "fail"}</div>
                    <div>Events logged: {insuranceReport.eventsLogged ?? 0}</div>
                  </div>
                </div>

                {insuranceMarkdown ? (
                  <details className="rounded-xl border border-gg-border/50 bg-gg-surface/30 p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-foreground">
                      Report-ready Markdown
                    </summary>
                    <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-gg-muted">
                      {insuranceMarkdown}
                    </pre>
                  </details>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
