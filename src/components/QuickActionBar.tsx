"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { checkInReservation } from "@/app/reservations/actions";
import Link from "next/link";

export type CheckInCandidate = {
  id: string;
  animalName: string;
  parentName: string | null;
  typeName: string | null;
  startDate: string;
};

// Split into what staff hit constantly vs. what they configure occasionally.
// Only the two primary actions stay as filled buttons; day-to-day destinations
// become quiet text links, and setup screens move behind a Manage menu. That
// takes the toolbar from 12 competing CTAs down to 2.
const NAV_LINKS = [
  { name: "Lodging", href: "/lodging/calendar" },
  { name: "Calendar", href: "/facility-calendar" },
  { name: "Parents", href: "/parents" },
  { name: "Animals", href: "/animals" },
];

const MANAGE_LINKS = [
  { name: "Admin Reports", href: "/admin", icon: "📈" },
  { name: "Pricing", href: "/pricing", icon: "💲" },
  { name: "Items for Sale", href: "/retail", icon: "🛍️" },
  { name: "Waivers", href: "/waivers", icon: "✍️" },
  { name: "Referral Sources", href: "/referral-sources", icon: "🔗" },
  { name: "Profile Tags", href: "/profile-tags", icon: "🏷️" },
];

const ALL_LINKS = [...NAV_LINKS, ...MANAGE_LINKS];

const PRIMARY_BTN =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-white transition-colors";

function navLinkClass(active: boolean) {
  return `inline-flex h-8 shrink-0 items-center rounded-lg px-2.5 text-[13px] transition-colors ${
    active
      ? "bg-slate-200 font-medium text-slate-900 dark:bg-slate-800 dark:text-slate-50"
      : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100"
  }`;
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
  const [manageOpen, setManageOpen] = useState(false);
  const manageRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (manageRef.current && !manageRef.current.contains(e.target as Node)) setManageOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const manageActive = MANAGE_LINKS.some((l) => pathname === l.href || pathname.startsWith(`${l.href}/`));

  return (
    <>
      {/* Desktop: two primary actions, quiet links, then a Manage menu. */}
      <div className="hidden items-center gap-1 md:flex">
        <button type="button" onClick={() => setCheckInOpen(true)} className={`${PRIMARY_BTN} bg-indigo-600 hover:bg-indigo-700`}>
          🐾 Check-in
        </button>
        <Link href="/reservations/new" className={`${PRIMARY_BTN} bg-emerald-600 hover:bg-emerald-700`}>
          ➕ New Booking
        </Link>

        <span className="mx-1.5 h-5 w-px shrink-0 bg-slate-200 dark:bg-slate-700" />

        {NAV_LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={navLinkClass(pathname === l.href)}>
            {l.name}
          </Link>
        ))}

        <div className="relative" ref={manageRef}>
          <button
            type="button"
            onClick={() => setManageOpen((o) => !o)}
            aria-expanded={manageOpen}
            className={navLinkClass(manageActive)}
          >
            Manage
            <span className="ml-1 text-[10px] text-slate-400">▾</span>
          </button>
          {manageOpen && (
            <div className="absolute left-0 z-40 mt-1 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
              {MANAGE_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`flex items-center gap-2.5 px-3 py-2 text-[13px] transition-colors ${
                    pathname === l.href
                      ? "bg-slate-100 font-medium text-slate-900 dark:bg-slate-800 dark:text-slate-50"
                      : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/60"
                  }`}
                >
                  <span className="w-4 text-center text-[13px]">{l.icon}</span>
                  {l.name}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mobile: primary actions inline, everything else in the drawer. */}
      <div className="flex items-center gap-1.5 md:hidden">
        <button type="button" onClick={() => setCheckInOpen(true)} className={`${PRIMARY_BTN} bg-indigo-600 hover:bg-indigo-700`}>
          🐾 Check-in
        </button>
        <Link href="/reservations/new" className={`${PRIMARY_BTN} bg-emerald-600 hover:bg-emerald-700`}>
          ➕ Booking
        </Link>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          className="inline-flex h-8 shrink-0 items-center rounded-lg border border-slate-200 px-2.5 text-[13px] text-slate-600 dark:border-slate-700 dark:text-slate-300"
        >
          ☰
        </button>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setDrawerOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute left-0 top-0 flex h-full w-72 flex-col bg-white p-3 shadow-xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between px-1">
              <span className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">Menu</span>
              <button type="button" onClick={() => setDrawerOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Close menu">
                ✕
              </button>
            </div>
            {ALL_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors ${
                  pathname === l.href
                    ? "bg-slate-100 font-medium text-slate-900 dark:bg-slate-800 dark:text-slate-50"
                    : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/60"
                }`}
              >
                <span className="w-4 text-center">{"icon" in l ? String(l.icon) : "•"}</span>
                {l.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      <CheckInPopup open={checkInOpen} setOpen={setCheckInOpen} candidates={candidates} />
    </>
  );
}
