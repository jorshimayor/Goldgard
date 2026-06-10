import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  defaultTestnetSimulationCases,
  runTestnetSimulationBatch,
} from "../lib/server/testnetSimulationRunner.mjs";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const configPath = args.config ?? process.env.TESTNET_SIMULATION_CONFIG;
  const reportBasename =
    args["report-basename"] ?? process.env.TESTNET_SIMULATION_REPORT_BASENAME;
  const persistReport = args["persist-report"] !== "false";

  const cases = configPath
    ? await loadCases(resolve(cwd, configPath))
    : defaultTestnetSimulationCases;

  const result = await runTestnetSimulationBatch({
    workingDir: cwd,
    cases,
    persistReport,
    reportBasename,
  });

  console.log(result.markdown);
  if (result.persisted) {
    console.error(
      `\nSaved report artifacts:\n- ${result.persisted.markdownPath}\n- ${result.persisted.jsonPath}`,
    );
  }
}

async function loadCases(path) {
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.cases)) return parsed.cases;
  throw new Error("Expected a JSON array or an object with a cases array.");
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith("--")) continue;
    const key = current.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i += 1;
    } else {
      out[key] = "true";
    }
  }
  return out;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
