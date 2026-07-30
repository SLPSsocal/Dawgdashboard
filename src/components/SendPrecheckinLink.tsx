"use client";

import { useState, useTransition } from "react";
import { createAndSendPrecheckinLink } from "@/app/precheckin/actions";

export default function SendPrecheckinLink({
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
      const r = await createAndSendPrecheckinLink(reservationId, facilityId, animalId, parentId, phone);
      setResult(r);
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={send}
        disabled={isPending}
        className="text-xs font-medium text-indigo-600 underline disabled:opacity-50 dark:text-indigo-400"
      >
        {isPending ? "Sending…" : "📋 Send Pre-Check-In Link"}
      </button>
      {result && (
        <div className="mt-2 rounded-md border border-slate-200 px-3 py-2 text-xs dark:border-slate-800">
          {result.sent ? (
            <p className="text-green-600 dark:text-green-400">Texted to {phone}.</p>
          ) : (
            <p className="text-amber-600 dark:text-amber-400">
              {result.reason ?? "Couldn't text automatically"} — copy this link instead:
            </p>
          )}
          <div className="mt-1 flex items-center gap-2">
            <input
              readOnly
              value={result.url}
              onFocus={(e) => e.target.select()}
              className="flex-1 rounded border border-slate-300 bg-slate-50 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
            />
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(result.url);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="shrink-0 text-xs text-slate-500 underline dark:text-slate-400"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
