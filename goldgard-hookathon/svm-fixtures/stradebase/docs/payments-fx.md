# Payments, FX & payouts — the money model

How money enters, is valued, held, and paid out of Stradebase at scale. This is the **decided
model**: customers only ever see **pounds**, deposits are converted to GBP, and the off-ramp is a
batched treasury process built to run at tens of thousands of users.

The chain is a **ledger of record** — it never moves money (see [architecture.md](architecture.md)).
Cash settles off-chain: **BVNK** for stablecoin↔fiat conversion, a UK bank rail (Faster Payments /
Bacs) for GBP payouts.

***

## The model at a glance

```
 Customer                 Stradebase backend                        Rails / partners
 --------                 ------------------                        ----------------

 deposit $USDC  ───────▶  credit £ INSTANTLY at locked rate
                          (ledger: mint SBTS, 1 SBTS = £1)
                                    │
                                    ▼
                          pool incoming USDC
                                    │   ── net against pending £ payouts ──
                                    ▼
                          sweep the NET surplus ───────────────▶  BVNK: USDC→GBP
                                    │                                   (batched)
                                    ▼                                       │
                          keep GBP float within a band  ◀──── GBP settled ──┘

 withdraw £  ◀── burn SBTS ◀── debit ledger ──┐
 royalty £   ◀── credit £  (in-app balance) ──┤
                                              └────────────────▶  Faster Payments / Bacs
                                                                  (GBP to customer bank)
```

**One sentence:** customers see pounds instantly; behind the app, dollars are converted to pounds in
netted batches and paid out over the bank rail — no per-deposit conversion, no open currency bet.

***

## 1. The one rule: show pounds → hold pounds

The app shows balances in **SBTS, which is GBP**. That is a pound promise, so the reserve behind it
must be **pounds**. Holding dollars while showing pounds is the mistake that costs money.

Keep two FX costs apart:

| | What it is | Who pays | Danger |
|---|---|---|---|
| **Directional loss** | We promised a rate, then honoured it after the market moved against us | Platform | **Margin-killer** — unbounded |
| **Priced spread** | The known cost of converting, quoted into the rate | Customer | Safe — capped, and revenue |

Converting deposits to pounds removes the directional loss and leaves only the priced spread. That
is what protects a thin margin.

**Decision (Conrad):** pounds-only display; convert USD deposits to GBP; **SBTS is a fully-reserved
GBP claim** — every unit outstanding is backed 1:1 by pounds we hold.

***

## 2. Money in — deposit (instant pounds, batched conversion)

Split "**show** pounds now" from "**convert** to pounds now." The customer needs the first; the
second is a treasury batch. This split is what makes it scale.

1. **Credit instantly.** The moment a deposit lands, credit the customer in GBP at the current rate
   (BVNK live rate + a small **buffer spread**) and mint their SBTS. To the customer it is immediate
   and pounds-only. The indexer watches for the inbound transfer (see [pyth-indexer.md](pyth-indexer.md)).
2. **Convert in batches** (next section) — not one BVNK call per deposit.

Rate handling: use the live rate from [fx.ts](../api/server/src/services/fx.ts) (Pyth) to quote the
customer; the **buffer spread** covers the short gap until the batch actually converts, so the credit
never has to be walked back.

***

## 3. The scalable off-ramp engine

Converting each deposit individually would mean thousands of tiny conversions — bad rates, high fees,
many failure points. Instead the off-ramp runs as a **treasury process** on three principles.

### a. Net deposits against withdrawals
On any day, dollars come in and pounds go out. Convert only the **net surplus**, not both gross. If
$1M arrives and £700k of payouts are due, you off-ramp roughly the difference. At scale this is the
single biggest cost and volume reduction.

### b. Sweep and convert in batches
Pooled USDC is swept to BVNK and converted on a **schedule or threshold** (e.g. every 15–60 min, or
when it crosses a set amount) — a few large conversions instead of thousands of small ones, which
also earns BVNK's better high-volume rate.

### c. Manage a GBP float within a band
Keep a working **GBP float** (BVNK balance + bank). Deposits are backed by it; payouts draw it;
batch conversions top it up to stay inside a `[min, max]` band. Standard cash management.

### The short FX window — and how it's controlled
Between crediting a customer in pounds (§2) and converting the dollars (§3b) we briefly hold dollars
while owing pounds — a **small, short-lived** exposure. It is bounded by:

- **short batch intervals** (minutes, not days),
- the **buffer spread** (sized to absorb normal intraday moves),
- **netting** (exposed only on the surplus, never the whole flow),
- an **optional hedge** on the net position once volumes are large.

This is a tiny, managed window — the opposite of holding dollars against a pound balance
indefinitely. Full backing is preserved: `dollars (marked to GBP) + pounds held ≥ pounds owed`.

### BVNK integration
Receive USDC into a BVNK-managed wallet, then either (a) trigger **batched conversions via BVNK's
API** on your schedule, or (b) use BVNK **scheduled settlement** to auto-pay accumulated balances to
your GBP bank (batching on their side). Both fit this engine.

***

## 4. Money out — GBP payouts (redemption)

Paying out in pounds is the cleanest exit: **no conversion**, because we already hold pounds. A GBP
withdrawal is redemption of the pound claim.

```
Customer withdraws £50
  → authorize (KYC/AML, limits, Confirmation of Payee)
  → burn £50 of SBTS  (ledger debit)
  → send £50 from the GBP float to their bank
  → settle on rail confirmation   (no FX, no spread)
```

**Withdrawal state machine** (idempotent end to end so a retry never double-pays):

