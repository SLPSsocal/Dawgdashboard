"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { checkInReservation } from "@/app/reservations/actions";

export type CheckInCandidate = {
  id: string;
  animalName: string;
  parentName: string | null;
  typeName: string | null;
  startDate: string;
  /** Lives in Gingr during migration — listed so staff can see the dog is
   *  expected, but checked in from Gingr rather than here. */
  inGingr?: boolean;
};

// Typeahead "who's arriving?" dialog. Lives on its own so the header nav and
// any page-level entry point can both open it without duplicating the list.
export default function QuickCheckInDialog({
  open,
  setOpen,
  candidates,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  candidates: CheckInCandidate[];
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState(candidates);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setItems(candidates), [candidates]);

  useEffect(() => {
    if (open) {
      setQuery("");
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? items.filter(
          (c) =>
            c.animalName.toLowerCase().includes(q) ||
            (c.parentName ?? "").toLowerCase().includes(q)
        )
      : items;
    return base.slice(0, 8);
  }, [items, query]);

  function pick(c: CheckInCandidate) {
    // Gingr rows are read-only here — the proxy is a one-way feed, so there is
    // no way to write the check-in back to Gingr. The board treats them the
    // same way ("in Gingr" badge, no check-in button).
    if (c.inGingr) return;
    setCheckingId(c.id);
    startTransition(async () => {
      try {
        await checkInReservation(c.id);
        setItems((prev) => prev.filter((x) => x.id !== c.id));
      } finally {
        setCheckingId(null);
      }
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-20" onClick={() => setOpen(false)}>
      <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Quick Check-in</h2>
          <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Close">
            ✕
          </button>
        </div>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a dog or parent name…"
          className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        />
        <div className="mt-2 max-h-72 overflow-y-auto">
          {results.length === 0 && (
            <p className="px-1 py-4 text-center text-sm text-slate-400 dark:text-slate-500">
              {items.length === 0 ? "No dogs are expected right now." : "No matches."}
            </p>
          )}
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={c.inGingr || (isPending && checkingId === c.id)}
              onClick={() => pick(c)}
              title={c.inGingr ? "This stay lives in Gingr — check this dog in from Gingr until cutover." : undefined}
              className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm disabled:opacity-50 ${
                c.inGingr ? "cursor-default" : "hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <span>
                <span className="font-medium">{c.animalName}</span>
                {c.inGingr && <span className="ml-1 text-[12px] text-indigo-500 dark:text-indigo-400">✱</span>}{" "}
                <span className="text-slate-400 dark:text-slate-500">
                  {c.parentName ? `· ${c.parentName}` : ""} {c.typeName ? `· ${c.typeName}` : ""}
                </span>
              </span>
              {c.inGingr ? (
                <span className="shrink-0 whitespace-nowrap rounded-md bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300">
                  in Gingr
                </span>
              ) : (
                <span className="shrink-0 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                  {checkingId === c.id && isPending ? "Checking in…" : "Check in →"}
                </span>
              )}
            </button>
          ))}
        </div>
        {results.some((c) => c.inGingr) && (
          <p className="mt-2 border-t border-slate-100 px-1 pt-2 text-[12px] text-slate-400 dark:border-slate-800 dark:text-slate-500">
            ✱ Still managed in Gingr — check these dogs in from Gingr until cutover.
          </p>
        )}
      </div>
    </div>
  );
}

