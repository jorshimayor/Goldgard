"use client";

import { RainbowKitProvider, darkTheme, getDefaultConfig } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { http, WagmiProvider } from "wagmi";

import { rpcHttpPath, supportedChains } from "../lib/networks";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "00000000000000000000000000000000";

const globalForProviders = globalThis as unknown as {
  __gg_queryClient?: QueryClient;
  __gg_wagmiConfig?: ReturnType<typeof getDefaultConfig>;
  __gg_wagmiConfigKey?: string;
};

const queryClient = (globalForProviders.__gg_queryClient ??= new QueryClient());

function getWagmiConfig() {
  const wagmiConfigKey = supportedChains.map((c) => c.id).join(",");
  if (globalForProviders.__gg_wagmiConfig && globalForProviders.__gg_wagmiConfigKey === wagmiConfigKey) {
    return globalForProviders.__gg_wagmiConfig;
  }

  const transports = Object.fromEntries(supportedChains.map((c) => [c.id, http(rpcHttpPath(c.id))]));

  const next = getDefaultConfig({
    appName: "Goldgard Hook",
    projectId,
    chains: supportedChains,
    transports,
    ssr: false,
  });
  globalForProviders.__gg_wagmiConfig = next;
  globalForProviders.__gg_wagmiConfigKey = wagmiConfigKey;
  return next;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [showChildren, setShowChildren] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!mounted) return;
    setShowChildren(true);
  }, [mounted]);

  if (!mounted) return null;

  const wagmiConfig = getWagmiConfig();

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
          {showChildren ? children : null}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
