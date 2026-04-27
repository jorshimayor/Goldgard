"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Shield } from "lucide-react";

const links = [
  { href: "/", label: "Landing" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/demo", label: "Demo Console" },
];

export function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-gg-border bg-[#0A1428]/70 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gg-surface shadow-gg">
            <Shield className="h-5 w-5 text-gg-gold" />
          </span>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-wide text-foreground">Goldgard</div>
            <div className="text-xs text-gg-muted">Yield Shield of the LSTs</div>
          </div>
        </Link>

        <nav className="hidden items-center gap-4 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm text-gg-muted hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <span className="hidden rounded-full border border-gg-border bg-gg-surface px-3 py-1 text-xs text-gg-muted sm:inline">
            Sepolia
          </span>
          <ConnectButton showBalance={false} />
        </div>
      </div>
    </header>
  );
}

