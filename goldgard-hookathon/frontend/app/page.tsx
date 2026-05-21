import Link from "next/link";
import { ArrowRight, Shield, Waves, Swords, Zap, Lock, TrendingUp, BarChart3 } from "lucide-react";
import { Display, Subhead, Body, Data, RuneStone, LeverageRune } from "@/components/DesignComponents";

export default function Home() {
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
                <LeverageRune className="h-12 px-6">
                  <Link href="/dashboard" className="flex items-center gap-2 w-full h-full justify-center">
                    Enter the Shieldwall
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </LeverageRune>
                <Link
                  href="/demo"
                  className="group inline-flex h-12 items-center justify-center rounded-xl border border-aged-gold/50 bg-gg-surface/30 px-6 font-semibold text-foreground hover:bg-gg-surface/50 hover:border-aged-gold transition-all duration-300 backdrop-blur-sm"
                >
                  <span className="flex items-center gap-2">
                    Run the Demo Console
                    <Zap className="h-4 w-4 group-hover:text-aged-gold transition-colors" />
                  </span>
                </Link>
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
                  <div className="pt-2 text-aged-gold text-sm font-medium hover:translate-x-1 transition-transform inline-block cursor-pointer">
                    Learn more →
                  </div>
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

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <LeverageRune className="h-14 px-10">
              <Link href="/dashboard" className="flex items-center gap-2 w-full h-full justify-center">
                Launch Dashboard
              </Link>
            </LeverageRune>
            <Link
              href="/demo"
              className="group relative inline-flex h-14 items-center justify-center gap-2 rounded-xl border border-aged-gold/50 px-8 font-semibold text-foreground overflow-hidden backdrop-blur-sm"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-aged-gold/10 to-pale-gold/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <span className="relative">Try Demo Console</span>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
