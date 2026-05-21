"use client";

import { RainbowKitProvider, darkTheme, getDefaultConfig } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, WagmiProvider } from "wagmi";
import { foundry, sepolia } from "wagmi/chains";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "00000000000000000000000000000000";
const localRpcUrl = process.env.NEXT_PUBLIC_DEMO_RPC_URL ?? "http://127.0.0.1:8545";

const globalForProviders = globalThis as unknown as {
  __gg_queryClient?: QueryClient;
  __gg_wagmiConfig?: ReturnType<typeof getDefaultConfig>;
};

const queryClient = (globalForProviders.__gg_queryClient ??= new QueryClient());

const wagmiConfig = (globalForProviders.__gg_wagmiConfig ??= getDefaultConfig({
  appName: "Goldgard Hook",
  projectId,
  chains: [foundry, sepolia],
  transports: {
    [foundry.id]: http(localRpcUrl),
    [sepolia.id]: http(),
  },
  ssr: false,
}));

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
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
