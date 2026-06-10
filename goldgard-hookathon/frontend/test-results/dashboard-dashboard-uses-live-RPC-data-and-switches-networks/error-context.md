# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard.spec.ts >> dashboard uses live RPC data and switches networks
- Location: e2e/dashboard.spec.ts:40:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('network-select')
Expected: visible
Timeout: 20000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 20000ms
  - waiting for getByTestId('network-select')

```

# Test source

```ts
  1  | import { expect, test } from "@playwright/test";
  2  | 
  3  | const testChainId = Number(process.env.TEST_CHAIN_ID ?? "11155111");
  4  | const expectedChainHex =
  5  |   process.env.EXPECTED_CHAIN_HEX ??
  6  |   (testChainId === 11155111 ? "0xaa36a7" : testChainId === 31337 ? "0x7a69" : "");
  7  | const expectedNetworkLabel =
  8  |   process.env.EXPECTED_NETWORK_LABEL ?? (testChainId === 31337 ? "Local Anvil" : "Sepolia");
  9  | const uiTimeoutMs = Number(process.env.UI_TIMEOUT_MS ?? "15000");
  10 | 
  11 | async function rpc(page: any, chainId: number, method: string, params: unknown[] = []) {
  12 |   const res = await page.request.post(`/api/rpc/${chainId}`, {
  13 |     data: { jsonrpc: "2.0", id: 1, method, params },
  14 |   });
  15 |   const json = await res.json();
  16 |   return { ok: res.ok(), status: res.status(), json };
  17 | }
  18 | 
  19 | async function chainConfigured(page: any, chainId: number, expectedHex: string) {
  20 |   const r = await rpc(page, chainId, "eth_chainId");
  21 |   return r.ok && r.json?.result === expectedHex;
  22 | }
  23 | 
  24 | async function waitForBlockToMatch(page: any, expected: bigint) {
  25 |   const loc = page.getByTestId("block-number");
  26 |   await expect(loc).toBeVisible();
  27 |   await expect
  28 |     .poll(async () => {
  29 |       const txt = (await loc.textContent())?.trim() ?? "";
  30 |       if (!txt || txt === "—") return null;
  31 |       try {
  32 |         return BigInt(txt);
  33 |       } catch {
  34 |         return null;
  35 |       }
  36 |     })
  37 |     .toBe(expected);
  38 | }
  39 | 
  40 | test("dashboard uses live RPC data and switches networks", async ({ page }: { page: any }) => {
  41 |   await page.goto(`/dashboard?chainId=${testChainId}`, { waitUntil: "domcontentloaded" });
  42 | 
  43 |   const select = page.getByTestId("network-select");
> 44 |   await expect(select).toBeVisible({ timeout: uiTimeoutMs });
     |                        ^ Error: expect(locator).toBeVisible() failed
  45 |   await expect(select).toContainText(expectedNetworkLabel);
  46 | 
  47 |   await expect(page.getByTestId("rpc-status")).toContainText(/RPC ok|Sync stalled/, {
  48 |     timeout: uiTimeoutMs,
  49 |   });
  50 |   await expect(page.getByTestId("events-status")).toContainText(/Events ok|Events degraded|Events off/, {
  51 |     timeout: uiTimeoutMs,
  52 |   });
  53 | 
  54 |   const ok = await chainConfigured(page, testChainId, expectedChainHex);
  55 |   expect(ok).toBeTruthy();
  56 | 
  57 |   const r = await rpc(page, testChainId, "eth_chainId");
  58 |   expect(r.ok).toBeTruthy();
  59 |   expect(r.json.result).toBe(expectedChainHex);
  60 | 
  61 |   const bn = await rpc(page, testChainId, "eth_blockNumber");
  62 |   expect(bn.ok).toBeTruthy();
  63 |   const latest = BigInt(bn.json.result);
  64 |   await waitForBlockToMatch(page, latest);
  65 | 
  66 |   const unsupported = await rpc(page, 1, "eth_chainId");
  67 |   expect(unsupported.ok).toBeFalsy();
  68 | });
  69 | 
  70 | test("dashboard remains responsive under live polling", async ({ page }: { page: any }) => {
  71 |   await page.goto(`/dashboard?chainId=${testChainId}`, { waitUntil: "domcontentloaded" });
  72 |   await expect(page.getByTestId("rpc-status")).toBeVisible({ timeout: uiTimeoutMs });
  73 |   await expect(page.getByTestId("events-status")).toBeVisible({ timeout: uiTimeoutMs });
  74 | 
  75 |   const fps = await page.evaluate(async () => {
  76 |     const start = performance.now();
  77 |     let frames = 0;
  78 |     return await new Promise<number>((resolve) => {
  79 |       function tick(t: number) {
  80 |         frames += 1;
  81 |         if (t - start >= 2_500) {
  82 |           resolve((frames * 1000) / (t - start));
  83 |           return;
  84 |         }
  85 |         requestAnimationFrame(tick);
  86 |       }
  87 |       requestAnimationFrame(tick);
  88 |     });
  89 |   });
  90 | 
  91 |   expect(fps).toBeGreaterThan(30);
  92 | });
  93 | 
```