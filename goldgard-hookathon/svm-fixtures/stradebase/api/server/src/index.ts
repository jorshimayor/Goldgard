import { createApp } from "./app.js";
import { config } from "./config.js";

createApp().listen(config.port, () => {
  console.log(
    `Stradebase API on :${config.port} — cluster=${config.cluster}, admin=${config.admin.publicKey.toBase58()}`,
  );
});
