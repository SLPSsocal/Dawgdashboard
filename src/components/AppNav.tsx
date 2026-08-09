"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import QuickCheckInDialog from "@/components/QuickCheckInDialog";
import type { CheckInCandidate } from "@/components/QuickCheckInDialog";
import { fetchCheckInCandidates } from "@/app/reservations/candidates-action";
import Link from "next/link";

// One nav for the whole app, living in the header rather than as a block of
// pills inside each page's content. 12 flat destinations collapse into 5
// categories, so page content starts immediately under a ~56px bar.
type Item = { name: string; href: string };

const CALENDAR: Item[] = [
  { name: "Lodging Calendar", href: "/lodging/calendar" },
  { name: "Facility Calendar", href: "/facility-calendar" },
];
const CUSTOMERS: Item[] = [
  { name: "Parents", href: "/parents" },
  { name: "Animals", href: "/animals" },
];
const MORE: Item[] = [
  { name: "Pricing", href: "/pricing" },
  { name: "Items for Sale", href: "/retail" },
  { name: "Waivers", href: "/waivers" },
];
const ADMIN: Item[] = [
  { name: "Admin Reports", href: "/admin" },
  { name: "Referral Sources", href: "/referral-sources" },
  { name: "Profile Tags", href: "/profile-tags" },
  { name: "Reported Issues", href: "/support" },
];

const ALL_GROUPS: { label: string; items: Item[] }[] = [
  { label: "Calendar", items: CALENDAR },
  { label: "Customers", items: CUSTOMERS },
  { label: "More", items: MORE },
  { label: "Admin", items: ADMIN },
];

function itemClass(active: boolean) {
  return `inline-flex h-8 items-center rounded-lg px-2.5 text-[13px] whitespace-nowrap transition-colors ${
    active
      ? "bg-slate-200/80 font-medium text-slate-900 dark:bg-slate-800 dark:text-slate-50"
      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100"
  }`;
}

function NavMenu({
  label,
  items,
  pathname,
}: {
  label: string;
  items: Item[];
  pathname: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = items.some((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={itemClass(active)}>
        {label}
        <span className="ml-1 text-[9px] opacity-50">▼</span>
      </button>
      {open && (
        <div className="absolute left-0 z-50 mt-1 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className={`block px-3 py-2 text-[13px] transition-colors ${
                pathname === i.href
                  ? "bg-slate-100 font-medium text-slate-900 dark:bg-slate-800 dark:text-slate-50"
                  : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/60"
              }`}
            >
              {i.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AppNav() {
  const pathname = usePathname();
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [candidates, setCandidates] = useState<CheckInCandidate[]>([]);

  // Load the arrivals list only when the dialog is actually opened.
  function openCheckIn() {
    setCheckInOpen(true);
    fetchCheckInCandidates().then(setCandidates).catch(() => setCandidates([]));
  }
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      {/* Desktop nav */}
      <nav className="hidden items-center gap-0.5 md:flex">
        <Link href="/reservations" className={itemClass(pathname === "/reservations")}>
          Check-in Board
        </Link>
        <button type="button" onClick={openCheckIn} className={itemClass(false)}>
          Quick Check-in
        </button>
        {ALL_GROUPS.map((g) => (
          <NavMenu key={g.label} label={g.label} items={g.items} pathname={pathname} />
        ))}
      </nav>

      {/* Mobile: hamburger only; the primary CTA stays visible in the header. */}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        aria-label="Open menu"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 md:hidden dark:text-slate-300 dark:hover:bg-slate-800"
      >
        ☰
      </button>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setDrawerOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute left-0 top-0 flex h-full w-[280px] flex-col overflow-y-auto bg-white p-3 shadow-xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">Menu</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <Link href="/reservations" className={`mb-0.5 block ${itemClass(pathname === "/reservations")} w-full`}>
              Check-in Board
            </Link>
            <button
              type="button"
              onClick={() => {
                setDrawerOpen(false);
                openCheckIn();
              }}
              className={`mb-2 w-full justify-start ${itemClass(false)}`}
            >
              Quick Check-in
            </button>

            {ALL_GROUPS.map((g) => (
              <div key={g.label} className="mb-2">
                <div className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  {g.label}
                </div>
                {g.items.map((i) => (
                  <Link key={i.href} href={i.href} className={`block w-full ${itemClass(pathname === i.href)}`}>
                    {i.name}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <QuickCheckInDialog open={checkInOpen} setOpen={setCheckInOpen} candidates={candidates} />
    </>
  );
}
