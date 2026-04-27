import { z } from "zod";

import local from "../app/config/demoConfig.local.json";
import sepolia from "../app/config/demoConfig.sepolia.json";

const DemoConfigSchema = z.object({
  chainId: z.number(),
  deployer: z.string(),
  poolManager: z.string(),
  stateView: z.string(),
  hook: z.string(),
  oracleAdapter: z.string(),
  safetyModule: z.string(),
  hedgeReserve: z.string(),
  rewards: z.string(),
  swapRouter: z.string(),
  liquidityRouter: z.string(),
  token0: z.string(),
  token1: z.string(),
  mockAggregator: z.string(),
  tickSpacing: z.number(),
  fee: z.number(),
  minTick: z.number(),
  maxTick: z.number(),
});

export type DemoConfig = z.infer<typeof DemoConfigSchema>;

export function getDemoConfig(): DemoConfig {
  const which = process.env.NEXT_PUBLIC_DEMO_CONFIG ?? "local";
  const cfg = which === "sepolia" ? sepolia : local;
  return DemoConfigSchema.parse(cfg);
}

export function isConfiguredAddress(addr: string) {
  return /^0x[0-9a-fA-F]{40}$/.test(addr) && addr !== "0x0000000000000000000000000000000000000000";
}

