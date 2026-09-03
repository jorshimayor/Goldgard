# Stradebase — what I built, and what the backend team does next

**For:** Conrad
**From:** Josh

You already know what the app does. This is about **who built what** — the part I delivered (the
blockchain core, plus a small backend prototype to prove it works), and the production backend work
that happens on the main codebase **I don't have access to**.

***

## What I built — the blockchain core (the hard, specialised part)

This is the heart of the platform: the part that records who owns what and enforces every rule
automatically, on a public, tamper-proof ledger. It's built, deployed to a test network, and tested.

- **The ownership & trading engine.** Artists can split a song into a fixed number of royalty
  shares; investors can buy them, hold them, and resell them. The shares are real digital assets that
  actually move between people — not just numbers in a database.
- **The rulebook, enforced automatically.** Identity checks, sanctions/risk status, country
  restrictions, accredited-investor gating, ownership caps, and lock-up periods are checked on **every
  single transfer** — first sale and every resale alike. A transaction that breaks a rule simply
  can't go through. There's also an account freeze and a platform-wide emergency "pause."
- **A tamper-proof trade record.** Every purchase and resale is written to the public ledger **in the
  same step** as the shares moving, so the ownership record can never drift from what actually
  happened. Royalty payouts are recorded against each listing too.
- **Privacy built in from day one.** Personal data stays private with us; only a scrambled, one-way
  "fingerprint" of it goes on the public record — enough to prove what we verified, never the data
  itself.
- **The pound-pegged digital currency (SBTS)** plus support for the two main US-dollar digital
  currencies, tier NFTs (collectibles/perks), user profiles, and opt-in public usernames.
- **An audit safety net** that flags any share movement not properly recorded.

This is the novel, higher-risk, specialised work — the part that needs deep blockchain knowledge.
It's done.

## The small backend I built (to prove the whole thing works)

To show the blockchain core actually holds together as a product, I built a **working prototype of
the "connecting software"** — the layer that sits between an app and the blockchain — and used it to
run the **entire journey end to end**: sign up, verify, list, buy, resell, pay royalties, admin
controls. An automated test suite checks every step and confirms the expected result (currently
**45 of 45 checks pass**).

That prototype also includes **reference versions** of things the production team will harden rather
than invent from scratch:

- the **money model** logic (how dollars convert to pounds, and the single pounds balance),
- the **secure-signing mechanism** for holding customer keys (the seam custody hardening plugs into),
- the **indexer and reconciliation** (reconstructing and double-checking on-chain activity).

Important framing: this is a **prototype and blueprint**, running on a test network — **not** the
production system. It proves the design and gives the backend team a working reference to build from.

## What I don't have access to (and why the rest is the backend team's)

The **production backend lives in a separate master codebase that I don't have access to.** So the
real, live version of the money movement, logins, databases, and scaling is built **there**, by the
backend developer (Kwame) — using my prototype and written guides as the specification.

## What could be done to the backend (Kwame, on the master codebase)

Mostly standard, well-understood engineering — not inventing new features:

- **Wire up the real money movement** — taking deposits, converting to pounds through our partner
  (BVNK), paying out to banks, and reconciling it all (following the money model I documented).
- **Harden how we hold customers' keys** to bank-grade standard — the main pre-launch security task.
- **Logins, accounts, and access control.**
- **Databases and infrastructure** to run reliably at scale.
- **Productionise my reference pieces** (money/FX logic, custody signing, indexer/reconciliation)
  into the live stack.

## The line, in one view

| Area | Who builds it | Status |
|---|---|---|
| Blockchain core (ownership, rules, records, privacy, currency, NFTs) | **Me** | Built + tested on a test network |
| Prototype backend + end-to-end proof | **Me** | Built + tested (45/45 checks) |
| Reference money/FX, custody-signing, indexer logic | **Me** | Reference versions built, ready to productionise |
| Production backend (live money, custody hardening, logins, infra) | **Kwame** (master codebase, no access for me) | To build — handed over as a detailed blueprint |

## The short version

The distinctive, higher-risk part — the blockchain core and a proven end-to-end prototype — **is
built and tested by me.** What remains is largely standard production engineering on a codebase I
don't have access to, handed to Kwame as a working blueprint rather than a blank page. Happy to walk
you through any of it.
