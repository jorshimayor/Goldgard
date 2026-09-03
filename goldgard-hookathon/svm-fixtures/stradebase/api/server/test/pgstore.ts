/**
 * Unit test for `PgStore` against a fake `Queryable` — validates the SQL shapes, parameter order,
 * idempotency clause, filter building, and row→`SecondaryTrade` mapping without needing a real
 * Postgres. (An integration test against a live DB would set `DATABASE_URL`; this covers the logic.)
 */
import assert from "node:assert/strict";
import { Keypair } from "@solana/web3.js";

// store.ts imports config.ts, which validates these at load — set before importing.
process.env.SBTS_MINT = "So11111111111111111111111111111111111111112";
process.env.ADMIN_SECRET_KEY = JSON.stringify(Array.from(Keypair.generate().secretKey));

const { PgStore } = await import("../src/indexer/store.js");

class FakeDb {
  calls: { text: string; params?: any[] }[] = [];
  private rows: any[] = [];
  returns(rows: any[]) { this.rows = rows; return this; }
  async query(text: string, params?: any[]) {
    this.calls.push({ text, params });
    const rows = this.rows;
    this.rows = [];
    return { rows };
  }
  last() { return this.calls.at(-1)!; }
}

const db = new FakeDb();
const store = new PgStore(db as any);

// init → idempotent schema
await store.init();
assert.match(db.last().text, /CREATE TABLE IF NOT EXISTS secondary_trades/);
assert.match(db.last().text, /CREATE TABLE IF NOT EXISTS indexer_cursors/);

// getCursor: null when absent, value when present
db.returns([]);
assert.equal(await store.getCursor("mintA"), null);
assert.deepEqual(db.last().params, ["mintA"]);
db.returns([{ last_signature: "sig1" }]);
assert.equal(await store.getCursor("mintA"), "sig1");

// setCursor: upsert on mint
await store.setCursor("mintA", "sigZ");
assert.match(db.last().text, /INSERT INTO indexer_cursors[\s\S]*ON CONFLICT \(mint\) DO UPDATE/);
assert.deepEqual(db.last().params, ["mintA", "sigZ"]);

// upsertTrade: exact param order + idempotency clause
await store.upsertTrade({
  signature: "s", logIndex: 0, mint: "m", listing: "L", seller: "S", buyer: "B", amount: "4", slot: 12, blockTime: 1000,
});
assert.deepEqual(db.last().params, ["s", 0, "m", "L", "S", "B", "4", 12, 1000]);
assert.match(db.last().text, /ON CONFLICT \(signature, log_index\) DO NOTHING/);

// listTrades: filter by listing + row mapping (pg returns bigints/epoch as strings)
db.returns([{ signature: "s", log_index: 0, mint: "m", listing: "L", seller: "S", buyer: "B", amount: "4", slot: "12", block_time: "1000" }]);
const out = await store.listTrades({ listing: "L" });
assert.deepEqual(out[0], { signature: "s", logIndex: 0, mint: "m", listing: "L", seller: "S", buyer: "B", amount: "4", slot: 12, blockTime: 1000 });
assert.match(db.last().text, /WHERE listing = \$1/);
assert.deepEqual(db.last().params, ["L"]);

// listTrades: wallet filter matches either side
db.returns([]);
await store.listTrades({ wallet: "W" });
assert.match(db.last().text, /seller = \$1 OR buyer = \$1/);

// null block_time maps to null
db.returns([{ signature: "s2", log_index: 1, mint: "m", listing: "L", seller: "S", buyer: "B", amount: "1", slot: "13", block_time: null }]);
assert.equal((await store.listTrades())[0].blockTime, null);

console.log("PGSTORE (mock) TESTS PASSED");
