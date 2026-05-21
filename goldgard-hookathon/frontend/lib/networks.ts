import { foundry, goerli, mainnet, sepolia } from "wagmi/chains";

export const supportedChains = [mainnet, sepolia, goerli, foundry] as const;

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
    chainId === mainnet.id
      ? process.env.NEXT_PUBLIC_MAINNET_WS_RPC_URL
      : chainId === sepolia.id
        ? process.env.NEXT_PUBLIC_SEPOLIA_WS_RPC_URL
        : chainId === goerli.id
          ? process.env.NEXT_PUBLIC_GOERLI_WS_RPC_URL
          : chainId === foundry.id
            ? process.env.NEXT_PUBLIC_ANVIL_WS_RPC_URL
            : undefined;

  if (!raw) return undefined;
  if (looksLikeKeyedProviderUrl(raw)) return undefined;
  return raw;
}

export function explorerTxUrl(chainId: number, txHash: string) {
  if (chainId === sepolia.id) return `https://sepolia.etherscan.io/tx/${txHash}`;
  if (chainId === goerli.id) return `https://goerli.etherscan.io/tx/${txHash}`;
  if (chainId === mainnet.id) return `https://etherscan.io/tx/${txHash}`;
  return undefined;
}

export function chainLabel(chainId: number) {
  if (chainId === foundry.id) return "Anvil";
  if (chainId === sepolia.id) return "Sepolia";
  if (chainId === goerli.id) return "Goerli";
  if (chainId === mainnet.id) return "Mainnet";
  return `Chain ${chainId}`;
}
