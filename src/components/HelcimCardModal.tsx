"use client";

import { useEffect, useRef, useState } from "react";
import { startCardSession, completeHelcimSession, logAbortedAttempt } from "@/app/billing/helcim-actions";

declare global {
  interface Window {
    appendHelcimPayIframe?: (checkoutToken: string, allowExit?: boolean) => void;
  }
}

const HELCIM_SCRIPT_SRC = "https://secure.helcim.app/helcim-pay/services/start.js";

function loadHelcimScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.appendHelcimPayIframe) return resolve();
    const existing = document.querySelector(`script[src="${HELCIM_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      return;
    }
    const script = document.createElement("script");
    script.src = HELCIM_SCRIPT_SRC;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load HelcimPay.js"));
    document.head.appendChild(script);
  });
}

export default function HelcimCardModal({
  facilityId,
  parentId,
  purpose,
  invoiceId = null,
  amount,
  buttonLabel,
  className,
  onSuccess,
}: {
  facilityId: string;
  parentId: string;
  purpose: "save_card" | "charge_and_save";
  invoiceId?: string | null;
  amount: number;
  buttonLabel: string;
  className?: string;
  onSuccess?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanupRef.current?.(), []);

  async function start() {
    setLoading(true);
    setError(null);
    try {
      await loadHelcimScript();
      const { checkoutToken } = await startCardSession(facilityId, parentId, purpose, invoiceId, amount);

      const identifierKey = `helcim-pay-js-${checkoutToken}`;
      const onMessage = async (event: MessageEvent) => {
        if (event.data?.eventName !== identifierKey) return;

        if (event.data.eventStatus === "ABORTED") {
          // ABORTED only means the iframe attempt didn't complete cleanly on
          // our end — it does NOT mean Helcim declined the card. Helcim
          // sends no transaction data with this event, so we genuinely can't
          // confirm whether it actually went through on their side. Saying
          // "declined" here would be a guess that could send staff either
          // double-charging a customer who was actually charged, or telling
          // one they weren't when they were — so we log the attempt (for
          // manual cross-checking against Helcim's own dashboard by time)
          // and are honest about not knowing.
          logAbortedAttempt(facilityId, parentId, invoiceId, amount, purpose).catch(() => {});
          setError(
            "The card form closed before we could confirm the result. We can't tell from here whether Helcim actually processed it — check Helcim's dashboard for a transaction around this time before trying again, to avoid a duplicate charge."
          );
          setLoading(false);
          teardown();
          return;
        }

        if (event.data.eventStatus === "SUCCESS") {
          try {
            const raw =
              typeof event.data.eventMessage === "string"
                ? event.data.eventMessage
                : JSON.stringify(event.data.eventMessage);
            const result = await completeHelcimSession(checkoutToken, raw);
            if (!result.approved) {
              setError(
                result.looksMalformed
                  ? "We got a response back from the card form, but it didn't look like a normal approval or decline — check Helcim's dashboard for this transaction before retrying, to avoid a duplicate charge."
                  : "Card was declined."
              );
            } else {
              onSuccess?.();
            }
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save the result.");
          } finally {
            setLoading(false);
            teardown();
          }
        }

        if (event.data.eventStatus === "HIDE") {
          setLoading(false);
          teardown();
        }
      };

      function teardown() {
        window.removeEventListener("message", onMessage);
        const frame = document.getElementById("helcimPayIframe");
        frame?.remove();
        cleanupRef.current = null;
      }
      cleanupRef.current = teardown;

      window.addEventListener("message", onMessage);
      window.appendHelcimPayIframe?.(checkoutToken);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the card session.");
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={start}
        disabled={loading}
        className={
          className ??
          "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:border-slate-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-500"
        }
      >
        {loading ? "Opening secure card form…" : buttonLabel}
      </button>
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
