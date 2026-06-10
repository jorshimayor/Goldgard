# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard.spec.ts >> dashboard remains responsive under live polling
- Location: e2e/dashboard.spec.ts:70:5

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 30
Received:   4.1350274415387975
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - button "Open Next.js Dev Tools" [ref=e7] [cursor=pointer]:
    - img [ref=e8]
  - alert [ref=e11]: Goldgard — Yield Shield of the LSTs
  - generic [ref=e12]:
    - banner [ref=e13]:
      - generic [ref=e14]:
        - link "GOLDGARD" [ref=e15] [cursor=pointer]:
          - /url: /
          - generic [ref=e16]: GOLDGARD
        - navigation [ref=e17]:
          - link "Landing" [ref=e18] [cursor=pointer]:
            - /url: /
          - link "Dashboard" [ref=e19] [cursor=pointer]:
            - /url: /dashboard
          - link "Demo Console" [ref=e20] [cursor=pointer]:
            - /url: /demo
        - generic [ref=e21]:
          - generic [ref=e22]: Sepolia
          - button "Connect Wallet" [ref=e24] [cursor=pointer]
    - main [ref=e25]:
      - generic [ref=e27]:
        - generic [ref=e28]:
          - heading "Shieldwall" [level=1] [ref=e29]
          - paragraph [ref=e30]: Live network telemetry and protocol status
          - generic [ref=e31]:
            - generic [ref=e32]:
              - img [ref=e33]
              - generic [ref=e38]: Local Anvil
            - generic [ref=e41]: RPC ok
            - generic [ref=e44]: Events ok
            - generic [ref=e46]: ᚱ
            - generic [ref=e47]:
              - generic [ref=e48]: Reactive Sentinel
              - generic [ref=e49]: Quiet
            - generic [ref=e50]:
              - generic [ref=e51]: block 15
              - generic [ref=e52]:
                - img [ref=e53]
                - generic [ref=e55]: 1.16 gwei
        - generic [ref=e56]:
          - generic [ref=e57]:
            - generic [ref=e58]:
              - generic [ref=e60]:
                - generic [ref=e61]:
                  - img [ref=e63]
                  - generic [ref=e66]: SafetyModule Assets
                - generic [ref=e67]:
                  - generic [ref=e68]: "1.3539"
                  - generic [ref=e69]: live (USDC)
              - generic [ref=e71]:
                - generic [ref=e72]:
                  - img [ref=e74]
                  - generic [ref=e79]: GGARD Balance
                - generic [ref=e80]:
                  - generic [ref=e81]: —
                  - generic [ref=e82]: connected wallet (raw units)
              - generic [ref=e84]:
                - generic [ref=e85]:
                  - img [ref=e87]
                  - generic [ref=e89]: Policy Params
                - generic [ref=e91]:
                  - generic [ref=e92]:
                    - generic [ref=e93]: premiumBps
                    - generic [ref=e94]: "2"
                  - generic [ref=e95]:
                    - generic [ref=e96]: coverageCapBps
                    - generic [ref=e97]: "10000"
            - generic [ref=e98]:
              - generic [ref=e99]:
                - generic [ref=e100]:
                  - generic [ref=e101]:
                    - img [ref=e102]
                    - generic [ref=e104]: IL Comparison
                  - heading "SafetyModule Assets (Live)" [level=1] [ref=e105]
                - generic [ref=e108]: Live
              - paragraph [ref=e109]: Rolling in-memory time series from on-chain reads (updates ≤ 5s)
              - img [ref=e114]:
                - generic [ref=e120]: 12:12:29 PM
                - generic [ref=e122]:
                  - generic [ref=e124]: "0"
                  - generic [ref=e126]: "0.35"
                  - generic [ref=e128]: "0.7"
                  - generic [ref=e130]: "1.05"
                  - generic [ref=e132]: "1.4"
          - complementary [ref=e136]:
            - generic [ref=e138]:
              - generic [ref=e139]:
                - heading "Wallet" [level=2] [ref=e140]
                - generic [ref=e143]: Not connected
              - generic [ref=e144]:
                - generic [ref=e145]:
                  - generic [ref=e146]: Address
                  - code [ref=e147]: —
                - generic [ref=e149]:
                  - generic [ref=e150]:
                    - generic [ref=e151]: LST balance
                    - generic [ref=e152]: —
                  - generic [ref=e153]:
                    - generic [ref=e154]: USDC balance
                    - generic [ref=e155]: —
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
  44 |   await expect(select).toBeVisible({ timeout: uiTimeoutMs });
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
> 91 |   expect(fps).toBeGreaterThan(30);
     |               ^ Error: expect(received).toBeGreaterThan(expected)
  92 | });
  93 | 
```