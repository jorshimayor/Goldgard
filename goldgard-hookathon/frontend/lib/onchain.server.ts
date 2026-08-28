const OCS = process.env.ONCHAIN_API_URL || "";
const SK = process.env.ONCHAIN_SECRET_KEY || "";

async function ocs(path: string, body?: unknown, method = "POST") {
  
    const res = await fetch(OCS + path, {
    method,
    headers: {
      Authorization: `Bearer ${SK}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  
  const json = await res.json().catch(() => ({}));
  
  if (!res.ok) throw new Error(`OCS ${res.status} ${JSON.stringify(json)}`);
  
  return json;
}
;
// event: ^[a-z0-9_.:-]{1,64}$ ; contact needs ≥1 of walletAddress/email/externalId
export const identify = (walletAddress: string) =>
  ocs("/identify", { walletAddress });

export const track = (event: string, walletAddress: string, payload?: object) =>
  ocs("/events", { event, contact: { walletAddress }, payload });

export const pushInApp = (walletAddress: string, title: string, body: string) =>
  ocs("/inapp/push", { walletAddress, title, body });
