# Stradebase — full overview

**For:** Conrad (Product & Legal)
**From:** Engineering (Josh)
**What this is:** the complete, plain-English picture of what Stradebase is and everything that's
been built so far — from a user signing up to cashing out — plus what's left and the decisions that
sit with product and legal. No technical background needed. (Shorter versions live in
[product-update.md](product-update.md) and [conrad-update.md](conrad-update.md); this is the
detailed end-to-end.)

---

## 1. What Stradebase is

Stradebase lets **music artists sell fractional shares of their song royalties** to investors, backed
by a **British-pound-pegged digital currency (SBTS)**, with identity checks and trading rules built
into every transaction.

Think of it as fractional property investment, but for song royalties: an artist offers a fixed
number of shares in a song, verified investors buy them, can resell them, and receive a proportional
cut of that song's royalties. Ownership and history are kept on a public, tamper-proof ledger; the
money is handled through our own regulated payment rails.

---

## 2. The journey, beginning to end

Here is the whole path a customer travels, and what the platform does at each step.

**1. Sign up & get verified.** A person creates an account. Before they can buy or hold anything,
they pass **identity verification (KYC)**. Their personal details are stored privately by us; only a
scrambled, one-way "fingerprint" of that data goes on the public record (more in §5).

**2. Get a profile (and optionally a public name).** Each user gets a profile — artist, investor, or
both. They can optionally claim a **public username**; it's opt-in because it deliberately links
their activity, so it needs their own approval.

**3. Put money in.** The customer funds their account. They see their balance **in pounds**, always.
If they pay in with US-dollar digital currency, we convert it to pounds on the way in, so what they
see is a clean pound figure (the mechanics are in §4).

**4. An artist lists a song.** A verified artist publishes a listing: a fixed number of royalty
shares, a price, and the rules that apply (allowed countries, whether investors must be accredited,
ownership caps, any lock-up period).

**5. An investor buys shares.** A verified investor buys shares in a listing. At the moment of
purchase every rule is checked automatically — identity, risk status, country, caps, accreditation.
If anything fails, the purchase simply can't complete. The shares move to the buyer and a permanent
record of the trade is written to the public ledger.

**6. Hold or resell.** The investor holds the shares, or resells them to another verified investor.
A resale runs through the **same rulebook** — and the resale is recorded on the ledger **in the same
step as the shares moving**, so the ownership record can never drift from what actually happened.

**7. Royalties get paid.** When a song earns royalties, the platform records a payout against the
listing and **credits each shareholder's pound balance**. Shareholders don't have to do anything to
receive it.

**8. Cash out.** The customer withdraws to their bank **in pounds** — a straightforward bank
transfer, because we already hold pounds for them (§4).

**Throughout,** the platform admin (us) can verify users, apply restrictions, freeze an account, or
pause the entire platform in an emergency — all from an internal dashboard.

We have run this **entire journey end to end** in a test environment — sign up, verify, list, buy,
resell, pay royalties, admin controls — and an automated test suite exercises **every one of these
steps and confirms the expected result** (it currently passes 45 of 45 checks). So the novel, hard
part is built and proven.

---

## 3. The core design: two layers

Every purchase or payout touches two separate layers, and the distinction matters legally:

- **Ownership lives on the public ledger.** When someone buys, sells, or is paid, the *shares
  themselves move* and a permanent, public record is written. This is what makes ownership provable
  and the entire history independently auditable.
- **Money settles through our own systems.** The actual pounds change hands through our regulated
  payment rails, **not** on the public ledger. Stradebase never sits on a shared pot of customer
  cash on-chain; the public record simply *notes* the amounts for the audit trail.

**In one line:** the chain is the source of truth for *who owns what and what happened*; our systems
handle the *cash*.

---

## 4. The money model (how pounds work end to end)

This is the area we've worked through most recently, and there's a **confirmed decision** in it.

**Customers only ever see pounds.** SBTS is our pound — one SBTS is one pound, and every pound shown
is backed one-for-one by real pounds we hold. We do **not** show dollars in the app.

**Money in — convert at the door.** When a customer funds with US-dollar digital currency, we convert
it to pounds the moment it arrives (through our conversion partner, **BVNK**) and credit them in
pounds at that day's rate. This is deliberate: if we *showed* pounds but *held* dollars, a swing in
the exchange rate would land as a loss on us. Converting at the door means the customer simply gets
that day's rate — like any bureau de change — and we carry no currency bet.

**The exchange spread is the customer's, not a cost to us.** We quote the market rate plus a small,
disclosed spread (the way every money app does). That covers the conversion cost and leaves a
margin, so putting money in isn't a drain on the business — it's roughly neutral to slightly
positive for us.

**Doing it at scale.** We separate "show pounds instantly" from "convert to pounds." The customer
sees pounds immediately; behind the scenes the actual dollar-to-pound conversion runs as an
efficient **treasury batch** — we net incoming dollars against outgoing pounds and only convert the
difference, in scheduled batches, keeping a working pound float topped up. That's what makes it work
cleanly at tens of thousands of users instead of thousands of tiny conversions.

**Money out — paying in pounds is the easy case.** Because we already hold pounds, a withdrawal is
just a **bank transfer** — no exchange, no exchange fee. It's the cheapest exit we have.

**Paying royalties to many people.** Paying royalties is **not** thousands of simultaneous bank
transfers. A royalty run **credits everyone's in-app pound balance at once** (instant), and customers
then withdraw to their bank on their own schedule. If we ever need to push payments straight to
thousands of bank accounts at once, that's possible too (via standard UK bulk-payment rails), but it
needs us to hold all the cash that day — which is why crediting-then-letting-people-withdraw is the
sensible default.

