"use client";

import { createLodgingBlock } from "@/app/blocks/actions";

// "Take a suite out of service" form for the Lodging Calendar — repairs,
// deep clean, damage. Date-range only; suites don't need hourly granularity.
export default function LodgingBlockForm({
  areas,
  week,
  defaultDate,
}: {
  areas: { id: string; name: string }[];
  week: string;
  defaultDate: string;
}) {
  if (areas.length === 0) return null;

  return (
    <details className="group mt-3 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <summary className="flex cursor-pointer select-none list-none items-center justify-between px-4 py-2.5">
        <h2 className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">🔧 Block Out a Suite</h2>
        <span className="text-slate-400 transition-transform group-open:rotate-180 dark:text-slate-500">▾</span>
      </summary>
      <form
        action={createLodgingBlock}
        className="flex flex-wrap items-end gap-3 border-t border-slate-100 p-4 dark:border-slate-800"
      >
        <input type="hidden" name="return_to" value={`/lodging/calendar?week=${week}`} />
        <label className="block">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Suite</span>
          <select
            name="lodging_area_id"
            required
            className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          >
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">From</span>
          <input
            type="date"
            name="start_date"
            required
            defaultValue={defaultDate}
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Through (inclusive)</span>
          <input
            type="date"
            name="end_date"
            defaultValue={defaultDate}
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>
        <label className="block min-w-[160px] flex-1">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Reason</span>
          <input
            name="reason"
            placeholder="Repair, deep clean, damage…"
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Block
        </button>
      </form>
    </details>
  );
}
