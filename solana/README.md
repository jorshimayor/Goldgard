# StableArc Solana (SVM) programs

Native Solana programs for the StableArc settlement network. Anchor 1.1.2 /
Rust 1.89.

## `realized-rate-oracle`

The SVM sibling of the EVM `RealizedRateOracle` — self-referential price
discovery from StableArc's own realized settlement flow (no USD-referenced
feed). It is the spine the native settlement stack and the `prediction-market`
program resolve against.

- **Program ID:** `4NUdEu7crxzR1AtHhaiMLk4q1ctTvhZLREq7Pbt9KNkK`
- **Directional pairs.** State keyed at `[b"pair", token_in, token_out]`; the
  TWAP of an inverse is not the inverse of a TWAP, so both directions are
  recorded independently.
- **Instructions:** `initialize` · `set_recorder` (authority allowlists the
  settlement program) · `record` (recorder-gated realized print, ring buffer of
  32 observations) · `consult` (trailing-window TWAP) · `latest_rate` (spot).
- **CPI-friendly:** `consult`/`latest_rate` return `rate_1e18` via Anchor return
  data, so the `prediction-market` program can CPI in to resolve an FX/macro
  market from the realized rate — replacing the authority-relayed value.

### Module layout

```
programs/realized-rate-oracle/src/
  lib.rs            #[program] entry, delegates to handlers
  constants.rs      CARDINALITY, RATE_SCALE
  error.rs          OracleError
  events.rs         RateRecorded, RecorderSet, Consulted
  state.rs          Config, Recorder, Observation, PairState
  utils.rs          record_rate + twap (mirrors the EVM math)
  instructions/     one context + handler per instruction
```

## Build

```bash
anchor build
```

Program keypairs live under `target/deploy/` and are **git-ignored** — keep them
safe; they are each program's identity + upgrade authority.
