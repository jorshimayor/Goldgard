import Link from "next/link";
import { ArrowRight, Shield, Waves, Swords, Zap, Lock, TrendingUp, BarChart3 } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a1428] via-[#0a1428] to-[#0a0f1a]">
      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:py-20">
        {/* Hero Section */}
        <section className="mb-20 space-y-12">
          <div className="grid gap-12 md:grid-cols-2 md:items-center">
            {/* Left Content */}
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-gg-border bg-gg-surface/50 px-4 py-2 text-xs font-semibold text-gg-gold backdrop-blur-sm hover:border-gg-gold/50 transition-colors">
                <Shield className="h-3.5 w-3.5" />
                Uniswap v4 Hook Incubator — UHI9
              </div>

              <div className="space-y-4">
                <h1 className="text-5xl md:text-6xl font-bold leading-tight tracking-tight">
                  <span className="block text-white">Goldgard —</span>
                  <span className="block bg-gradient-to-r from-gg-gold via-gg-gold2 to-gg-gold bg-clip-text text-transparent animate-gradient-shift">
                    Yield Shield
                  </span>
                  <span className="block text-white">of the LSTs</span>
                </h1>
              </div>

              <p className="max-w-xl text-lg leading-8 text-gg-muted">
                Protect Thy Yield — The First Delta-Neutral LST Hook. Goldgard turns the LST LP trap into a defensible moat by coupling dynamic fees, oracle-aware circuit breaking, and an on-chain Safety Module funded by swap premiums.
              </p>

              <div className="flex flex-col gap-4 sm:flex-row pt-4">
                <Link
                  href="/dashboard"
                  className="group relative inline-flex h-12 items-center justify-center gap-2 rounded-xl px-6 font-semibold text-[#0A1428] overflow-hidden transition-all duration-300"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-gg-gold to-gg-gold2 group-hover:scale-105 transition-transform duration-300" />
                  <span className="relative flex items-center gap-2">
                    Enter the Shieldwall
                    <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </span>
                </Link>
                <Link
                  href="/demo"
                  className="group inline-flex h-12 items-center justify-center rounded-xl border border-gg-gold/50 bg-gg-surface/30 px-6 font-semibold text-foreground hover:bg-gg-surface/50 hover:border-gg-gold transition-all duration-300 backdrop-blur-sm"
                >
                  <span className="flex items-center gap-2">
                    Run the Demo Console
                    <Zap className="h-4 w-4 group-hover:text-gg-gold transition-colors" />
                  </span>
                </Link>
              </div>
            </div>

            {/* Right Illustration */}
            <div className="grid gap-4 md:gap-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="card-glow group rounded-2xl p-6 backdrop-blur-sm">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-gg-gold/10 group-hover:bg-gg-gold/20 transition-colors">
                      <Waves className="h-5 w-5 text-gg-gold" />
                    </div>
                    <span className="font-semibold text-sm">IL Storms</span>
                  </div>
                  <p className="text-sm text-gg-muted leading-relaxed">
                    Price swings erase yield and punish passive LPs with impermanent loss.
                  </p>
                </div>
                <div className="card-glow group rounded-2xl p-6 backdrop-blur-sm">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-gg-gold/10 group-hover:bg-gg-gold/20 transition-colors">
                      <Swords className="h-5 w-5 text-gg-gold" />
                    </div>
                    <span className="font-semibold text-sm">Delta Neutrality</span>
                  </div>
                  <p className="text-sm text-gg-muted leading-relaxed">
                    afterSwap rebalances with flash accounting in the same transaction.
                  </p>
                </div>
              </div>
              <div className="card-glow group rounded-2xl p-6 backdrop-blur-sm md:col-span-1">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-gg-gold/10 group-hover:bg-gg-gold/20 transition-colors">
                    <Lock className="h-5 w-5 text-gg-gold" />
                  </div>
                  <span className="font-semibold text-sm">Safety Module</span>
                </div>
                <p className="text-sm text-gg-muted leading-relaxed">
                  0.02% premium per swap flows into an ERC-4626 reserve. Claims require 14-day cooldown and liquidity-seconds eligibility.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="mb-20 space-y-12">
          <div className="text-center space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
              <span className="block text-white mb-2">How Goldgard</span>
              <span className="gradient-text text-4xl md:text-5xl font-bold">Protects Your Yield</span>
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-gg-muted">
              A comprehensive solution combining price protection, dynamic fees, and insurance mechanisms.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                icon: TrendingUp,
                title: "Dynamic Fee Structure",
                description: "Fees automatically adjust based on market conditions and price volatility to maintain optimal LP profitability.",
                color: "from-gg-gold to-yellow-500"
              },
              {
                icon: BarChart3,
                title: "Oracle-Aware Circuit Breaker",
                description: "Pause swaps during extreme price movements, preventing cascading liquidations and protecting the pool.",
                color: "from-blue-400 to-gg-gold"
              },
              {
                icon: Shield,
                title: "Risk-Adjusted Insurance",
                description: "The Safety Module accumulates swap premiums to provide insurance payouts during adverse events.",
                color: "from-gg-gold to-orange-500"
              },
            ].map((feature, i) => {
              const Icon = feature.icon;
              return (
                <div key={i} className="card-glow group rounded-2xl p-8 backdrop-blur-sm space-y-4">
                  <div className={`p-3 rounded-lg bg-gradient-to-br ${feature.color} w-fit`}>
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold">{feature.title}</h3>
                  <p className="text-gg-muted text-sm leading-relaxed">
                    {feature.description}
                  </p>
                  <div className="pt-2 text-gg-gold text-sm font-medium group-hover:translate-x-1 transition-transform inline-block">
                    Learn more →
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Stats Section */}
        <section className="mb-20">
          <div className="card-glow rounded-2xl p-12 backdrop-blur-sm space-y-8">
            <h2 className="text-3xl md:text-4xl font-bold text-center">Why LSTs Need Goldgard</h2>
            
            <div className="grid gap-8 md:grid-cols-3">
              {[
                { label: "Average IL Loss", value: "2-5%", description: "per range per year" },
                { label: "Safety Module Coverage", value: "Variable", description: "based on premiums collected" },
                { label: "Circuit Breaker Triggers", value: "Dynamic", description: "oracle-based thresholds" },
              ].map((stat, i) => (
                <div key={i} className="text-center space-y-2 p-4">
                  <div className="text-sm text-gg-muted">{stat.label}</div>
                  <div className="text-4xl md:text-5xl font-bold text-gg-gold">{stat.value}</div>
                  <div className="text-xs text-gg-muted">{stat.description}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="text-center space-y-8">
          <div className="space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold">
              Ready to Shield Your Yield?
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-gg-muted">
              Join us in revolutionizing LST liquidity provision. Experience delta-neutral yield protection powered by Uniswap v4.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/dashboard"
              className="group relative inline-flex h-14 items-center justify-center gap-2 rounded-xl px-8 font-semibold text-[#0A1428] overflow-hidden transition-all duration-300 sm:px-10"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-gg-gold to-gg-gold2 group-hover:scale-105 transition-transform duration-300" />
              <span className="relative">
                Launch Dashboard
              </span>
            </Link>
            <Link
              href="/demo"
              className="group relative inline-flex h-14 items-center justify-center gap-2 rounded-xl border border-gg-gold/50 px-8 font-semibold text-foreground overflow-hidden backdrop-blur-sm"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-gg-gold/10 to-gg-gold2/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <span className="relative">
                Try Demo Console
              </span>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
