import { chromium } from "@playwright/test";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:3001";
const chainId = Number(process.env.CHAIN_ID ?? "11155111");
const expectedNetworkLabel =
  process.env.EXPECTED_NETWORK_LABEL ?? (chainId === 31337 ? "Local Anvil" : "Sepolia");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function maybeRunSimulation() {
  if (process.env.SIMULATE !== "true") return;
  const res = await fetch(`${baseUrl}/api/simulate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chainId, directionUp: true, moveBps: 250, steps: 2 }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) {
    throw new Error(`simulate failed (${res.status}): ${JSON.stringify(json)}`);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];

  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.goto(`${baseUrl}/dashboard?chainId=${chainId}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(8_000);

  const networkSelect = page.getByTestId("network-select");
  const rpcStatus = page.getByTestId("rpc-status");
  const eventsStatus = page.getByTestId("events-status");
  const blockNumber = page.getByTestId("block-number");

  if ((await networkSelect.count()) !== 1) throw new Error("network-select missing");
  if ((await rpcStatus.count()) !== 1) throw new Error("rpc-status missing");
  if ((await eventsStatus.count()) !== 1) throw new Error("events-status missing");

  const networkText = (await networkSelect.textContent()) ?? "";
  const rpcText = (await rpcStatus.textContent()) ?? "";
  const eventsText = (await eventsStatus.textContent()) ?? "";
  const blockText = ((await blockNumber.textContent()) ?? "").trim();

  if (!networkText.includes(expectedNetworkLabel)) {
    throw new Error(`expected network label ${expectedNetworkLabel}, got ${networkText}`);
  }
  if (!/RPC ok|Sync stalled/.test(rpcText)) {
    throw new Error(`unexpected rpc status: ${rpcText}`);
  }
  if (!/Events ok|Events degraded|Events off/.test(eventsText)) {
    throw new Error(`unexpected events status: ${eventsText}`);
  }
  if (!/^\d+$/.test(blockText)) {
    throw new Error(`unexpected block number: ${blockText}`);
  }

  await maybeRunSimulation();
  await sleep(2_000);

  const fps = await page.evaluate(async () => {
    const start = performance.now();
    let frames = 0;
    return await new Promise((resolve) => {
      function tick(t) {
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

  if (pageErrors.length > 0) {
    throw new Error(`page errors: ${pageErrors.join(" | ")}`);
  }
  if (fps < 2) {
    throw new Error(`unexpectedly low fps: ${fps}`);
  }

  console.log(`OK network=${networkText.trim()} rpc=${rpcText.trim()} events=${eventsText.trim()} fps=${fps.toFixed(2)}`);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
