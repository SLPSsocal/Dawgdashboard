"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { splitLodgingFrom, clearLodgingSegments, type LodgingSegment } from "@/app/reservations/lodging-segments";

// "Suite by date" on the reservation page (Mark, Sep 14): move a dog to a
// different suite partway through the stay, Gingr-style, instead of
// double-booking or splitting the reservation in two.
export default function LodgingSplitPanel({
  reservationId,
  startYmd,
  endYmd,
  currentLodgingAreaId,
  currentLodgingName,
  segments,
  areas,
  staffName,
}: {
  reservationId: string;
  startYmd: string;
  endYmd: string; // exclusive (checkout day)
  currentLodgingAreaId: string | null;
  currentLodgingName: string | null;
  segments: LodgingSegment[];
  areas: { id: string; name: string }[];
  staffName: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(segments.length > 0);
  const [from, setFrom] = useState("");
  const [areaId, setAreaId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Dates the picker allows: day 2 of the stay through the last night.
  const nextDay = (ymd: string) => {
    const d = new Date(`${ymd}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  };
  const prevDay = (ymd: string) => {
    const d = new Date(`${ymd}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  };
  const minFrom = nextDay(startYmd);
  const maxFrom = prevDay(endYmd);
  const multiNight = maxFrom >= minFrom;

  const fmt = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

  function submit() {
    setError(null);
    if (!from) {
      setError("Pick the first day in the new suite.");
      return;
    }
    startTransition(async () => {
      try {
        await splitLodgingFrom(reservationId, from, areaId || null, staffName);
        setFrom("");
        setAreaId("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not change suite");
      }
    });
  }

  function reset() {
    if (!window.confirm("Put the whole stay back in one suite?")) return;
    startTransition(async () => {
      try {
        await clearLodgingSegments(reservationId, segments[0]?.lodgingAreaId ?? currentLodgingAreaId, staffName);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not reset");
      }
    });
  }

  if (!multiNight) return null;

  const select =
    "rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Suite by date
          {segments.length > 0 && (
            <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300">
              changes mid-stay
            </span>
          )}
        </span>
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-[12px] text-slate-400 underline hover:text-slate-600 dark:hover:text-slate-200">
          {open ? "Hide" : "Move suites mid-stay"}
        </button>
      </div>

      {open && (
        <div className="mt-2">
          <ol className="flex flex-col gap-1 text-[13px]">
            {(segments.length > 0
              ? segments
              : [{ id: "whole", reservationId, lodgingAreaId: currentLodgingAreaId, lodgingName: currentLodgingName, startYmd, endYmd }]
            ).map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded-md bg-slate-50 px-2.5 py-1.5 dark:bg-slate-800/60">
                <span className="text-slate-500 dark:text-slate-400">
                  {fmt(s.startYmd)} → {fmt(s.endYmd)}
                </span>
                <span className={`font-medium ${s.lodgingAreaId ? "text-slate-800 dark:text-slate-100" : "text-amber-700 dark:text-amber-400"}`}>
                  {s.lodgingName ?? (s.lodgingAreaId ? "Suite" : "Unassigned")}
                </span>
              </li>
            ))}
          </ol>

          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="text-[12px] text-slate-500 dark:text-slate-400">
              From
              <input type="date" min={minFrom} max={maxFrom} value={from} onChange={(e) => setFrom(e.target.value)} className={`mt-1 block ${select}`} />
            </label>
            <label className="text-[12px] text-slate-500 dark:text-slate-400">
              Move to
              <select value={areaId} onChange={(e) => setAreaId(e.target.value)} className={`mt-1 block ${select}`}>
                <option value="">Unassigned</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={isPending}
              onClick={submit}
              className="h-[34px] rounded-lg bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
            >
              {isPending ? "Saving…" : "Apply"}
            </button>
            {segments.length > 0 && (
              <button type="button" disabled={isPending} onClick={reset} className="text-[12px] text-slate-400 underline hover:text-slate-600 dark:hover:text-slate-200">
                Back to one suite
              </button>
            )}
          </div>
          <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
            Applies from that day through checkout; earlier days keep their suite. The board and lodging calendar follow the day.
          </p>
          {error && <p className="mt-1 text-[12px] text-rose-600 dark:text-rose-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
