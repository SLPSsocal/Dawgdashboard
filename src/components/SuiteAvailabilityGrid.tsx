"use client";

import { useEffect, useState } from "react";
import { getLodgingAvailability, type LodgingBlockSpan, type LodgingOccupant } from "@/app/reservations/actions";
import { stayDays } from "@/lib/daycareAddon";

// Suite availability inside the booking form (Mark, Sep 10). Gingr's booking
// screen shows, per suite and per night of the requested stay, which ones are
// already taken (highlighted) so staff never double-book — this is that view,
// in-line, with the row itself acting as the suite picker.

export type GridArea = { id: string; name: string; area_type?: string | null; capacity?: number | null };

function nightLabel(ymd: string) {
  return new Date(`${ymd}T12:00:00`).toLocaleDateString([], { weekday: "short", month: "numeric", day: "numeric" });
}

export default function SuiteAvailabilityGrid({
  facilityId,
  areas,
  startDate,
  endDate,
  value,
  onChange,
}: {
  facilityId: string;
  areas: GridArea[];
  startDate: string;
  endDate: string;
  value: string; // selected lodging area id ("" = unassigned)
  onChange: (id: string) => void;
}) {
  const [occupants, setOccupants] = useState<LodgingOccupant[]>([]);
  const [blocks, setBlocks] = useState<LodgingBlockSpan[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);

  // Nights of the stay (arrival day … night before departure). A same-day
  // booking (daytime suite use) still shows the one day.
  const allDays = stayDays(startDate, endDate);
  const nights = allDays.length > 1 ? allDays.slice(0, -1) : allDays;

  useEffect(() => {
    if (!facilityId || !startDate) return;
    let cancelled = false;
    setLoading(true);
    getLodgingAvailability(facilityId, startDate, endDate || startDate)
      .then((res) => {
        if (cancelled) return;
        setOccupants(res.occupants);
        setBlocks(res.blocks);
      })
      .catch(() => {
        if (!cancelled) {
          setOccupants([]);
          setBlocks([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [facilityId, startDate, endDate]);

  function cell(areaId: string, day: string) {
    const names = occupants
      .filter((o) => o.lodgingAreaId === areaId && day >= o.startYmd && day < o.endYmd)
      .map((o) => o.animalName);
    // Blocks cover their end day too (same rule as the lodging calendar).
    const block = blocks.find((b) => b.lodgingAreaId === areaId && day >= b.startYmd && day <= b.endYmd) ?? null;
    return { names, block };
  }

  const capacityOf = (a: GridArea) => Math.max(1, a.capacity ?? 1);
  const areaFree = (a: GridArea) =>
    nights.every((d) => {
      const c = cell(a.id, d);
      return !c.block && c.names.length < capacityOf(a);
    });
  const freeCount = areas.filter(areaFree).length;

  if (areas.length === 0) return null;

  return (
    <div className="mt-3 rounded-[10px] border border-[#e3e5ea] bg-[#f9fafb] dark:border-slate-800 dark:bg-slate-950/40">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <span className="text-sm font-semibold text-[#15181d] dark:text-slate-200">
          Suite availability
          <span className="ml-2 text-xs font-medium text-[#8a91a0] dark:text-slate-500">
            {loading ? "checking…" : `${freeCount} of ${areas.length} free for the whole stay`}
          </span>
        </span>
        <span className="text-[11px] text-[#c4c9d4] dark:text-slate-600">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && (
        <div className="overflow-x-auto border-t border-[#edeff3] dark:border-slate-800">
          <table className="w-full min-w-[420px] border-collapse text-[12px]">
            <thead>
              <tr className="text-[10.5px] font-semibold uppercase tracking-wide text-[#8a91a0] dark:text-slate-500">
                <th className="sticky left-0 bg-[#f9fafb] px-3 py-1.5 text-left dark:bg-slate-950/40">Suite</th>
                {nights.map((d) => (
                  <th key={d} className="px-1.5 py-1.5 text-center font-semibold">
                    {nightLabel(d)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {areas.map((a) => {
                const free = areaFree(a);
                const picked = value === a.id;
                return (
                  <tr
                    key={a.id}
                    onClick={() => onChange(picked ? "" : a.id)}
                    className={`cursor-pointer border-t border-[#edeff3] transition-colors dark:border-slate-800 ${
                      picked
                        ? "bg-indigo-50 dark:bg-indigo-950/30"
                        : "hover:bg-white dark:hover:bg-slate-900"
                    }`}
                    title={free ? `Pick ${a.name}` : `${a.name} is taken on at least one night — you can still pick it`}
                  >
                    <td
                      className={`sticky left-0 whitespace-nowrap px-3 py-1.5 font-medium ${
                        picked ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300" : "bg-[#f9fafb] text-[#15181d] dark:bg-slate-950/40 dark:text-slate-200"
                      }`}
                    >
                      <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: free ? "#22c55e" : "#f59e0b" }} />
                      {picked ? "✓ " : ""}
                      {a.name}
                    </td>
                    {nights.map((d) => {
                      const c = cell(a.id, d);
                      const full = c.block || c.names.length >= capacityOf(a);
                      const partial = !full && c.names.length > 0;
                      return (
                        <td
                          key={d}
                          className={`px-1 py-1 text-center ${
                            c.block
                              ? "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                              : full
                                ? "bg-yellow-200 text-yellow-900 dark:bg-yellow-900/50 dark:text-yellow-200"
                                : partial
                                  ? "bg-yellow-50 text-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-300"
                                  : "text-[#c4c9d4] dark:text-slate-700"
                          }`}
                        >
                          <span className="block max-w-[110px] truncate" title={c.block ? `Blocked${c.block.reason ? ` — ${c.block.reason}` : ""}` : c.names.join(", ")}>
                            {c.block ? "🚫" : c.names.length > 0 ? c.names.join(", ") : "·"}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="px-3 py-1.5 text-[11px] text-[#8a91a0] dark:text-slate-500">
            Yellow = already booked that night · grey = blocked out · click a row to assign that suite (click again to
            unassign). Checkout day is free for the next dog.
          </p>
        </div>
      )}
    </div>
  );
}
