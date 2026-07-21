"use client";

import { useEffect, useRef } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { OnchainSuite } from "@onchainsuite/sdk";

/**
 * OnchainSuite in-app push notifications for the Goldgard hook dashboard.
 *
 * Headless: when a wallet connects (RainbowKit/wagmi) it authenticates the
 * address with OnchainSuite (challenge → wallet signature → verify), opens the
 * realtime socket, and renders incoming campaign/automation pushes with the
 * SDK's built-in toast UI. Unmount/disconnect tears the socket down.
 */
export default function OnchainSuiteNotifications() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  // wagmi hook identity changes across renders — keep the latest in a ref so
  // the connect effect doesn't tear the socket down on every render.
  const signRef = useRef(signMessageAsync);
  signRef.current = signMessageAsync;

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_ONCHAINSUITE_PUBLISHABLE_KEY;
    if (!key || !isConnected || !address) return;

    const os = new OnchainSuite(key, {
      apiBaseUrl:
        process.env.NEXT_PUBLIC_ONCHAINSUITE_API_URL ??
        "https://api.onchainsuite.com",
      // Sign through wagmi so WalletConnect/mobile wallets work too (the
      // SDK's window.ethereum default only covers injected wallets).
      signMessage: async (message, wallet) =>
        signRef.current({ message, account: wallet as `0x${string}` }),
    });

    os.start(address).catch((err) => {
      console.warn("[onchainsuite] start failed:", err);
    });
    return () => os.stop();
  }, [address, isConnected]);

  return null;
}
