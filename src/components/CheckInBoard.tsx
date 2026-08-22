"use client";

import { useMemo, useState, useTransition } from "react";
import ReservationActionsMenu from "@/components/ReservationActionsMenu";
import ProfileTagBadges from "@/components/ProfileTagBadges";
import SendFormButton from "@/components/SendFormButton";
import { checkInReservation } from "@/app/reservations/actions";
import { serviceTone } from "@/lib/serviceColors";
import Link from "next/link";

// Check-in Board, restyled to the approved design project ("Check-in Board
// Redesign"): grid rows instead of a 760px-min table, one primary action per
// row, status filter pills, a sort menu, and card rows on mobile with a
// sticky New-booking bar. Same data, same routes, same server actions.

export type CheckInRow = {
  id: string;
  status: string;
  animalId: string;
  animalName: string;
  alertNote: string | null;
  breed: string | null;
  parentId: string | null;
  parentName: string | null;
  typeName: string | null;
  lodgingName: string | null;
  startDate: string;
  endDate: string;
  phone: string | null;
  /** null = never sent, "sent"/"pending" = link out, "submitted" = form done */
  precheckinStatus: string | null;
  /** Row is mirrored from the live Gingr feed (migration mode). */
  isLive?: boolean;
};

type SortKey = "endDate" | "startDate" | "animalName" | "parentName";
type Pill = "all" | "checked_in" | "today" | "tomorrow" | "upcoming" | "checked_out";

