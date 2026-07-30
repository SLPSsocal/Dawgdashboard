"use client";

import { useMemo, useState } from "react";
import ReservationActionsMenu from "@/components/ReservationActionsMenu";
import ProfileTagBadges from "@/components/ProfileTagBadges";

export type CheckInRow = {
  id: string;
  status: string;
  animalId: string;
  animalName: string;
  breed: string | null;
  parentId: string | null;
  parentName: string | null;
  typeName: string | null;
  lodgingName: string | null;
  startDate: string;
  endDate: string;
};

type SortKey = "animalName" | "parentName" | "typeName" | "lodgingName" | "startDate" | "endDate";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type TagRecord = Record<string, { icon: string; name: string; note?: string | null }[]>;

export default function CheckInBoard({
  rows,
  checkedOutToday = [],
  staffName,
  animalTags,
  parentTags,
}: {
  rows: CheckInRow[];
  checkedOutToday?: CheckInRow[];
  staffName?: string | null;
  animalTags?: TagRecord;
  parentTags?: TagRecord;
}) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("endDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

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
      const cmp = av.localeCompare(bv);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [allRows, query, sortKey, sortDir]);

  // Same date-slicing convention used everywhere else in this app (e.g. the
  // Expected Today stat count on the page above) — compares the ISO date
  // portion directly rather than converting to local time.
  const todayStr = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const checkedIn = filtered.filter((r) => r.status === "checked_in");
  const expected = filtered.filter((r) => r.status === "booked");
  // "Today" also catches anything overdue (booked for a past date that
  // never got checked in) instead of silently hiding it.
  const expectedToday = expected.filter((r) => r.startDate.slice(0, 10) <= todayStr);
  const expectedTomorrow = expected.filter((r) => r.startDate.slice(0, 10) === tomorrowStr);
  const expectedFuture = expected.filter((r) => r.startDate.slice(0, 10) > tomorrowStr);
  const checkedOut = filtered.filter((r) => r.status === "checked_out");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function SortHeader({ label, sortField }: { label: string; sortField: SortKey }) {
    const active = sortKey === sortField;
    return (
      <th
        onClick={() => toggleSort(sortField)}
        className="cursor-pointer select-none whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
      >
        {label} {active ? (sortDir === "asc" ? "▲" : "▼") : ""}
      </th>
    );
  }

  function Table({
    title,
    data,
    accent,
    defaultOpen = true,
    alwaysShow = false,
  }: {
    title: string;
    data: CheckInRow[];
    accent: string;
    defaultOpen?: boolean;
    // Keep the container visible (showing "(0)" and just the header row)
    // even when empty — used for Expected Today/Tomorrow so staff always
    // see those sections are present rather than wondering if the board
    // is broken.
    alwaysShow?: boolean;
  }) {
    if (data.length === 0 && !alwaysShow) return null;
    return (
      <details
        open={defaultOpen}
        className="group mt-4 rounded-xl border border-slate-300 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900"
      >
        <summary className="flex cursor-pointer select-none list-none items-center justify-between px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {title} ({data.length})
          </h2>
          <span className="text-slate-400 transition-transform group-open:rotate-180 dark:text-slate-500">
            ▾
          </span>
        </summary>
        <div className="overflow-x-auto border-t border-slate-100 dark:border-slate-800">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <SortHeader label="Animal" sortField="animalName" />
                <SortHeader label="Parent" sortField="parentName" />
                <SortHeader label="Type" sortField="typeName" />
                <SortHeader label="Lodging" sortField="lodgingName" />
                <SortHeader label="Arrival" sortField="startDate" />
                <SortHeader label="Departure" sortField="endDate" />
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr
                  key={r.id}
                  className={`border-b border-l-4 border-slate-100 last:border-b-0 dark:border-slate-800 ${accent}`}
                >
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <a href={`/animals/${r.animalId}`} className="font-medium underline decoration-slate-300 hover:decoration-slate-600 dark:decoration-slate-600">
                        {r.animalName}
                      </a>
                      <ProfileTagBadges tags={animalTags?.[r.animalId] ?? []} />
                    </span>
                    <div className="text-xs text-slate-400 dark:text-slate-500">{r.breed ?? "—"}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                    <span className="inline-flex items-center gap-1.5">
                      {r.parentId ? (
                        <a href={`/parents/${r.parentId}`} className="underline decoration-slate-300 hover:decoration-slate-600 dark:decoration-slate-600">
                          {r.parentName ?? "—"}
                        </a>
                      ) : (
                        r.parentName ?? "—"
                      )}
                      {r.parentId && <ProfileTagBadges tags={parentTags?.[r.parentId] ?? []} />}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{r.typeName ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{r.lodgingName ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{fmtDate(r.startDate)}</td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{fmtDate(r.endDate)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      {r.status === "checked_in" && (
                        <a
                          href={`/reservations/${r.id}/checkout`}
                          className="rounded-md bg-indigo-600 hover:bg-indigo-700 px-2 py-1 text-xs font-medium text-white dark:bg-slate-100 dark:text-slate-900"
                        >
                          Check Out
                        </a>
                      )}
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    );
  }

  return (
    <div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by animal, parent, breed, or type…"
        className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      />

      <Table title="🟢 Currently Checked In" data={checkedIn} accent="border-l-green-500" />
      <Table title="📋 Expected Today" data={expectedToday} accent="border-l-amber-500" alwaysShow />
      <Table title="📅 Expected Tomorrow" data={expectedTomorrow} accent="border-l-sky-500" alwaysShow />
      <Table title="🗓️ Expected in the Future" data={expectedFuture} accent="border-l-violet-500" />
      <Table title="✅ Checked Out Today" data={checkedOut} accent="border-l-slate-400" defaultOpen={false} />

      {filtered.length === 0 && (
        <p className="mt-8 text-sm text-slate-400 dark:text-slate-500">No matches.</p>
      )}
    </div>
  );
}
