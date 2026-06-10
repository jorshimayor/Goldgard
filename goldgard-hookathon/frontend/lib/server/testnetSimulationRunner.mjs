import { createPublicClient, http } from "viem";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";

const execFileAsync = promisify(execFile);

export const defaultTestnetSimulationCases = [
  {
    label: "sepolia_price_up_10pct_5steps",
    chainId: 11155111,
    moveBps: 1000,
    steps: 5,
    amountPerStep: "10000000000000000000000",
    directionUp: true,
    description: "Default Sepolia upward swing replay using the existing Foundry simulation.",
  },
];

export async function runTestnetSimulationBatch(options = {}) {
  const workingDir = options.workingDir ?? process.cwd();
  const cases =
    Array.isArray(options.cases) && options.cases.length > 0
      ? options.cases
      : defaultTestnetSimulationCases;

  const generatedAt = new Date().toISOString();
  const results = [];

  for (const simulationCase of cases) {
    const result = await runPriceSwingCase({
      ...simulationCase,
      workingDir,
    });
    results.push(result);
  }

  const report = {
    generatedAt,
    totalCases: results.length,
    successfulCases: results.filter((item) => item.ok).length,
    failedCases: results.filter((item) => !item.ok).length,
    cases: results,
  };

  const persisted = options.persistReport
    ? await persistSimulationReport(report, {
        workingDir,
        reportBasename: options.reportBasename,
      })
    : null;

  return {
    ...report,
    persisted,
    markdown: formatTestnetSimulationReport(report),
  };
}

export async function runPriceSwingCase(simulationCase) {
  const chainId = Number(simulationCase.chainId ?? 11155111);
  if (chainId !== 11155111) {
    throw new Error(`Unsupported testnet chainId for rerun capture: ${chainId}`);
  }

  const envConfig = resolveChainConfig(chainId);
  if (!envConfig.rpcUrl || !envConfig.privateKey) {
    throw new Error(
      `Missing ${envConfig.rpcEnvName}/${envConfig.privateKeyEnvName}. Live testnet reruns require valid server-side credentials.`,
    );
  }

  const contractsDir = resolve(simulationCase.workingDir, "../contracts");
  const forge = process.env.FORGE_BIN ?? "forge";
  const demoConfig = "../frontend/app/config/demoConfig.sepolia.json";
  const broadcastPath = resolve(
    contractsDir,
    `broadcast/SimulatePriceSwing.s.sol/${chainId}/run-latest.json`,
  );

  const env = {
    ...process.env,
    PRIVATE_KEY: normalizePrivateKey(envConfig.privateKey),
    DEMO_CONFIG: demoConfig,
    MOVE_BPS: String(simulationCase.moveBps ?? 1000),
    STEPS: String(simulationCase.steps ?? 5),
    DIRECTION_UP: simulationCase.directionUp ? "true" : "false",
    AMOUNT_PER_STEP: String(
      simulationCase.amountPerStep ?? "10000000000000000000000",
    ),
  };

  const startedAt = new Date().toISOString();
  let stdout = "";
  let stderr = "";

  try {
    const executed = await execFileAsync(
      forge,
      [
        "script",
        "script/SimulatePriceSwing.s.sol:SimulatePriceSwing",
        "--rpc-url",
        envConfig.rpcUrl,
        "--broadcast",
        "--slow",
      ],
      { cwd: contractsDir, env },
    );
    stdout = executed.stdout;
    stderr = executed.stderr;
  } catch (error) {
    const failedStdout = typeof error?.stdout === "string" ? error.stdout : "";
    const failedStderr = typeof error?.stderr === "string" ? error.stderr : "";
    const partialTransactions = await collectBroadcastTransactions({
      rpcUrl: envConfig.rpcUrl,
      broadcastPath,
      useCaseLabel: simulationCase.label,
      description: simulationCase.description ?? "",
    }).catch(() => []);
    return {
      label: simulationCase.label,
      description: simulationCase.description ?? "",
      chainId,
      ok: false,
      startedAt,
      completedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
      stdout: failedStdout,
      stderr: failedStderr,
      parameters: summarizeCaseParameters(simulationCase),
      transactionCount: partialTransactions.length,
      broadcastPath,
      transactions: partialTransactions,
    };
  }

  const transactions = await collectBroadcastTransactions({
    rpcUrl: envConfig.rpcUrl,
    broadcastPath,
    useCaseLabel: simulationCase.label,
    description: simulationCase.description ?? "",
  });

  return {
    label: simulationCase.label,
    description: simulationCase.description ?? "",
    chainId,
    ok: true,
    startedAt,
    completedAt: new Date().toISOString(),
    parameters: summarizeCaseParameters(simulationCase),
    stdout,
    stderr,
    transactionCount: transactions.length,
    broadcastPath,
    transactions,
  };
}

export async function persistSimulationReport(report, options = {}) {
  const workingDir = options.workingDir ?? process.cwd();
  const rootDir = resolve(workingDir, "..");
  const basename = options.reportBasename ?? "TESTNET_SIMULATION_RERUNS";
  const markdownPath = resolve(rootDir, `${basename}.md`);
  const jsonPath = resolve(rootDir, `${basename}.json`);

  await mkdir(dirname(markdownPath), { recursive: true });
  await writeFile(markdownPath, `${formatTestnetSimulationReport(report)}\n`, "utf8");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  return { markdownPath, jsonPath };
}

