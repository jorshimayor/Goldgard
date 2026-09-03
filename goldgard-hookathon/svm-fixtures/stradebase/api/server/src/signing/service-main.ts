/**
 * Standalone entry for the reference custody signer service:
 *   pnpm --filter @stradebase/api signer          # listens on SIGNER_PORT (default 8090)
 *
 * Point the API at it with `SIGNER_URL=http://127.0.0.1:8090`. In production this process is
 * replaced by (or fronted by) your real KMS/MPC custody service exposing the same contract.
 */
import { createSignerApp } from "./service.js";

const port = Number(process.env.SIGNER_PORT ?? 8090);
createSignerApp().listen(port, () => {
  console.log(`[signer] reference custody service listening on :${port}`);
  console.log(`[signer] point the API at it: SIGNER_URL=http://127.0.0.1:${port}`);
});
