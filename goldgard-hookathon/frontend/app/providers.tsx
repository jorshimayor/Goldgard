"use client";

import { RainbowKitProvider, darkTheme, getDefaultConfig } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, WagmiProvider } from "wagmi";
import { foundry, goerli, mainnet, sepolia } from "wagmi/chains";

import { rpcHttpPath, supportedChains } from "../lib/networks";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "00000000000000000000000000000000";

const globalForProviders = globalThis as unknown as {
  __gg_queryClient?: QueryClient;
  __gg_wagmiConfig?: ReturnType<typeof getDefaultConfig>;
};

const queryClient = (globalForProviders.__gg_queryClient ??= new QueryClient());

const wagmiConfig = (globalForProviders.__gg_wagmiConfig ??= getDefaultConfig({
  appName: "Goldgard Hook",
  projectId,
  chains: supportedChains,
  transports: {
    [foundry.id]: http(rpcHttpPath(foundry.id)),
    [sepolia.id]: http(rpcHttpPath(sepolia.id)),
    [goerli.id]: http(rpcHttpPath(goerli.id)),
    [mainnet.id]: http(rpcHttpPath(mainnet.id)),
  },
  ssr: false,
}));

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig} reconnectOnMount={false}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#D4AF77",
            accentColorForeground: "#0A1428",
            borderRadius: "medium",
            overlayBlur: "small",
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