export function formatTestnetSimulationReport(report) {
  const lines = [];
  lines.push("# Goldgard Testnet Simulation Rerun Report");
  lines.push("");
  lines.push(`- generatedAt: ${report.generatedAt}`);
  lines.push(`- totalCases: ${report.totalCases}`);
  lines.push(`- successfulCases: ${report.successfulCases}`);
  lines.push(`- failedCases: ${report.failedCases}`);
  lines.push("");

  for (const result of report.cases) {
    lines.push(`## ${result.label}`);
    lines.push("");
    lines.push(`- status: ${result.ok ? "success" : "failed"}`);
    if (result.description) lines.push(`- description: ${result.description}`);
    lines.push(`- chainId: ${result.chainId}`);
    lines.push(`- startedAt: ${result.startedAt}`);
    lines.push(`- completedAt: ${result.completedAt}`);
    lines.push(
      `- parameters: directionUp=${result.parameters.directionUp}, moveBps=${result.parameters.moveBps}, steps=${result.parameters.steps}, amountPerStep=${result.parameters.amountPerStep}`,
    );
    if (!result.ok) lines.push(`- error: ${result.error}`);
    lines.push(`- transactionCount: ${result.transactionCount ?? result.transactions?.length ?? 0}`);
    if (!result.ok && (result.transactionCount ?? 0) > 0) {
      lines.push(`- note: mined transactions below completed successfully before the case failed.`);
    }
    lines.push("");
    if ((result.transactions?.length ?? 0) > 0) {
      lines.push(
        "| Use Case | Function | Hash | Block | Timestamp | Gas Used | Status |",
      );
      lines.push("| --- | --- | --- | --- | --- | --- | --- |");
      for (const tx of result.transactions) {
        lines.push(
          `| ${tx.useCaseLabel} | ${tx.functionName ?? "unknown"} | ${tx.hash} | ${tx.blockNumber} | ${tx.timestamp} | ${tx.gasUsed} | ${tx.status} |`,
        );
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

async function collectBroadcastTransactions({
  rpcUrl,
  broadcastPath,
  useCaseLabel,
  description,
}) {
  const broadcast = JSON.parse(await readFile(broadcastPath, "utf8"));
  const publicClient = createPublicClient({ transport: http(rpcUrl) });
  const receiptsByHash = new Map(
    (broadcast.receipts ?? [])
      .filter((receipt) => receipt?.transactionHash)
      .map((receipt) => [String(receipt.transactionHash).toLowerCase(), receipt]),
  );
  const transactions = [];

  for (const tx of broadcast.transactions ?? []) {
    if (!tx.hash) continue;
    const receiptSnapshot = receiptsByHash.get(String(tx.hash).toLowerCase());
    if (receiptSnapshot && receiptSnapshot.status !== "0x1") continue;

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: tx.hash,
      confirmations: 1,
      timeout: 120_000,
    });
    if (receipt.status !== "success") continue;

    const block = await publicClient.getBlock({ blockHash: receipt.blockHash });
    transactions.push({
      useCaseLabel,
      description,
      hash: tx.hash,
      functionName: tx.function ?? null,
      contractAddress: tx.contractAddress ?? tx.transaction?.to ?? null,
      from: tx.transaction?.from ?? null,
      to: tx.transaction?.to ?? null,
      nonce: parseNumericHex(tx.transaction?.nonce),
      gasLimit: parseNumericHex(tx.transaction?.gas),
      gasUsed: receipt.gasUsed.toString(),
      effectiveGasPrice: receipt.effectiveGasPrice?.toString() ?? null,
      cumulativeGasUsed: receipt.cumulativeGasUsed.toString(),
      blockNumber: receipt.blockNumber.toString(),
      blockHash: receipt.blockHash,
      transactionIndex: receipt.transactionIndex,
      timestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
      status: receipt.status,
      logs: receipt.logs.map((log) => ({
        address: log.address,
        blockNumber: log.blockNumber?.toString() ?? null,
        logIndex: log.logIndex ?? null,
        transactionIndex: log.transactionIndex ?? null,
        data: log.data,
        topics: [...log.topics],
      })),
      arguments: tx.arguments ?? [],
    });
  }

  return transactions;
}

function resolveChainConfig(chainId) {
  if (chainId === 11155111) {
    return {
      rpcEnvName: "SEPOLIA_RPC_URL",
      privateKeyEnvName: "SEPOLIA_PRIVATE_KEY or PRIVATE_KEY",
      rpcUrl: process.env.SEPOLIA_RPC_URL,
      privateKey: process.env.SEPOLIA_PRIVATE_KEY ?? process.env.PRIVATE_KEY,
    };
  }

  throw new Error(`Unsupported chainId: ${chainId}`);
}

function summarizeCaseParameters(simulationCase) {
  return {
    directionUp: Boolean(simulationCase.directionUp),
    moveBps: Number(simulationCase.moveBps ?? 1000),
    steps: Number(simulationCase.steps ?? 5),
    amountPerStep: String(
      simulationCase.amountPerStep ?? "10000000000000000000000",
    ),
  };
}

function parseNumericHex(value) {
  if (typeof value !== "string") return null;
  if (!value.startsWith("0x")) return value;
  return parseInt(value, 16);
}

function normalizePrivateKey(value) {
  if (!value) return value;
  return value.startsWith("0x") ? value : `0x${value}`;
}
