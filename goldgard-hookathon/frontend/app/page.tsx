import Link from "next/link";
import { ArrowRight, Shield, Waves, Swords } from "lucide-react";

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:py-16">
      <section className="grid gap-10 rounded-3xl border border-gg-border bg-gg-surface p-8 shadow-gg md:grid-cols-2 md:items-center">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-gg-border bg-gg-surface px-3 py-1 text-xs text-gg-muted">
            <Shield className="h-3.5 w-3.5 text-gg-gold" />
            Uniswap v4 Hook Incubator — UHI9
          </div>

          <h1 className="text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
            Goldgard — Yield Shield of the LSTs
          </h1>

          <p className="max-w-xl text-base leading-7 text-gg-muted">
            Protect Thy Yield — The First Delta-Neutral LST Hook.
            Goldgard turns the LST LP trap into a defensible moat by coupling dynamic fees, oracle-aware
            circuit breaking, and an on-chain Safety Module funded by swap premiums.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/dashboard"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gg-gold px-5 text-sm font-semibold text-[#0A1428] hover:bg-gg-gold-2"
            >
              Enter the Shieldwall <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/demo"
              className="inline-flex h-12 items-center justify-center rounded-xl border border-gg-border bg-gg-surface px-5 text-sm font-semibold text-foreground hover:bg-gg-surface2"
            >
              Run the Demo Console
            </Link>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-gg-border bg-gg-surface p-5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Waves className="h-4 w-4 text-gg-gold" /> IL Storms
              </div>
              <div className="mt-2 text-sm text-gg-muted">
                Price swings erase yield and punish passive LPs.
              </div>
            </div>
            <div className="rounded-2xl border border-gg-border bg-gg-surface p-5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Swords className="h-4 w-4 text-gg-gold" /> Delta Neutrality
              </div>
              <div className="mt-2 text-sm text-gg-muted">
                afterSwap rebalances with flash accounting in the same transaction.
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-gg-border bg-gg-surface p-5">
            <div className="text-sm font-semibold">Safety Module</div>
            <div className="mt-2 text-sm text-gg-muted">
              0.02% premium per swap flows into an ERC-4626 reserve. Claims require 14-day cooldown
              and liquidity-seconds eligibility.
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
