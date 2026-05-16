"use client";

import { RainbowKitProvider, darkTheme, getDefaultConfig } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, WagmiProvider } from "wagmi";
import { foundry, sepolia } from "wagmi/chains";
import { useState } from "react";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "00000000000000000000000000000000";
const localRpcUrl = process.env.NEXT_PUBLIC_DEMO_RPC_URL ?? "http://127.0.0.1:8545";
const sepoliaRpcUrl = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL;

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [wagmiConfig] = useState(() =>
    getDefaultConfig({
      appName: "Goldgard Hook",
      projectId,
      chains: [foundry, sepolia],
      transports: {
        [foundry.id]: http(localRpcUrl),
        [sepolia.id]: sepoliaRpcUrl ? http(sepoliaRpcUrl) : http(),
      },
      ssr: false,
    }),
  );

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
