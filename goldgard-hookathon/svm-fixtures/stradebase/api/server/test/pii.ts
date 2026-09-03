import assert from "node:assert";
import { canonicalJson, commit, newSalt, verify, assertUsername } from "../src/services/pii.js";

// Key order must not change the commitment.
const a = { name: "Ada", dob: "1815-12-10", addr: { city: "London", line1: "1 St" } };
const b = { addr: { line1: "1 St", city: "London" }, dob: "1815-12-10", name: "Ada" };
assert.equal(canonicalJson(a as any), canonicalJson(b as any));

const salt = newSalt();
assert.equal(commit(a as any, salt).length, 32);
assert.ok(commit(a as any, salt).equals(commit(b as any, salt)));
assert.ok(verify(a as any, salt, commit(b as any, salt)));

// Different salt -> different commitment (so cross-user correlation is impossible).
assert.ok(!commit(a as any, salt).equals(commit(a as any, newSalt())));
// Any change to the data breaks verification.
assert.ok(!verify({ ...a, name: "Adam" } as any, salt, commit(a as any, salt)));
// undefined is rejected, not silently dropped.
assert.throws(() => canonicalJson({ x: undefined } as any));
assert.throws(() => commit(a as any, Buffer.alloc(16)));

for (const ok of ["abc", "alice_01", "a".repeat(32)]) assert.equal(assertUsername(ok), ok);
for (const bad of ["ab", "a".repeat(33), "Alice", "a-b", "аlice"]) assert.throws(() => assertUsername(bad));

console.log("PII HELPER TESTS PASSED");