```
pending → authorized → executing → settled
                                 ↘ reversed (on failure: re-credit the ledger)
```

**The rail:**

| Rail | Best for | Speed | Cost |
|---|---|---|---|
| **Faster Payments (FPS)** | on-demand customer withdrawals | near-instant, 24/7 | ~free–pennies each |
| **Bacs Direct Credit** | scheduled **bulk** payouts (royalties to thousands) | 3 working days | cheapest per item, payroll-scale |

Accessed via BVNK's fiat payout and/or a UK banking partner (BaaS such as ClearBank / Modulr) that
provides the safeguarding account and FPS/Bacs connection.

**Confirmation of Payee (CoP):** verify the bank account name matches before paying — UK standard,
cuts fraud and misdirected payments.

**Crypto withdrawal (optional, secondary):** if a customer wants USDC out instead of GBP, convert
GBP→USDC via BVNK at withdrawal time and **charge that conversion spread** to the customer (it's the
one case with a round-trip cost). Default and primary is GBP-to-bank.

***

## 5. Paying royalties at scale (e.g. 50k recipients)

**Paying royalties is not 50k bank transfers.** Separate **crediting** (internal, instant) from
**disbursing** (external, metered).

- **Recommended — credit in-app:** a royalty run writes **one** on-chain `DistributionRecord` (audit
  for the whole payout) plus **one bulk ledger credit** of everyone's GBP balance. Completes in
  seconds. Customers then withdraw to bank on their own schedule (FPS), spreading the load and
  drawing the float only as needed. Do **not** mint 50k tokens on-chain per run — settle on-chain
  lazily on withdrawal, or via the pooled path in [distribute.ts](../api/server/src/services/distribute.ts)
  only if you deliberately want shares on-chain.
- **If you must push to bank:** a scheduled mass GBP payout is a **Bacs bulk file** (or batched FPS)
  — thousands of GBP transfers in one submission, no FX, cheap per item. The catch: you need the
  **full GBP liquidity that day**, which is why pull-based is preferred.

| | **Credit run** (recommended) | **Push to bank** (only if required) |
|---|---|---|
| On-chain | 1 audit tx | 1 audit tx |
| Off-chain | 50k ledger credits (one batch) | 50k GBP payouts (Bacs/FPS batch) |
| Wall-clock | seconds | Bacs T+3 / batched FPS |
| Liquidity needed now | none (customers pull later) | full 50k float |
| FX | none | none (already GBP) |

***

## 6. Reserves & reconciliation

- **Full backing:** `GBP held (BVNK + bank) ≥ SBTS outstanding × £1`, counting in-flight batch
  conversions at their marked value.
- **Daily reserve reconciliation job:** assert the inequality, alert on drift, sweep residuals from
  fees/timing. This protects solvency and lets you *prove* full backing — which the stablecoin's
  credibility and its regulator will require.

***

## 7. Fees & margin

- **FX spread (bps)** is quoted into the deposit rate (and any GBP→USDC withdrawal). Passed to the
  customer — it covers BVNK's cost and leaves a margin, so conversion is **not** a platform drain.
- **GBP-out is the cheapest exit** — no FX, just a small rail fee (pennies on FPS, less on Bacs).
- **Batching + netting** cut both fee rate (volume pricing) and per-transaction overhead.
- Directional FX risk is designed out (§1–3), so the margin is exposed only to **known, priced**
  costs. *(BVNK's exact rate is negotiated per volume — get a rate card before committing to hard
  numbers.)*

***

## 8. What Kwame builds

- **Reserve/GBP ledger** — balances in GBP (SBTS); a reserve table tracking GBP held vs SBTS
  outstanding.
- **Deposit path** — instant GBP credit at **locked rate + buffer spread**, mint on credit; indexer
  watches inbound stablecoin.
- **Off-ramp engine** — netting (deposits vs pending payouts) + scheduled/threshold **sweep** to BVNK
  + **GBP float band manager**.
- **Withdrawal service** — the state machine (`pending→authorized→executing→settled/reversed`),
  Confirmation of Payee, FPS for on-demand, Bacs for bulk; optional GBP→USDC path (charged).
- **Royalty credit job** — `record_distribution` (1 tx) + bulk ledger credit; lazy on-chain
  settlement; optional Bacs bulk push.
- **Daily reserve-reconciliation job** — prove full backing; alert + sweep on drift.
- Reuse the existing resilient submit path, indexer, idempotency, and queue/worker patterns.

***

## 9. For Conrad — decisions & licensing

- **Confirmed:** pounds-only display; deposits converted to GBP; SBTS backed 1:1 by GBP reserves.
  Customers hold pound value, not dollars shown in pounds.
- **This makes SBTS an e-money / stablecoin instrument.** Reserve, redemption, and safeguarding
  rules apply; paying GBP to customer bank accounts is regulated money movement. **BVNK** (conversion
  + settlement) and a **UK payments/BaaS partner** (FPS/Bacs + safeguarding) are the licensed rails
  to name in the permissions work.
- **Disclose the FX spread** at deposit (and on any crypto withdrawal).
- **Payout policy:** royalties credit in-app balances; customers withdraw to bank on their schedule.
  A mass push-to-bank is possible (Bacs) but needs the full float — a product call.

See [security.md](security.md) for custody (holding stablecoin between deposit and batch conversion
makes KMS/MPC a launch blocker), [pyth-indexer.md](pyth-indexer.md) for the deposit-watching indexer
and FX rate, and [architecture.md](architecture.md) for the ledger-of-record model.
