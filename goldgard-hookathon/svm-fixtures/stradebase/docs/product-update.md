# Stradebase — Product Update

**For:** Conrad (Product & Legal)
**From:** Engineering
**In one line:** Stradebase lets music artists sell fractional shares of their song royalties to
investors, backed by a British-pound-pegged digital currency, with identity checks and trading
rules built into every transaction.

This is a plain-English summary of what's been built and what still needs product/legal decisions.
No technical background needed.

---

## 1. What the platform does

- An **artist** lists a song and offers a fixed number of **royalty shares** in it.
- **Investors** buy those shares and are entitled to a proportional cut of that song's royalties.
- Shares can later be **resold** to other (verified) investors.
- Everything is denominated in **SBTS**, our GBP-pegged digital pound. We also support the two main
  US-dollar digital currencies (**USDC** and **USDT**) for people who hold those.

Think of it like fractional property investment, but for song royalties, with the ownership record
kept on a public, tamper-proof ledger.

## 2. What a user can actually do today

**Artist**
- Create an account, get identity-verified, and publish a song listing with a set number of shares,
  a price, and rules (see §4).
- Receive the proceeds when investors buy in, and have royalty payouts recorded against the listing.

**Investor**
- Create an account, get identity-verified, and buy shares in a listing.
- Hold or resell those shares to other verified investors.
- See their holdings and a single **combined balance shown in pounds** (we automatically convert any
  US-dollar holdings to pounds so they see one clear number).
- Receive their share of royalty payouts.

**Platform admin (us)**
- Verify users, apply trading restrictions, freeze an account, or pause the whole platform in an
  emergency, all through an internal dashboard.

## 3. How ownership and money work (the important distinction)

Two things happen for every purchase or payout, and it's worth being precise:

- **Ownership and the trade record live on the public ledger.** When someone buys, sells, or is paid
  royalties, the *shares themselves move* and a permanent record of the transaction is written to the
  public blockchain. This is what makes ownership provable and the full history auditable by anyone.
- **The money settles through our own systems.** The actual pounds/dollars change hands through our
  payment processes, not on the public ledger. The public record notes the amount, but Stradebase's
  own accounts never sit holding customers' money in a shared pot — value goes between the parties.

So: **the chain is the source of truth for who owns what and what happened; our systems handle the
cash movement.**

## 4. Compliance and controls built into the product

These are enforced automatically — a transaction that breaks a rule simply cannot complete:

- **Identity verification (KYC):** a user must be verified before they can buy or hold shares.
- **Sanctions / risk status:** each user has a standing — **OK, Restricted, or Frozen**. A Frozen
  user can't transact at all; a Restricted user (e.g. under review) can still *receive* but can't
  buy or send. The *reason* for a restriction is kept in our private records, never published.
- **Jurisdiction limits:** a listing can be restricted to investors from allowed countries.
- **Accredited-investor gating:** a listing can require investors to be accredited.
- **Ownership caps:** limits on how much of a single listing any one wallet can hold (per-wallet and
  overall), to prevent over-concentration.
- **Lock-up periods:** shares can be made non-transferable for a set time after purchase.
- **Freeze / unfreeze** individual accounts, and a **platform-wide emergency pause** ("circuit
  breaker") that halts all activity if needed.

## 5. Privacy and personal data

- **Public by design:** a user's wallet, their chosen **public username** (optional), their country
  code, and their trading history are visible on the public ledger. Anyone can look up a wallet's
  activity — that's the transparency trade-off of using a public blockchain.
- **Private by design:** all actual personal data (name, date of birth, address, documents) is kept
  in **our private systems only**. What goes on the public record is a scrambled, one-way
  "fingerprint" of that data — enough for us to later *prove* what we verified, but the data itself
  is never exposed publicly.
- **Right to be forgotten:** we can delete a user's personal data and sever the link to their public
  fingerprint. **However — two honest limitations for legal to note:** (a) while we still hold a
  user's data, that scrambled fingerprint still counts as personal data under UK GDPR; and (b) some
  facts are permanently public and cannot be erased — e.g. "this wallet passed identity checks on
  this date" and "this wallet is in the UK." These need to be covered in the privacy notice.

## 6. Custody — who holds the keys (legal, please read)

- Stradebase is **custodial**: we hold and manage each user's wallet keys on their behalf. The user
  initiates an action from the app; because we hold their key, we complete it for them.
- **This matters legally:** holding customers' keys is considered **custody under FCA rules**, even
  though customers initiate every transaction themselves and we never hold their money in a shared
  pot. The safeguarding obligations attach to holding the keys, not to holding a pot of cash. This
  should be confirmed with counsel and reflected in our permissions/registration approach.
- On the security side, the system is built so this can be hardened to bank-grade key protection
  before we go live (keys held in specialised secure hardware / split so no single system can misuse
  them). That hardening is the main pre-launch security task.

## 7. Transparency and audit trail

- The platform keeps a **complete, ordered history of every listing** — from the first sale through
  every resale — on the public record, so ownership and activity can be independently verified.
- We also run an internal check that flags any share movement that wasn't properly recorded, as an
  audit safety net.

## 8. What's built vs. what still needs decisions

**Built and tested** (working end-to-end in a test environment):
identity verification records, sanctions/risk status, jurisdiction and ownership rules, lock-ups,
account freeze and platform pause, the GBP digital pound plus USDC/USDT support, the combined
pounds balance, fractional share listings, buying, reselling, royalty-payout records, tier NFTs
(digital collectibles/perks), the public trade history, the audit safety net, and the admin
dashboard.

**Not yet live / needs a decision:**

| Item | Decision needed from |
|---|---|
| Which identity-verification (KYC/AML) provider we use, and which countries/tiers we support | Product + Legal |
| Bank-grade key custody hardening (the main pre-launch security step) | Product (budget) + Legal |
| How users get pounds in and cash out (on-ramp / off-ramp) | Product + Legal |
| Whether listings can be edited before going live, or are fixed once created | Product |
| Handling of a stampede on a popular new listing (waitlist / lottery / limits) | Product |
| FCA custody/safeguarding position and registration path | Legal |
| Privacy notice covering the public-ledger permanence and the data "fingerprint" (§5) | Legal |
| Independent third-party security audit before public launch | Product + Legal |

## 9. Bottom line

The product is **feature-complete for a controlled test launch** and has been proven end-to-end in
a test environment. The remaining work before a public launch is mostly **operational and legal**,
not building new features: choosing an identity provider, hardening how we protect user keys, wiring
up money in/out, an external security review, and the legal groundwork around custody and privacy.

Happy to walk through any of this in person.