const ymdPT = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date(iso));

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function relDay(iso: string, todayStr: string, tomorrowStr: string) {
  const d = ymdPT(iso);
  if (d === todayStr) return "Today";
  if (d === tomorrowStr) return "Tomorrow";
  return new Date(iso).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

type TagRecord = Record<string, { icon: string; name: string; note?: string | null }[]>;

export default function CheckInBoard({
  rows,
  checkedOutToday = [],
  staffName,
  facilityId,
  animalTags,
  parentTags,
}: {
  rows: CheckInRow[];
  checkedOutToday?: CheckInRow[];
  staffName?: string | null;
  facilityId?: string;
  animalTags?: TagRecord;
  parentTags?: TagRecord;
}) {
  const [query, setQuery] = useState("");
  const [pill, setPill] = useState<Pill>("all");
  const [sortKey, setSortKey] = useState<SortKey>("endDate");
  const [, startTransition] = useTransition();
  const [checkingIn, setCheckingIn] = useState<string | null>(null);

  const todayStr = ymdPT(new Date().toISOString());
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = ymdPT(tomorrow.toISOString());

  const allRows = useMemo(() => [...rows, ...checkedOutToday], [rows, checkedOutToday]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = !q
      ? allRows
      : allRows.filter((r) =>
          [r.animalName, r.parentName, r.breed, r.typeName, r.lodgingName]
            .filter((v): v is string => Boolean(v))
            .some((v) => v.toLowerCase().includes(q))
        );
    return [...matched].sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      return av.localeCompare(bv);
    });
  }, [allRows, query, sortKey]);

  const checkedIn = filtered.filter((r) => r.status === "checked_in");
  const expected = filtered.filter((r) => r.status === "booked");
  const expectedToday = expected.filter((r) => ymdPT(r.startDate) <= todayStr);
  const expectedTomorrow = expected.filter((r) => ymdPT(r.startDate) === tomorrowStr);
  const expectedFuture = expected.filter((r) => ymdPT(r.startDate) > tomorrowStr);
  const checkedOut = filtered.filter((r) => r.status === "checked_out");

  const pills: { key: Pill; label: string; count: number }[] = [
    { key: "all", label: "All", count: filtered.length },
    { key: "checked_in", label: "Checked in", count: checkedIn.length },
    { key: "today", label: "Today", count: expectedToday.length },
    { key: "tomorrow", label: "Tomorrow", count: expectedTomorrow.length },
    { key: "upcoming", label: "Upcoming", count: expectedFuture.length },
    { key: "checked_out", label: "Checked out", count: checkedOut.length },
  ];

  const show = (k: Exclude<Pill, "all">) => pill === "all" || pill === k;

  function doCheckIn(r: CheckInRow) {
    setCheckingIn(r.id);
    startTransition(async () => {
      try {
        await checkInReservation(r.id, staffName ?? null);
      } finally {
        setCheckingIn(null);
      }
    });
  }

  // ---------- row pieces ----------

  function PrecheckinChip({ r }: { r: CheckInRow }) {
    if (r.status !== "booked" || !facilityId) return null;
    if (r.precheckinStatus === "submitted") {
      return (
        <span className="inline-flex h-7 items-center gap-1 rounded-lg bg-emerald-50 px-2 text-[12px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
          Form ✓
        </span>
      );
    }
    if (r.precheckinStatus) {
      return (
        <span className="inline-flex h-7 items-center rounded-lg bg-[#f1f3f6] px-2 text-[12px] font-medium text-[#8a91a0] dark:bg-slate-800 dark:text-slate-400">
          Sent
        </span>
      );
    }
    return (
      <SendFormButton
        reservationId={r.id}
        facilityId={facilityId}
        animalId={r.animalId}
        parentId={r.parentId}
        phone={r.phone}
      />
    );
  }

  function PrimaryAction({ r, block = false }: { r: CheckInRow; block?: boolean }) {
    const base = `${block ? "flex-1" : ""} inline-flex h-9 items-center justify-center rounded-[10px] px-4 text-[13px] font-semibold transition-colors`;
    if (r.status === "checked_in") {
      return (
        <Link href={`/reservations/${r.id}/checkout`} className={`${base} bg-indigo-600 text-white hover:bg-indigo-700`}>
          Check out
        </Link>
      );
    }
    if (r.status === "booked") {
      return (
        <button
          type="button"
          disabled={checkingIn === r.id}
          onClick={() => doCheckIn(r)}
          className={`${base} border border-emerald-600/40 bg-white text-emerald-700 hover:border-emerald-600 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-700 dark:bg-transparent dark:text-emerald-400 dark:hover:bg-emerald-950/40`}
        >
          {checkingIn === r.id ? "…" : "Check in"}
        </button>
      );
    }
    return (
      <Link
        href={`/reservations/${r.id}`}
        className={`${base} border border-[#e3e5ea] bg-white text-[#565d6d] hover:border-[#c4c9d4] dark:border-slate-700 dark:bg-transparent dark:text-slate-300`}
      >
        Details
      </Link>
    );
  }

  function DogCell({ r }: { r: CheckInRow }) {
    return (
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          {r.animalId ? (
            <Link href={`/animals/${r.animalId}`} className="text-[14.5px] font-semibold text-[#15181d] hover:text-indigo-600 dark:text-slate-100 dark:hover:text-indigo-400">
              {r.animalName}
            </Link>
          ) : (
            <span className="text-[14.5px] font-semibold">{r.animalName}</span>
          )}
          {r.isLive && (
            <span title="Mirrored live from Gingr — actions here never touch Gingr" className="text-[13px] text-indigo-500 dark:text-indigo-400">
              ✱
            </span>
          )}
          {r.animalId && <ProfileTagBadges tags={animalTags?.[r.animalId] ?? []} />}
        </div>
        <div className="text-[12px] text-[#8a91a0] dark:text-slate-500">{r.breed ?? "—"}</div>
        {r.alertNote && (
          <div className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-md bg-red-50 px-2 py-0.5 text-[11.5px] font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
            <span className="truncate">{r.alertNote}</span>
          </div>
        )}
      </div>
    );
  }

  // ---------- section ----------

  function Section({
    title,
    dot,
    badge,
    data,
    defaultOpen = true,
    alwaysShow = false,
  }: {
    title: string;
    dot: string;
    badge: string;
    data: CheckInRow[];
    defaultOpen?: boolean;
    alwaysShow?: boolean;
  }) {
    if (data.length === 0 && !alwaysShow) return null;
    return (
      <details
        open={defaultOpen}
        className="group mt-3 overflow-hidden rounded-[14px] border border-[#e3e5ea] bg-white dark:border-slate-800 dark:bg-slate-900"
      >
        <summary className="flex cursor-pointer select-none list-none items-center gap-2 px-4 py-3">
          <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
          <h2 className="text-[13.5px] font-semibold text-[#15181d] dark:text-slate-100">{title}</h2>
          <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold ${badge}`}>
            {data.length}
          </span>
          <span className="ml-auto text-[11px] text-[#c4c9d4] transition-transform group-open:rotate-180 dark:text-slate-600">▲</span>
        </summary>

        {/* Desktop: grid rows */}
        <div className="hidden border-t border-[#edeff3] md:block dark:border-slate-800">
          <div className="grid grid-cols-[2fr_1.3fr_1.5fr_0.9fr_0.9fr_1fr_auto] items-center gap-3 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#8a91a0] dark:text-slate-500">
            <span>Dog</span><span>Parent</span><span>Service</span><span>Arrival</span><span>Departure</span><span>Pre-check-in</span><span />
          </div>
          {data.map((r) => (
            <div
              key={r.id}
              className="grid grid-cols-[2fr_1.3fr_1.5fr_0.9fr_0.9fr_1fr_auto] items-center gap-3 border-t border-[#edeff3] px-4 py-2.5 transition-colors hover:bg-[#fafbfc] dark:border-slate-800 dark:hover:bg-slate-800/40"
            >
              <DogCell r={r} />
              <div className="min-w-0">
                {r.parentId ? (
                  <Link href={`/parents/${r.parentId}`} className="block truncate text-[13.5px] text-[#15181d] hover:text-indigo-600 dark:text-slate-200 dark:hover:text-indigo-400">
                    {r.parentName ?? "—"}
                  </Link>
                ) : (
                  <span className="block truncate text-[13.5px]">{r.parentName ?? "—"}</span>
                )}
                <div className="truncate text-[12px] text-[#8a91a0] dark:text-slate-500">{r.phone ?? ""}</div>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[13.5px] text-[#15181d] dark:text-slate-200">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${serviceTone(r.typeName).dot}`} />
                  <span className="truncate">{r.typeName ?? "—"}</span>
                </div>
                <div className="pl-3 text-[12px] text-[#8a91a0] dark:text-slate-500">{r.lodgingName ?? ""}</div>
              </div>
              <div>
                <div className="text-[13.5px] tabular-nums text-[#15181d] dark:text-slate-200">{fmtTime(r.startDate)}</div>
                <div className="text-[12px] text-[#8a91a0] dark:text-slate-500">{relDay(r.startDate, todayStr, tomorrowStr)}</div>
              </div>
              <div>
                <div className="text-[13.5px] tabular-nums text-[#15181d] dark:text-slate-200">{fmtTime(r.endDate)}</div>
                <div className="text-[12px] text-[#8a91a0] dark:text-slate-500">{relDay(r.endDate, todayStr, tomorrowStr)}</div>
              </div>
              <div><PrecheckinChip r={r} /></div>
              <div className="flex items-center gap-1.5">
                <PrimaryAction r={r} />
                <ReservationActionsMenu
                  reservationId={r.id}
                  animalId={r.animalId}
                  animalName={r.animalName}
                  parentId={r.parentId}
                  parentName={r.parentName}
                  status={r.status}
                  performedBy={staffName}
                />
              </div>
            </div>
          ))}
          {data.length === 0 && (
            <p className="border-t border-[#edeff3] px-4 py-6 text-center text-[13px] text-[#8a91a0] dark:border-slate-800 dark:text-slate-500">
              Nothing here right now.
            </p>
          )}
        </div>

        {/* Mobile: card rows */}
        <div className="flex flex-col gap-2.5 border-t border-[#edeff3] p-3 md:hidden dark:border-slate-800">
          {data.map((r) => (
            <div
              key={r.id}
              className={`rounded-xl border border-[#e3e5ea] border-l-[3px] bg-white p-3 dark:border-slate-700 dark:bg-slate-900 ${
                r.status === "checked_in" ? "border-l-emerald-500" : r.status === "booked" ? "border-l-amber-400" : "border-l-slate-300"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {/* Same profile links the desktop rows have — staff on tablets
                        couldn't open a pet or parent from the board (Kath, Aug 19). */}
                    {r.animalId ? (
                      <Link href={`/animals/${r.animalId}`} className="text-[15px] font-semibold text-[#15181d] hover:text-indigo-600 dark:text-slate-100 dark:hover:text-indigo-400">
                        {r.animalName}
                      </Link>
                    ) : (
                      <span className="text-[15px] font-semibold text-[#15181d] dark:text-slate-100">{r.animalName}</span>
                    )}
                    {r.isLive && <span className="text-[13px] text-indigo-500 dark:text-indigo-400">✱</span>}
                  </div>
                  <div className="truncate text-[12.5px] text-[#8a91a0] dark:text-slate-500">
                    {r.breed && <span>{r.breed}</span>}
                    {r.breed && r.parentName && <span> · </span>}
                    {r.parentName &&
                      (r.parentId ? (
                        <Link href={`/parents/${r.parentId}`} className="hover:text-indigo-600 dark:hover:text-indigo-400">
                          {r.parentName}
                        </Link>
                      ) : (
                        <span>{r.parentName}</span>
                      ))}
                  </div>
                </div>
                <PrecheckinChip r={r} />
              </div>
              {r.alertNote && (
                <div className="mt-1.5 rounded-md bg-red-50 px-2 py-1 text-[11.5px] font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">
                  ● {r.alertNote}
                </div>
              )}
              <div className="mt-2 flex items-center gap-1.5 text-[13px] text-[#15181d] dark:text-slate-200">
                <span className={`h-1.5 w-1.5 rounded-full ${serviceTone(r.typeName).dot}`} />
                {r.typeName ?? "—"}
                {r.lodgingName && <span className="text-[#8a91a0] dark:text-slate-500">{r.lodgingName}</span>}
              </div>
              <div className="mt-2 flex items-center justify-between rounded-lg bg-[#f5f6f8] px-2.5 py-1.5 text-[12.5px] dark:bg-slate-800/60">
                <span>
                  <span className="text-[#8a91a0] dark:text-slate-500">In </span>
                  <span className="font-semibold tabular-nums">{fmtTime(r.startDate)}</span>{" "}
                  <span className="text-[#8a91a0] dark:text-slate-500">{relDay(r.startDate, todayStr, tomorrowStr)}</span>
                </span>
                <span>
                  <span className="text-[#8a91a0] dark:text-slate-500">Out </span>
                  <span className="font-semibold tabular-nums">{fmtTime(r.endDate)}</span>{" "}
                  <span className="text-[#8a91a0] dark:text-slate-500">{relDay(r.endDate, todayStr, tomorrowStr)}</span>
                </span>
              </div>
              <div className="mt-2.5 flex items-center gap-2">
                <PrimaryAction r={r} block />
                <ReservationActionsMenu
                  reservationId={r.id}
                  animalId={r.animalId}
                  animalName={r.animalName}
                  parentId={r.parentId}
                  parentName={r.parentName}
                  status={r.status}
                  performedBy={staffName}
                />
              </div>
            </div>
          ))}
          {data.length === 0 && (
            <p className="py-4 text-center text-[13px] text-[#8a91a0] dark:text-slate-500">Nothing here right now.</p>
          )}
        </div>
      </details>
    );
  }

  return (
    <div className="pb-20 md:pb-0">
      {/* Controls: search · status pills · count · sort */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search dog, parent, breed, service, suite…"
          className="h-10 w-full rounded-[10px] border border-[#e3e5ea] bg-white px-3.5 text-[13.5px] placeholder:text-[#8a91a0] sm:w-[300px] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          {pills.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPill(p.key)}
              className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors ${
                pill === p.key
                  ? "bg-[#15181d] text-white dark:bg-slate-100 dark:text-slate-900"
                  : "border border-[#e3e5ea] bg-white text-[#565d6d] hover:border-[#c4c9d4] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              }`}
            >
              {p.label}
              <span className={pill === p.key ? "opacity-70" : "text-[#8a91a0] dark:text-slate-500"}>{p.count}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-[12.5px] text-[#8a91a0] sm:inline dark:text-slate-500">
            {filtered.length} of {allRows.length} reservations
          </span>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="h-9 rounded-[10px] border border-[#e3e5ea] bg-white px-2 text-[13px] text-[#565d6d] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          >
            <option value="endDate">Sort: departure</option>
            <option value="startDate">Sort: arrival</option>
            <option value="animalName">Sort: dog</option>
            <option value="parentName">Sort: parent</option>
          </select>
        </div>
      </div>

      {show("checked_in") && (
        <Section title="Currently checked in" dot="bg-emerald-500" badge="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400" data={checkedIn} alwaysShow={pill === "checked_in"} />
      )}
      {show("today") && (
        <Section title="Expected today" dot="bg-amber-500" badge="bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400" data={expectedToday} alwaysShow />
      )}
      {show("tomorrow") && (
        <Section title="Expected tomorrow" dot="bg-sky-500" badge="bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-400" data={expectedTomorrow} alwaysShow={pill === "tomorrow"} />
      )}
      {show("upcoming") && (
        <Section title="Expected in the future" dot="bg-violet-500" badge="bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-400" data={expectedFuture} alwaysShow={pill === "upcoming"} />
      )}
      {show("checked_out") && (
        <Section title="Checked out today" dot="bg-slate-400" badge="bg-[#f1f3f6] text-[#8a91a0] dark:bg-slate-800 dark:text-slate-400" data={checkedOut} defaultOpen={pill === "checked_out"} alwaysShow={pill === "checked_out"} />
      )}

      {filtered.length === 0 && (
        <p className="mt-8 text-center text-sm text-[#8a91a0] dark:text-slate-500">No matches.</p>
      )}

      {/* Mobile sticky primary CTA, per the redesign. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#e3e5ea] bg-white/95 p-3 backdrop-blur md:hidden dark:border-slate-800 dark:bg-slate-900/95">
        <Link
          href="/reservations/new"
          className="flex h-11 w-full items-center justify-center rounded-[10px] bg-indigo-600 text-[14.5px] font-semibold text-white hover:bg-indigo-700"
        >
          + New booking
        </Link>
      </div>
    </div>
  );
}
