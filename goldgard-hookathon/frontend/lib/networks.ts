import { arbitrumSepolia, baseSepolia, foundry, optimismSepolia, polygonAmoy, sepolia } from "wagmi/chains";

export const supportedChains = [sepolia, baseSepolia, optimismSepolia, arbitrumSepolia, polygonAmoy, foundry] as const;

export type SupportedChainId = (typeof supportedChains)[number]["id"];

export function rpcHttpPath(chainId: number) {
  return `/api/rpc/${chainId}`;
}

function looksLikeKeyedProviderUrl(url: string) {
  const u = url.toLowerCase();
  if (u.includes("alchemy.com/v2/")) return true;
  if (u.includes("infura.io/v3/")) return true;
  if (u.includes("quicknode.com/")) return true;
  return false;
}

export function rpcWsUrl(chainId: number) {
  const raw =
    chainId === sepolia.id
      ? process.env.NEXT_PUBLIC_SEPOLIA_WS_RPC_URL
      : chainId === baseSepolia.id
        ? process.env.NEXT_PUBLIC_BASE_SEPOLIA_WS_RPC_URL
        : chainId === optimismSepolia.id
          ? process.env.NEXT_PUBLIC_OPTIMISM_SEPOLIA_WS_RPC_URL
          : chainId === arbitrumSepolia.id
            ? process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_WS_RPC_URL
            : chainId === polygonAmoy.id
              ? process.env.NEXT_PUBLIC_POLYGON_AMOY_WS_RPC_URL
              : chainId === foundry.id
                ? process.env.NEXT_PUBLIC_LOCAL_WS_RPC_URL
                : undefined;

  if (!raw) return undefined;
  if (looksLikeKeyedProviderUrl(raw)) return undefined;
  return raw;
}

export function explorerTxUrl(chainId: number, txHash: string) {
  if (chainId === sepolia.id) return `https://sepolia.etherscan.io/tx/${txHash}`;
  if (chainId === baseSepolia.id) return `https://sepolia.basescan.org/tx/${txHash}`;
  if (chainId === optimismSepolia.id) return `https://sepolia-optimism.etherscan.io/tx/${txHash}`;
  if (chainId === arbitrumSepolia.id) return `https://sepolia.arbiscan.io/tx/${txHash}`;
  if (chainId === polygonAmoy.id) return `https://amoy.polygonscan.com/tx/${txHash}`;
  return undefined;
}

export function chainLabel(chainId: number) {
  if (chainId === sepolia.id) return "Sepolia";
  if (chainId === baseSepolia.id) return "Base Sepolia";
  if (chainId === optimismSepolia.id) return "OP Sepolia";
  if (chainId === arbitrumSepolia.id) return "Arbitrum Sepolia";
  if (chainId === polygonAmoy.id) return "Polygon Amoy";
  if (chainId === foundry.id) return "Local Anvil";
  return `Chain ${chainId}`;
}
