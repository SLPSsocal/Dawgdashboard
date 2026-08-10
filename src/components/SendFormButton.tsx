"use client";

import { useState, useTransition } from "react";
import { createAndSendPrecheckinLink } from "@/app/precheckin/actions";

// One-click "text the parent their pre-check-in form" from a board row.
// Texts via Quo when connected; otherwise surfaces the link with a copy
// button so staff can paste it into any channel.
export default function SendFormButton({
  reservationId,
  facilityId,
  animalId,
  parentId,
  phone,
}: {
  reservationId: string;
  facilityId: string;
  animalId: string;
  parentId: string | null;
  phone: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ url: string; sent: boolean; reason?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function send() {
    startTransition(async () => {
      try {
        const r = await createAndSendPrecheckinLink(reservationId, facilityId, animalId, parentId, phone);
        setResult(r);
      } catch {
        setResult({ url: "", sent: false, reason: "Failed to create link" });
      }
    });
  }

  async function copy() {
    if (!result?.url) return;
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — the url is visible in the title anyway */
    }
  }

  if (result) {
    return result.sent ? (
      <span className="whitespace-nowrap text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
        📋 Texted ✓
      </span>
    ) : result.url ? (
      <button
        type="button"
        onClick={copy}
        title={result.url}
        className="whitespace-nowrap rounded-md border border-slate-300 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 hover:border-slate-500 dark:border-slate-700 dark:text-slate-300"
      >
        {copied ? "Copied ✓" : "📋 Copy link"}
      </button>
    ) : (
      <span className="text-[11px] text-red-500">✕</span>
    );
  }

  return (
    <button
      type="button"
      onClick={send}
      disabled={isPending}
      title="Text the parent a pre-check-in form (belongings, feeding, meds — prefilled from their history)"
      className="whitespace-nowrap rounded-md border border-slate-300 px-1.5 py-0.5 text-[11px] font-medium text-slate-500 hover:border-slate-500 hover:text-slate-800 disabled:opacity-50 dark:border-slate-700 dark:text-slate-400 dark:hover:text-slate-100"
    >
      {isPending ? "…" : "📋 Form"}
    </button>
  );
}
