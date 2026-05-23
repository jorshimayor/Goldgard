import { expect, test } from "@playwright/test";

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
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

  const select = page.getByTestId("network-select");
  await expect(select).toBeVisible();
  await expect(select).toContainText("Sepolia");

  await expect(page.getByTestId("rpc-status")).toContainText(/RPC ok|Sync stalled/);

  const ok = await chainConfigured(page, 11155111, "0xaa36a7");
  expect(ok).toBeTruthy();

  const r = await rpc(page, 11155111, "eth_chainId");
  expect(r.ok).toBeTruthy();
  expect(r.json.result).toBe("0xaa36a7");

  const bn = await rpc(page, 11155111, "eth_blockNumber");
  expect(bn.ok).toBeTruthy();
  const latest = BigInt(bn.json.result);
  await waitForBlockToMatch(page, latest);

  const unsupported = await rpc(page, 1, "eth_chainId");
  expect(unsupported.ok).toBeFalsy();
});

test("dashboard remains responsive under live polling", async ({ page }: { page: any }) => {
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("rpc-status")).toBeVisible();

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
