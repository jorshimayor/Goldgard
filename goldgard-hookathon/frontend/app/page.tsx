"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Shield, Waves, Swords, Zap, Lock, TrendingUp, BarChart3, CircleHelp, X } from "lucide-react";
import { Display, Subhead, Body, Data, RuneStone } from "@/components/DesignComponents";

export default function Home() {
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gg-bg">
      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:py-20">
        {/* Hero Section */}
        <section className="mb-20 space-y-12">
          <div className="grid gap-12 md:grid-cols-2 md:items-center">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-gg-border bg-gg-surface/50 px-4 py-2 text-xs font-semibold text-aged-gold backdrop-blur-sm hover:border-aged-gold/50 transition-colors">
                <Shield className="h-3.5 w-3.5" />
                Uniswap v4 Hook Incubator — UHI9
              </div>

              <div className="space-y-2">
                <Display variant="xl" className="text-foreground">
                  Goldgard —
                </Display>
                <Display variant="xl" className="gradient-text">
                  Yield Shield
                </Display>
                <Display variant="xl" className="text-foreground">
                  of the LSTs
                </Display>
              </div>

              <Body className="max-w-xl text-lg text-gg-muted">
                Protect Thy Yield. Goldgard turns the LST LP trap into a defensible moat by coupling dynamic fees, oracle-aware circuit breaking, and an on-chain Safety Module funded by swap premiums.
              </Body>

              <div className="flex flex-col gap-4 sm:flex-row pt-4">
                <Link
                  href="/dashboard"
                  className="group relative inline-flex h-14 min-w-[16rem] items-center justify-center gap-3 overflow-hidden rounded-2xl border border-aged-gold/60 bg-[radial-gradient(circle_at_top,rgba(255,231,163,0.22),rgba(212,175,119,0.12)_35%,rgba(20,12,5,0.92)_100%)] px-8 font-semibold text-foreground shadow-[0_0_0_1px_rgba(212,175,119,0.12),0_14px_40px_rgba(0,0,0,0.35)] transition-all duration-300 hover:-translate-y-0.5 hover:border-pale-gold hover:shadow-[0_0_0_1px_rgba(245,227,166,0.28),0_0_34px_rgba(212,175,119,0.2),0_18px_44px_rgba(0,0,0,0.45)]"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-aged-gold/20 via-transparent to-pale-gold/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <span className="relative flex items-center gap-3">
                    Enter the Shieldwall
                    <ArrowRight className="h-4 w-4 text-aged-gold transition-transform duration-300 group-hover:translate-x-1" />
                  </span>
                </Link>
                <Link
                  href="/demo"
                  className="group relative inline-flex h-14 min-w-[16rem] items-center justify-center gap-3 overflow-hidden rounded-2xl border border-aged-gold/45 bg-gradient-to-r from-aged-gold/12 to-gg-surface/40 px-8 font-semibold text-foreground shadow-[0_10px_28px_rgba(0,0,0,0.28)] transition-all duration-300 hover:-translate-y-0.5 hover:border-aged-gold hover:shadow-[0_0_0_1px_rgba(212,175,119,0.18),0_0_28px_rgba(212,175,119,0.14),0_16px_38px_rgba(0,0,0,0.38)] backdrop-blur-sm"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-aged-gold/16 to-pale-gold/6 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <span className="relative flex items-center gap-3">
                    Run the Demo Console
                    <Zap className="h-4 w-4 text-aged-gold transition-transform duration-300 group-hover:scale-110" />
                  </span>
                </Link>
              </div>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setHelpOpen(true)}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-aged-gold/90 transition-colors duration-300 hover:text-pale-gold cursor-pointer"
                >
                  <CircleHelp className="h-4 w-4 text-aged-gold" />
                  How To Use Goldgard
                </button>
              </div>
            </div>

            <div className="grid gap-4 md:gap-5">
              <div className="grid gap-4 md:grid-cols-2">
                <RuneStone>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-aged-gold/20">
                      <Waves className="h-5 w-5 text-aged-gold" />
                    </div>
                    <Subhead className="text-sm">IL Storms</Subhead>
                  </div>
                  <Body className="text-sm text-gg-muted">
                    Price swings erase yield and punish passive LPs with impermanent loss.
                  </Body>
                </RuneStone>
                <RuneStone>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-aged-gold/20">
                      <Swords className="h-5 w-5 text-aged-gold" />
                    </div>
                    <Subhead className="text-sm">Delta Neutrality</Subhead>
                  </div>
                  <Body className="text-sm text-gg-muted">
                    afterSwap rebalances with flash accounting in the same transaction.
                  </Body>
                </RuneStone>
              </div>
              <RuneStone>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-aged-gold/20">
                    <Lock className="h-5 w-5 text-aged-gold" />
                  </div>
                  <Subhead className="text-sm">Safety Module</Subhead>
                </div>
                <Body className="text-sm text-gg-muted">
                  0.02% premium per swap flows into an ERC-4626 reserve. Claims require 14-day cooldown and liquidity-seconds eligibility.
                </Body>
              </RuneStone>
            </div>
          </div>
        </section>

        <section className="mb-20 space-y-12">
          <div className="text-center space-y-4">
            <Display variant="lg" className="text-foreground">
              How Goldgard
            </Display>
            <Display variant="lg" className="gradient-text">
              Protects Your Yield
            </Display>
            <Body className="mx-auto max-w-2xl text-lg text-gg-muted">
              A comprehensive solution combining price protection, dynamic fees, and insurance mechanisms.
            </Body>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                icon: TrendingUp,
                title: "Dynamic Fee Structure",
                description: "Fees automatically adjust based on market conditions and price volatility to maintain optimal LP profitability.",
              },
              {
                icon: BarChart3,
                title: "Oracle-Aware Circuit Breaker",
                description: "Pause swaps during extreme price movements, preventing cascading liquidations and protecting the pool.",
              },
              {
                icon: Shield,
                title: "Risk-Adjusted Insurance",
                description: "The Safety Module accumulates swap premiums to provide insurance payouts during adverse events.",
              },
            ].map((feature, i) => {
              const Icon = feature.icon;
              return (
                <RuneStone key={i}>
                  <div className="p-3 rounded-lg bg-aged-gold/20 w-fit mb-4">
                    <Icon className="h-6 w-6 text-aged-gold" />
                  </div>
                  <Subhead className="text-lg">{feature.title}</Subhead>
                  <Body className="text-gg-muted text-sm mt-3">
                    {feature.description}
                  </Body>
                </RuneStone>
              );
            })}
          </div>
        </section>

        <section className="mb-20">
          <RuneStone className="p-12">
            <Display variant="lg" className="text-center mb-8 text-foreground">
              Why LSTs Need Goldgard
            </Display>
            <div className="grid gap-8 md:grid-cols-3">
              {[
                { label: "Average IL Loss", value: "2-5%", description: "per range per year" },
                { label: "Safety Module Coverage", value: "Variable", description: "based on premiums collected" },
                { label: "Circuit Breaker Triggers", value: "Dynamic", description: "oracle-based thresholds" },
              ].map((stat, i) => (
                <div key={i} className="text-center space-y-2 p-4">
                  <Data className="text-gg-muted text-sm">{stat.label}</Data>
                  <div className="text-4xl md:text-5xl font-bold text-aged-gold">{stat.value}</div>
                  <Data className="text-xs text-gg-muted">{stat.description}</Data>
                </div>
              ))}
            </div>
          </RuneStone>
        </section>

        <section className="text-center space-y-8">
          <div className="space-y-4">
            <Display variant="lg" className="text-foreground">
              Ready to Shield Your Yield?
            </Display>
            <Body className="mx-auto max-w-2xl text-lg text-gg-muted">
              Join us in revolutionizing LST liquidity provision.
            </Body>
          </div>
        </section>
      </div>

      {helpOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setHelpOpen(false)} />
          <div className="relative z-[71] w-full max-w-2xl rounded-3xl border border-gg-border/60 bg-gg-bg/95 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Subhead className="text-lg">How To Use Goldgard</Subhead>
                <Body className="mt-2 text-gg-muted text-sm">
                  A quick walkthrough for first-time users.
                </Body>
              </div>
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gg-border/50 bg-gg-surface/30 text-foreground transition-colors hover:border-aged-gold/50 cursor-pointer"
                aria-label="Close help modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 space-y-5 text-sm text-gg-muted">
              <div>
                <div className="font-semibold text-foreground">1. Start on the landing page</div>
                <div className="mt-1">Read the product overview, then choose whether you want to try the demo flow or monitor the live dashboard.</div>
              </div>
              <div>
                <div className="font-semibold text-foreground">2. Use the Demo Console</div>
                <div className="mt-1">Connect your wallet, pick a direction, enter an amount, mint demo tokens if needed, approve the router, then execute the swap.</div>
              </div>
              <div>
                <div className="font-semibold text-foreground">3. Watch the Dashboard</div>
                <div className="mt-1">Use the dashboard to track reserve assets, reward balance, reactive alerts, reserve history, and data-feed health.</div>
              </div>
              <div>
                <div className="font-semibold text-foreground">4. Run an insurance scenario</div>
                <div className="mt-1">Open the Insurance Scenario Builder from the dashboard if you want to simulate premium, payout, and reactive trigger outcomes.</div>
              </div>
              <div className="rounded-xl border border-gg-border/50 bg-gg-surface/30 p-4">
                <div className="font-semibold text-foreground">Best practice</div>
                <div className="mt-2">Wait for `Mint Tokens` and `Approve Router` to confirm before pressing `Execute`, and do not change trade direction after approving unless you approve again.</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
