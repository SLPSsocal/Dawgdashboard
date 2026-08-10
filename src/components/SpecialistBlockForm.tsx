"use client";

import { useState } from "react";
import { createSpecialistBlock } from "@/app/blocks/actions";

// Collapsible "block out a groomer" form for the Facility Calendar — sick
// day, vacation, training, a long lunch. All-day is the common case so it's
// the default; unticking reveals start/end time for partial-day blocks.
export default function SpecialistBlockForm({
  specialists,
  date,
}: {
  specialists: { id: string; name: string }[];
  date: string;
}) {
  const [allDay, setAllDay] = useState(true);

  if (specialists.length === 0) return null;

  return (
    <details className="group mt-3 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <summary className="flex cursor-pointer select-none list-none items-center justify-between px-4 py-2.5">
        <h2 className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">🚫 Block Out a Specialist</h2>
        <span className="text-slate-400 transition-transform group-open:rotate-180 dark:text-slate-500">▾</span>
      </summary>
      <form
        action={createSpecialistBlock}
        className="flex flex-wrap items-end gap-3 border-t border-slate-100 p-4 dark:border-slate-800"
      >
        <input type="hidden" name="return_to" value={`/facility-calendar?date=${date}`} />
        <label className="block">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Specialist</span>
          <select
            name="specialist_id"
            required
            className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          >
            {specialists.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
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
            defaultValue={date}
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Through</span>
          <input
            type="date"
            name="end_date"
            defaultValue={date}
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>
        <label className="flex items-center gap-1.5 pb-2.5 text-xs text-slate-600 dark:text-slate-300">
          <input type="checkbox" name="all_day" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          All day
        </label>
        {!allDay && (
          <>
            <label className="block">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Start</span>
              <input
                type="time"
                name="start_time"
                defaultValue="09:00"
                className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">End</span>
              <input
                type="time"
                name="end_time"
                defaultValue="17:00"
                className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
          </>
        )}
        <label className="block min-w-[160px] flex-1">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Reason</span>
          <input
            name="reason"
            placeholder="Vacation, sick, training…"
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
