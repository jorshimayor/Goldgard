"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSignMessage } from "wagmi";
import { OnchainSuite } from "@onchainsuite/sdk";
import type { Notification, NotificationActions } from "@onchainsuite/sdk";

/**
 * OnChain Suite in-app push, rendered as a Goldgard-styled toast.
 *
 * We pass `display: false` to turn OFF the SDK's built-in toast and render our
 * own with the forge/gold design system. `onNotification` is where the SDK hands
 * us each message plus an `actions` object; returning `false` also suppresses the
 * built-in UI (belt-and-suspenders alongside `display: false`). We drive the
 * analytics lifecycle by hand: `viewed` when it shows, `clicked` on the CTA,
 * `dismissed` on close/timeout. `delivered` is auto-reported by the SDK.
 *
 * Mount once with the connected wagmi address, e.g. in the dashboard layout:
 *   const { address } = useAccount();
 *   {address && <OnchainInApp wallet={address} />}
 */

const AUTO_DISMISS_MS = 7000;
const API_HOST =
  process.env.NEXT_PUBLIC_ONCHAIN_API_URL ?? "https://api.onchainsuite.com"; // host, NO /api/v1

type Toast = { id: string; n: Notification; actions: NotificationActions };

export function OnchainInApp({ wallet }: { wallet: string | null }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  // wagmi signer — the SDK signs a challenge to authenticate the wallet. Without
  // this it falls back to window.ethereum, which fails for WalletConnect / smart
  // wallets (and prompts the wrong wallet). Keep it in a ref so the effect always
  // reads the latest signer.
  const { signMessageAsync } = useSignMessage();
  const signRef = useRef(signMessageAsync);
  signRef.current = signMessageAsync;

  // Remove + report "dismissed" (user closed it or it timed out).
  const dismiss = useCallback((id: string) => {
    setToasts((list) => {
      list.find((t) => t.id === id)?.actions.dismiss();
      return list.filter((t) => t.id !== id);
    });
  }, []);

  // Remove WITHOUT reporting dismiss (used after a click, which already reported).
  const close = useCallback((id: string) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    if (!wallet) return; // push needs a connected wallet

    const os = new OnchainSuite(process.env.NEXT_PUBLIC_ONCHAIN_PK!, {
      apiBaseUrl: API_HOST,
      display: false, // turn off the built-in toast; we render our own below
      // Sign the auth challenge via wagmi — works for injected, WalletConnect, and
      // smart wallets. (This prompts a one-time signature when the wallet connects.)
      signMessage: (message, addr) =>
        signRef.current({ message, account: addr as `0x${string}` }),
      onNotification: (n, actions) => {
        actions.report("viewed"); // it's about to be shown
        setToasts((list) =>
          list.some((t) => t.id === n.deliveryId) // dedupe
            ? list
            : [...list, { id: n.deliveryId, n, actions }],
        );
        return false; // suppress the built-in renderer for this one
      },
    });

    os.on("connected", () => console.log("onchain: connected"));
    os.on("error", (e) => console.error("onchain:", e));
    os.start(wallet).catch((e) => console.error("onchain start failed:", e)); // surface auth/sign errors

    return () => {
      os.stop();
      setToasts([]);
    };
  }, [wallet]);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-3">
      {toasts.map((t) => (
        <ToastCard
          key={t.id}
          toast={t}
          onDismiss={() => dismiss(t.id)}
          onClose={() => close(t.id)}
        />
      ))}
    </div>
  );
}

function ToastCard({
  toast,
  onDismiss,
  onClose,
}: {
  toast: Toast;
  onDismiss: () => void;
  onClose: () => void;
}) {
  const { n, actions } = toast;
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const enter = requestAnimationFrame(() => setShown(true)); // slide/fade in
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS); // auto-dismiss
    return () => {
      cancelAnimationFrame(enter);
      clearTimeout(timer);
    };
  }, [onDismiss]);

  return (
    <div
      role="status"
      className={`pointer-events-auto overflow-hidden rounded-xl border border-gg-border bg-background/95 shadow-gg backdrop-blur-2xl transition-all duration-300 ${
        shown ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
      }`}
    >
      <div className="flex gap-3 p-4">
        {/* gold accent rail */}
        <span
          aria-hidden
          className="w-1 shrink-0 rounded-full bg-gradient-to-b from-gg-gold to-gg-gold-2"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-sm font-bold tracking-wide text-gg-gold">
            {n.title}
          </p>
          <p className="mt-1 font-body text-sm leading-snug text-gg-muted">
            {n.body}
          </p>
          {n.cta ? (
            <button
              type="button"
              onClick={() => {
                actions.click(); // reports "clicked" + opens cta.url
                onClose(); // remove without a second (dismiss) report
              }}
              className="mt-3 inline-flex items-center rounded-md bg-gradient-to-r from-gg-gold to-gg-gold-2 px-3 py-1.5 font-body text-xs font-semibold tracking-wide text-background transition-transform duration-200 hover:scale-[1.03]"
            >
              {n.cta.label}
            </button>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="-mr-1 -mt-1 shrink-0 self-start p-1 font-body text-gg-muted transition-colors hover:text-gg-blood"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