The full detail is in [payments-fx.md](payments-fx.md). **For legal:** because we hold customer
pounds and back a pound balance, SBTS is effectively an **e-money / stablecoin instrument** —
reserve, redemption, and safeguarding rules apply, and BVNK plus a UK payments partner are the
licensed rails to name in the permissions work.

---

## 5. Compliance and controls (built into the product)

These are enforced automatically — a transaction that breaks a rule cannot complete:

- **Identity verification (KYC):** a user must be verified before buying or holding.
- **Sanctions / risk status:** every user is **OK, Restricted, or Frozen**. Frozen can't transact at
  all; Restricted (e.g. under review) can still *receive* but can't buy or send. The *reason* is kept
  in our private records, never published.
- **Jurisdiction limits:** a listing can be restricted to investors from allowed countries.
- **Accredited-investor gating:** a listing can require investors to be accredited.
- **Ownership caps:** per-wallet and overall limits on how much of a listing anyone can hold, to
  prevent over-concentration.
- **Lock-up periods:** shares can be made non-transferable for a set time after purchase.
- **Freeze / unfreeze** individual accounts, and a **platform-wide emergency pause** that halts all
  activity.

These run at both the first sale and every resale, so the rulebook can't be side-stepped by trading
peer-to-peer.

**One honest limitation for legal:** ownership caps are enforced per wallet. A determined person
could spread holdings across several verified identities. On-chain balances can't see "same real
person," so concentration limits should also be checked at the identity level during KYC.

---

## 6. Privacy and personal data

- **Public by design:** a user's wallet, optional public username, country code, and trading history
  are visible on the public ledger. That's the transparency trade-off of a public blockchain.
- **Private by design:** all actual personal data (name, DOB, address, documents) stays in **our
  private systems only**. What goes on the public record is a scrambled, one-way **fingerprint** —
  enough to later *prove* what we verified, never the data itself.
- **Right to be forgotten:** we can delete a user's data and sever the link to that fingerprint. Two
  honest limits for the privacy notice: (a) while we still hold the data, the fingerprint still
  counts as personal data under UK GDPR; and (b) some facts are permanently public and can't be
  erased — e.g. "this wallet passed identity checks on this date," "this wallet is in the UK."

---

## 7. Custody — who holds the keys (legal, please read)

- Stradebase is **custodial**: we hold and manage each user's wallet keys for them. The customer
  initiates an action; because we hold their key, we complete it.
- **Legally, holding customers' keys is custody under FCA rules** — even though customers initiate
  every action and we hold no shared pot of cash. The safeguarding obligation attaches to holding the
  keys. To confirm with counsel and reflect in our permissions approach.
- **Security:** the system is built so key protection can be hardened to bank-grade before launch
  (keys in specialised secure hardware, or split so no single system can misuse them). Because we now
  hold customer stablecoin briefly during conversion (§4), this hardening is a **hard pre-launch
  requirement**, not optional.

---

## 8. Transparency and audit trail

- The platform keeps a **complete, ordered history of every listing** — first sale through every
  resale — on the public record, independently verifiable.
- We run an internal **reconciliation check** that flags any share movement not properly recorded, as
  an audit safety net. In testing it reports zero discrepancies.

---

## 9. What's built and tested vs. what's next

**Built and proven end-to-end (in a test environment):**
identity/KYC records, sanctions/risk status, jurisdiction and ownership rules, lock-ups, account
freeze and platform pause, the GBP digital pound (SBTS) plus USDC/USDT support, the pounds-only
combined balance, fractional listings, buying, reselling with atomic trade records, royalty-payout
records, tier NFTs (digital collectibles/perks), the public trade history, the audit reconciliation,
the admin dashboard, and a **working prototype of the connecting backend** used to run and
automatically test the whole journey.

**Next — productionised by the backend developer (Kwame):** mostly standard engineering, not new
invention:

- **The real money movement** — deposits, conversions, payouts, and reconciliation (the model in §4),
  wired to BVNK and a UK payments partner.
- **Bank-grade key custody** — the main pre-launch security task.
- **Logins, accounts, and access control.**
- **Databases and infrastructure** to run reliably at scale.

He's been handed a detailed technical guide mapping exactly what to reuse and what to build, so he's
productionising a proven blueprint, not starting from scratch.

---

## 10. Decisions and legal items that sit with you

| Item | Owner |
|---|---|
| KYC/AML provider, and which countries/tiers we support | Product + Legal |
| E-money / stablecoin position for SBTS (reserve, redemption, safeguarding) and the registration path | Legal |
| FCA custody/safeguarding position (we hold customers' keys) | Legal |
| Naming BVNK + a UK payments/banking partner as the licensed rails | Product + Legal |
| Disclosing the FX spread to customers at deposit | Product + Legal |
| Privacy notice covering public-ledger permanence and the data "fingerprint" (§6) | Legal |
| Bank-grade key custody hardening (budget + timing) | Product + Legal |
| Whether royalties auto-pay to bank or credit in-app for withdrawal (§4) | Product |
| Handling a stampede on a popular new listing (waitlist / lottery / limits) | Product |
| Whether listings can be edited before going live, or are fixed once created | Product |
| Independent third-party security audit before public launch | Product + Legal |

---

## 11. Bottom line

The distinctive, higher-risk part — the ownership-and-rules engine on the public ledger, the privacy
approach, the pound-backed digital currency, and the money model — is **built, decided, and proven
end-to-end** in a test environment. What remains before a public launch is largely **operational and
legal**: choosing an identity provider, hardening how we protect keys, wiring the regulated money
rails, an external security review, and the legal groundwork around e-money, custody, and privacy.

Happy to walk through any of this in person.
