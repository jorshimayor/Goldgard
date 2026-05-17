"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { useChainId } from "wagmi";
import { getDemoConfigForChain } from "../lib/demoConfig";
import { Data } from "./DesignComponents";

const links = [
  { href: "/", label: "Landing" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/demo", label: "Demo Console" },
];

export function Nav() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const chainId = useChainId();
  const cfg = getDemoConfigForChain(chainId);
  const netLabel = cfg.chainId === 11155111 ? "Sepolia" : cfg.chainId === 31337 ? "Local" : `Chain ${cfg.chainId}`;

  return (
    <header className="sticky top-0 z-50 border-b border-gg-border bg-gg-bg/95 backdrop-blur-2xl shadow-gg transition-all duration-300">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4  px-4 py-4 shadow-inner shadow-black/20 backdrop-blur-xl sm:px-6">
        {/* Logo */}
        <Link href="/" className="group flex items-center gap-3 transition-transform duration-300 hover:scale-[1.02]">
          <div className="text-xl font-bold tracking-widest text-aged-gold font-display">
            GOLDGARD
          </div>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="relative text-sm font-semibold text-gg-muted transition-colors duration-300 hover:text-aged-gold after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-0 after:bg-gradient-to-r after:from-aged-gold after:to-pale-gold after:transition-all after:duration-300 hover:after:w-full font-body tracking-wide"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Right Section */}
        <div className="flex items-center gap-3 sm:gap-4">
          <Data className="hidden rounded-full border border-gg-gold/30 bg-gg-surface/50 px-3 py-1.5 text-xs font-semibold text-gg-gold sm:inline backdrop-blur-sm">
            {netLabel}
          </Data>
          <ConnectButton showBalance={false} />
          
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
        <div className="md:hidden border-t border-gg-border bg-gg-bg/95 backdrop-blur-2xl">
          <nav className="flex flex-col gap-4 p-4">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMobileMenuOpen(false)}
                className="text-sm font-semibold text-gg-muted hover:text-aged-gold transition-colors duration-300 font-body tracking-wide"
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
