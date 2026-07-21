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

const LINKS = [
  { name: "Lodging Calendar", href: "/lodging/calendar", icon: "📅" },
  { name: "Facility Calendar", href: "/facility-calendar", icon: "🗓️" },
  { name: "Parents", href: "/parents", icon: "👪" },
  { name: "Animals", href: "/animals", icon: "🐶" },
  { name: "Pricing", href: "/pricing", icon: "💲" },
  { name: "Items for Sale", href: "/retail", icon: "🛍️" },
  { name: "Waivers", href: "/waivers", icon: "✍️" },
];

function pillClass() {
  return "shrink-0 inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-indigo-500 dark:hover:text-indigo-400";
}

function CheckInPopup({
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

export default function QuickActionBar({ candidates }: { candidates: CheckInCandidate[] }) {
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      {/* Desktop / tablet: compact inline pill row. */}
      <div className="hidden md:flex flex-wrap items-center gap-1.5 text-sm">
        <button
          type="button"
          onClick={() => setCheckInOpen(true)}
          className="shrink-0 inline-flex items-center gap-1 rounded-full border border-indigo-600 bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white shadow-sm hover:bg-indigo-700"
        >
          🐾 Check-in
        </button>
        <a
          href="/reservations/new"
          className="shrink-0 inline-flex items-center gap-1 rounded-full border border-emerald-600 bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white shadow-sm hover:bg-emerald-700"
        >
          ➕ New Booking
        </a>
        {LINKS.map((l) => (
          <a key={l.href} href={l.href} className={pillClass()}>
            {l.icon} {l.name}
          </a>
        ))}
      </div>

      {/* Mobile: hamburger opens a slide-out side menu instead of a scrolling row. */}
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium shadow-sm dark:border-slate-700 dark:bg-slate-900"
        >
          ☰ Menu
        </button>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setDrawerOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute left-0 top-0 flex h-full w-72 flex-col gap-1 bg-white p-3 shadow-xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Menu</span>
              <button type="button" onClick={() => setDrawerOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Close menu">
                ✕
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setDrawerOpen(false);
                setCheckInOpen(true);
              }}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-left text-sm font-medium text-white hover:bg-indigo-700"
            >
              🐾 Check-in
            </button>
            <a
              href="/reservations/new"
              onClick={() => setDrawerOpen(false)}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-left text-sm font-medium text-white hover:bg-emerald-700"
            >
              ➕ New Booking
            </a>
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {l.icon} {l.name}
              </a>
            ))}
          </div>
        </div>
      )}

      <CheckInPopup open={checkInOpen} setOpen={setCheckInOpen} candidates={candidates} />
    </>
  );
}
