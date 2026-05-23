import { sepolia } from "wagmi/chains";

export const supportedChains = [sepolia] as const;

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
  const raw = chainId === sepolia.id ? process.env.NEXT_PUBLIC_SEPOLIA_WS_RPC_URL : undefined;

  if (!raw) return undefined;
  if (looksLikeKeyedProviderUrl(raw)) return undefined;
  return raw;
}

export function explorerTxUrl(chainId: number, txHash: string) {
  if (chainId === sepolia.id) return `https://sepolia.etherscan.io/tx/${txHash}`;
  return undefined;
}

export function chainLabel(chainId: number) {
  if (chainId === sepolia.id) return "Sepolia";
  return `Chain ${chainId}`;
}
