import { z } from "zod";

import local from "../app/config/demoConfig.local.json";
import sepolia from "../app/config/demoConfig.sepolia.json";

const ZERO = "0x0000000000000000000000000000000000000000";

const DemoConfigSchema = z.object({
  callbackReceiver: z.string().optional(),
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

function emptyConfig(chainId: number): DemoConfig {
  return DemoConfigSchema.parse({
    chainId,
    deployer: ZERO,
    poolManager: ZERO,
    stateView: ZERO,
    hook: ZERO,
    oracleAdapter: ZERO,
    safetyModule: ZERO,
    hedgeReserve: ZERO,
    rewards: ZERO,
    swapRouter: ZERO,
    liquidityRouter: ZERO,
    token0: ZERO,
    token1: ZERO,
    mockAggregator: ZERO,
    tickSpacing: 0,
    fee: 0,
    minTick: 0,
    maxTick: 0,
  });
}

export function getDemoConfigForChain(chainId?: number): DemoConfig {
  const which = process.env.NEXT_PUBLIC_DEMO_CONFIG;
  if (which === "sepolia") return DemoConfigSchema.parse(sepolia);
  if (which === "local") return DemoConfigSchema.parse(local);

  if (chainId === sepolia.chainId) return DemoConfigSchema.parse(sepolia);
  if (chainId === local.chainId) return DemoConfigSchema.parse(local);

  if (chainId !== undefined) return emptyConfig(chainId);
  return DemoConfigSchema.parse(local);
}

export function getDemoConfig(): DemoConfig {
  return getDemoConfigForChain(undefined);
}

export function isConfiguredAddress(addr: string) {
  return /^0x[0-9a-fA-F]{40}$/.test(addr) && addr !== "0x0000000000000000000000000000000000000000";
}
