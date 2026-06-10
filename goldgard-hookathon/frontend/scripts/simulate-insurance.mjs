import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  defaultSimulationConfig,
  formatSimulationReport,
  runInsuranceSimulation,
} from "./insuranceSimulation.mjs";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();

  const configPath = args.config ?? process.env.SIM_CONFIG;
  const reportJsonPath = args["report-json"] ?? process.env.SIM_REPORT_JSON;
  const reportMarkdownPath = args["report-md"] ?? process.env.SIM_REPORT_MD;
  const eventsJsonPath = args["events-json"] ?? process.env.SIM_EVENTS_JSON;

  const overrideConfig = configPath ? await loadJson(resolve(cwd, configPath)) : {};
  const report = runInsuranceSimulation(overrideConfig);
  const markdown = formatSimulationReport(report);

  console.log(markdown);
  if (args.json === "true" || process.env.SIM_PRINT_JSON === "true") {
    console.log(JSON.stringify(report, null, 2));
  }

  if (reportJsonPath) {
    await writeJson(resolve(cwd, reportJsonPath), report);
  }
  if (reportMarkdownPath) {
    await writeText(resolve(cwd, reportMarkdownPath), markdown);
  }
  if (eventsJsonPath) {
    await writeJson(resolve(cwd, eventsJsonPath), report.events);
  }

  if (!configPath) {
    console.error(
      `\nUsing built-in defaults. Provide --config <path> to override the baseline scenario.`,
    );
  }
}

async function loadJson(path) {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw);
}

async function writeJson(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function writeText(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${data}\n`, "utf8");
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const part = argv[i];
    if (!part.startsWith("--")) continue;
    const key = part.slice(2);
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

export { defaultSimulationConfig };
