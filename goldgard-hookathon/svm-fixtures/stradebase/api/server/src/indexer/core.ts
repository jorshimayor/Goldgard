/**
 * Pure parsing core — turn a fetched transaction into secondary-trade moves for one mint.
 *
 * We reconstruct transfers from **token-balance deltas** (`meta.pre/postTokenBalances`) rather
 * than by decoding instructions. That is robust to how the move was built (plain `transfer`,
 * `transferChecked`, or a hook-mediated CPI) and needs no IDL for Token-2022 — the ledger tells
 * us who lost shares and who gained them, which is exactly what a trade record is.
 *
 * Primary issuance is skipped: a `buy_shares` mint increases total supply (a net-positive
 * balance change with no matching decrease), and the program already wrote a `TradeRecord` for
 * it. Only **net-zero** movements — shares leaving one wallet and arriving at another — are
 * secondary trades. Kept dependency-free and side-effect-free so it is trivially unit-testable.
 */

/** Minimal shape of the token-balance entries we read (matches web3.js `getParsedTransaction`). */
export interface TokenBalance {
  mint: string;
  owner?: string;
  uiTokenAmount: { amount: string };
}

export interface ParsedMeta {
  err: unknown;
  preTokenBalances?: TokenBalance[] | null;
  postTokenBalances?: TokenBalance[] | null;
}

/** One reconstructed share move (owner-to-owner), before it becomes a stored `SecondaryTrade`. */
export interface ShareMove {
  seller: string;
  buyer: string;
  amount: string; // base units
  logIndex: number;
}

/**
 * Extract owner→owner share moves for `mint` from a transaction's balance deltas.
 *
 * Returns `[]` for failed txs, primary mints/burns (net supply change), and txs that don't
 * touch `mint`. A normal single transfer yields one move; a fan-out (one sender, many
 * receivers, still net-zero) yields one move per receiver, all attributed to the sole sender.
 */
export function extractShareMoves(meta: ParsedMeta | null | undefined, mint: string): ShareMove[] {
  if (!meta || meta.err) return [];

  const pre = (meta.preTokenBalances ?? []).filter((b) => b.mint === mint);
  const post = (meta.postTokenBalances ?? []).filter((b) => b.mint === mint);
  if (pre.length === 0 && post.length === 0) return [];

  // owner → net balance change (post − pre), in base units. BigInt: shares can be large.
  const delta = new Map<string, bigint>();
  const add = (owner: string | undefined, v: bigint) => {
    if (!owner) return;
    delta.set(owner, (delta.get(owner) ?? 0n) + v);
  };
  for (const b of pre) add(b.owner, -BigInt(b.uiTokenAmount.amount));
  for (const b of post) add(b.owner, BigInt(b.uiTokenAmount.amount));

  let net = 0n;
  const sellers: { owner: string; amount: bigint }[] = [];
  const buyers: { owner: string; amount: bigint }[] = [];
  for (const [owner, d] of delta) {
    net += d;
    if (d < 0n) sellers.push({ owner, amount: -d });
    else if (d > 0n) buyers.push({ owner, amount: d });
  }

  // Net supply change ⇒ mint (primary, already recorded) or burn — not a secondary trade.
  if (net !== 0n) return [];
  if (sellers.length === 0 || buyers.length === 0) return [];

  // Attribute each receiver to a sender. The common case is 1↔1. For a fan-out from a single
  // seller we credit them all to that seller; a genuine many-to-many split can't be
  // disambiguated from balances alone, so we record buyer-side and mark the seller "multiple".
  const soleSeller = sellers.length === 1 ? sellers[0].owner : null;
  return buyers.map((b, i) => ({
    seller: soleSeller ?? "multiple",
    buyer: b.owner,
    amount: b.amount.toString(),
    logIndex: i,
  }));
}
