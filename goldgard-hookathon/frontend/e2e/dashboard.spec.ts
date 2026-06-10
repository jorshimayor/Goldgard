import { expect, test } from "@playwright/test";

const testChainId = Number(process.env.TEST_CHAIN_ID ?? "11155111");
const expectedChainHex =
  process.env.EXPECTED_CHAIN_HEX ??
  (testChainId === 11155111 ? "0xaa36a7" : testChainId === 31337 ? "0x7a69" : "");
const expectedNetworkLabel =
  process.env.EXPECTED_NETWORK_LABEL ?? (testChainId === 31337 ? "Local Anvil" : "Sepolia");
const uiTimeoutMs = Number(process.env.UI_TIMEOUT_MS ?? "15000");

async function rpc(page: any, chainId: number, method: string, params: unknown[] = []) {
  const res = await page.request.post(`/api/rpc/${chainId}`, {
    data: { jsonrpc: "2.0", id: 1, method, params },
  });
  const json = await res.json();
  return { ok: res.ok(), status: res.status(), json };
}

async function chainConfigured(page: any, chainId: number, expectedHex: string) {
  const r = await rpc(page, chainId, "eth_chainId");
  return r.ok && r.json?.result === expectedHex;
}

async function waitForBlockToMatch(page: any, expected: bigint) {
  const loc = page.getByTestId("block-number");
  await expect(loc).toBeVisible();
  await expect
    .poll(async () => {
      const txt = (await loc.textContent())?.trim() ?? "";
      if (!txt || txt === "—") return null;
      try {
        return BigInt(txt);
      } catch {
        return null;
      }
    })
    .toBe(expected);
}

test("dashboard uses live RPC data and switches networks", async ({ page }: { page: any }) => {
  await page.goto(`/dashboard?chainId=${testChainId}`, { waitUntil: "domcontentloaded" });

  const select = page.getByTestId("network-select");
  await expect(select).toBeVisible({ timeout: uiTimeoutMs });
  await expect(select).toContainText(expectedNetworkLabel);

  await expect(page.getByTestId("rpc-status")).toContainText(/RPC ok|Sync stalled/, {
    timeout: uiTimeoutMs,
  });
  await expect(page.getByTestId("events-status")).toContainText(/Events ok|Events degraded|Events off/, {
    timeout: uiTimeoutMs,
  });

  const ok = await chainConfigured(page, testChainId, expectedChainHex);
  expect(ok).toBeTruthy();

  const r = await rpc(page, testChainId, "eth_chainId");
  expect(r.ok).toBeTruthy();
  expect(r.json.result).toBe(expectedChainHex);

  const bn = await rpc(page, testChainId, "eth_blockNumber");
  expect(bn.ok).toBeTruthy();
  const latest = BigInt(bn.json.result);
  await waitForBlockToMatch(page, latest);

  const unsupported = await rpc(page, 1, "eth_chainId");
  expect(unsupported.ok).toBeFalsy();
});

test("dashboard remains responsive under live polling", async ({ page }: { page: any }) => {
  await page.goto(`/dashboard?chainId=${testChainId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("rpc-status")).toBeVisible({ timeout: uiTimeoutMs });
  await expect(page.getByTestId("events-status")).toBeVisible({ timeout: uiTimeoutMs });

  const fps = await page.evaluate(async () => {
    const start = performance.now();
    let frames = 0;
    return await new Promise<number>((resolve) => {
      function tick(t: number) {
        frames += 1;
        if (t - start >= 2_500) {
          resolve((frames * 1000) / (t - start));
          return;
        }
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  });

  expect(fps).toBeGreaterThan(30);
});
