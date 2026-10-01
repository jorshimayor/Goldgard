#!/usr/bin/env bash
# Copy freshly generated IDL + TS types from the Anchor build output into this
# package. Run after `anchor build` (from the repo root) whenever the on-chain
# program interface changes.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
root="$(cd "$here/../.." && pwd)"

for name in royalty_shares transfer_hook; do
  cp "$root/target/idl/$name.json" "$here/idl/$name.json"
  cp "$root/target/types/$name.ts" "$here/types/$name.ts"
  echo "synced $name"
done
