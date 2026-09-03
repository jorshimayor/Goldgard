# Security & compliance

The security model of the on-chain programs and the backend, the controls enforced, and the open
items before a public launch.

## Compliance controls (enforced on-chain)

These are enforced automatically — a transaction that breaks a rule cannot complete:

- **Identity (KYC):** a wallet must have an identity record at the required level before it can buy
  or hold shares.
- **Compliance status:** each wallet is `Ok`, `Restricted`, or `Frozen`. `Frozen` blocks all
  transfers; `Restricted` may receive but not send or buy. The status is **reason-free** on-chain —
  the reason lives only in the backend's case file.
- **Jurisdiction & accreditation:** a listing can restrict holders to allowed countries and/or
  require accredited investors.
- **Ownership caps:** per-wallet and global (basis-points) caps limit concentration in a listing.
- **Lock-ups:** shares can be non-transferable for a set period after purchase.
- **Freeze & pause:** individual accounts can be frozen; a global pause halts all activity.

Enforcement happens twice: inline in `buy_shares` for primary sales, and again in the `transfer_hook`
on every secondary transfer.

## What is verified safe on-chain

- **The transfer hook can't be spoofed.** It resolves all its accounts on-chain from the mint and
  verifies program ownership before reading them; a caller cannot substitute fake compliance data.
  Missing compliance accounts fail closed.
- **No over-issue.** Minting is hard-capped at the listing's total supply.
- **Trade records are bound to real transfers.** `record_secondary_trade` introspects the
  transaction and only writes a record if a matching Token-2022 transfer (mint, amount, seller, and
  the buyer's token account) is present in the same transaction — the ledger can't be forged.
- **Distribution records are replay-safe.** Each payout record is initialized once per index; a
  replay can't overwrite a prior payout, and the recorded total is monotonic.
- **Authority separation.** Ops and compliance authorities are distinct; `initialize_global` is gated
  to the program's upgrade authority so the platform can't be seized right after deploy; admin actions
  use signature + ownership checks.

## Privacy & data protection

- **No PII on-chain.** Only `sha256(salt || canonical_json(pii))` is stored. The 32-byte per-user
  salt lives (encrypted) in the backend; deleting it makes the commitment unlinkable — the
  right-to-erasure mechanism.
- **Public by design:** wallet address, optional username, country code, and trade history are on the
  public ledger. A username deliberately links a person's activity, so it is opt-in and requires the
  user's own signature.
- **Legal notes to carry into the privacy notice:** while the salt exists the commitment is still
  personal data under UK GDPR (pseudonymisation, not anonymisation); and some facts are permanently
  public and cannot be erased (e.g. "this wallet passed KYC on date T", "this wallet is in GB").

## Custody — the top production risk

The platform is **custodial**: it holds users' wallet keys. The programs accept any valid signature,
so protection of user assets lives entirely in **how keys are held and used** — off-chain. The
codebase is built for this: all writes sign through a `TxSigner` seam, so a KMS/MPC signer drops in
without touching the on-chain code. See [backend-handover.md](backend-handover.md) for the
implementation.

Key points:
- **Holding user keys is custody under FCA rules**, even though users initiate every transaction and
  no shared vault holds funds. This is a safeguarding obligation to confirm with counsel.
- Harden before launch: keys in an HSM/KMS or MPC/TSS (no single system holds a whole key), signing
  policy (rate/amount/destination limits, anomaly detection), an audit log of every custodial
  signature, and separation of the platform authority keys.
- The `ADMIN_SECRET_KEY` currently combines SBTS mint + freeze authority — split it and secure it.
- The program **upgrade authority** should move to a timelocked multisig for production.

## Known limitation

- **Ownership caps are per-wallet.** A single entity can exceed a listing's per-wallet or global cap
  by splitting across verified wallets. On-chain balances can't express beneficial ownership;
  enforce concentration limits at the identity/entity layer during KYC.

## Testing that backs this

`anchor test` covers the primary + secondary flows, identity/usernames/PII, and every transfer-hook
rejection (frozen, restricted-sender, blocked, paused, over-cap, locked-up, wrong-jurisdiction,
non-accredited), plus a fuzz harness asserting supply/conservation/cap/ledger invariants across
randomized operations. See [architecture.md](architecture.md) §7 for the full suite list.

## Static-analysis triage

A pattern/AST scanner (Sentio-style) was run over both programs. Its 27 findings were triaged; none
were exploitable. Recorded here so a future auditor doesn't re-flag the false positives.

| Rule | Sev | Verdict | Reason |
|---|---|---|---|
| SW002 Missing owner check (×6, transfer-hook `Execute` accounts) | critical | **False positive** | Every account is owner-checked at runtime — `load()`/`load_optional()` do `require_keys_eq!(*info.owner, royalty_shares::ID)` before deserializing — and is resolved on-chain by Token-2022 from the `ExtraAccountMetaList`, so it can't be substituted. The tool can't see runtime guards (its stated AST limitation). |
| SW021 PDA seed collision (×4, `[LISTING_SEED, artist, song_id]`) | high | **False positive** | Both "variable" seeds are fixed 32 bytes (`Pubkey` and `[u8; 32]`); `32+32` can't be re-partitioned. The rule targets variable-length `String::as_bytes()`. |
| SW024 Division by zero (×2, `/ BPS_DENOMINATOR`) | high | **False positive** | Divisor is a `const u64 = 10_000` — never zero, never user-supplied. |
| SW013 PDA seed = unvalidated account (×2) | high | **False positive** | `create_listing`'s `share_mint` is address-constrained by its own `seeds`; `register_identity`'s `user` is a deliberate identity seed and the instruction is compliance-authority-gated. |
| SW005 Unchecked arithmetic (×1) | high | **False positive; hardened** | Two `u16`→`u64` values (max 131070) — can't overflow. Switched to `checked_add` anyway for consistency. |
| SW025 unwrap() in handler (×1) | medium | **False positive; hardened** | Guarded by a preceding `len >= 9` check, so it couldn't panic. Replaced with a `let Ok(..) else { continue }` to drop the unwrap. |
| SW016 init_if_needed (×2) | medium | **Reviewed, safe** | Both guard the immutable fields with a zeroed-account first-touch check and are authority/owner-gated; no state-reset abuse. |
| SW027 Missing event emission (×9) | low | **Addressed** | Not a vulnerability, but valid — added `emit!` events (`events.rs`) on every state-changing instruction for indexers/dashboards. |

## Pre-mainnet checklist

1. Harden key custody (HSM/KMS or MPC/TSS, key separation, signing policy, audit log).
2. Enforce concentration limits at the KYC/entity layer.
3. Choose the KYC/AML provider and supported jurisdictions.
4. Legal sign-off on the custody position and the privacy notice.
5. Independent third-party security audit.
