"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Shield, Menu, X } from "lucide-react";
import { useState } from "react";

const links = [
  { href: "/", label: "Landing" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/demo", label: "Demo Console" },
];

export function Nav() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-gg-border bg-gradient-to-b from-[#0A1428]/95 to-[#0A1428]/70 backdrop-blur-xl transition-all duration-300">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        {/* Logo */}
        <Link href="/" className="group flex items-center gap-3 transition-transform duration-300 hover:scale-105">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-br from-gg-gold to-gg-gold2 rounded-xl blur-lg opacity-0 group-hover:opacity-50 transition-opacity duration-300" />
            <span className="relative grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-gg-surface to-gg-surface2 border border-gg-gold/30 shadow-lg">
              <Shield className="h-5 w-5 text-gg-gold" />
            </span>
          </div>
          <div className="leading-tight">
            <div className="text-base font-bold tracking-wide bg-gradient-to-r from-gg-gold to-gg-gold2 bg-clip-text text-transparent">
              Goldgard
            </div>
            <div className="text-xs text-gg-muted font-medium">Yield Shield of the LSTs</div>
          </div>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="relative text-sm font-medium text-gg-muted transition-colors duration-300 hover:text-gg-gold after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-0 after:bg-gradient-to-r after:from-gg-gold after:to-gg-gold2 after:transition-all after:duration-300 hover:after:w-full"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Right Section */}
        <div className="flex items-center gap-3 sm:gap-4">
          <span className="hidden rounded-full border border-gg-gold/30 bg-gg-surface/50 px-3 py-1.5 text-xs font-semibold text-gg-gold sm:inline backdrop-blur-sm">
            Sepolia
          </span>
          <div className="hidden sm:block">
            <ConnectButton showBalance={false} />
          </div>
          
          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg border border-gg-border hover:bg-gg-surface transition-colors"
          >
            {mobileMenuOpen ? (
              <X className="h-5 w-5 text-foreground" />
            ) : (
              <Menu className="h-5 w-5 text-foreground" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-gg-border bg-gg-surface/50 backdrop-blur-sm">
          <nav className="flex flex-col gap-4 p-4">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMobileMenuOpen(false)}
                className="text-sm font-medium text-gg-muted hover:text-gg-gold transition-colors duration-300"
              >
                {l.label}
              </Link>
            ))}
            <div className="pt-2 border-t border-gg-border">
              <ConnectButton showBalance={false} />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

