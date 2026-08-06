"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { checkInReservation } from "@/app/reservations/actions";

export type CheckInCandidate = {
  id: string;
  animalName: string;
  parentName: string | null;
  typeName: string | null;
  startDate: string;
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
              {items.length === 0 ? "Nothing expected — everyone is checked in." : "No matches."}
            </p>
          )}
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={isPending && checkingId === c.id}
              onClick={() => pick(c)}
              className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"
            >
              <span>
                <span className="font-medium">{c.animalName}</span>{" "}
                <span className="text-slate-400 dark:text-slate-500">
                  {c.parentName ? `· ${c.parentName}` : ""} {c.typeName ? `· ${c.typeName}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                {checkingId === c.id && isPending ? "Checking in…" : "Check in →"}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

