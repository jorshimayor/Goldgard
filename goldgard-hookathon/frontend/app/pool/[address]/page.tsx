"use client";

import { useParams } from "next/navigation";
import { useMemo } from "react";
import { getDemoConfig } from "../../../lib/demoConfig";
import { shortAddr } from "../../../lib/format";

export default function PoolDetailPage() {
  const params = useParams<{ address: string }>();
  const cfg = useMemo(() => getDemoConfig(), []);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10">
      <div className="rounded-3xl border border-gg-border bg-gg-surface p-6 shadow-gg">
        <div className="text-sm text-gg-muted">Pool / Strategy Detail</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{shortAddr(params.address)}</h1>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-gg-border bg-gg-surface p-4">
            <div className="text-sm font-semibold">Parameters</div>
            <div className="mt-3 space-y-2 text-sm text-gg-muted">
              <div className="flex items-center justify-between gap-3">
                <span>tickSpacing</span>
                <span className="font-mono text-foreground">{cfg.tickSpacing}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>fee</span>
                <span className="font-mono text-foreground">{cfg.fee}</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gg-border bg-gg-surface p-4">
            <div className="text-sm font-semibold">State</div>
            <div className="mt-3 text-sm text-gg-muted">
              This page is the home for on-chain charts and event timelines. For the hackathon MVP, the live metrics
              are surfaced on the Dashboard.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

