"use client";

// Groomer schedules panel on the Facility Calendar (Alan's ticket): set each
// groomer's normal working days, and see/undo any "opened day off" overrides
// for the day being viewed.

import { useTransition } from "react";
import { setSpecialistWorkDays, revokeSpecialistDay } from "@/app/facility-calendar/schedule-actions";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type ScheduledSpecialist = { id: string; name: string; workDays: number[] | null };
export type DayOverride = { id: string; staffId: string; date: string };

export default function SpecialistScheduleManager({
  specialists,
  overrides,
  date,
}: {
  specialists: ScheduledSpecialist[];
  overrides: DayOverride[];
  date: string;
}) {
  const [, startTransition] = useTransition();
  if (specialists.length === 0) return null;

  return (
    <details className="group mt-3 rounded-[14px] border border-[#e3e5ea] bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <summary className="flex cursor-pointer select-none list-none items-center justify-between px-4 py-3">
        <h2 className="text-sm font-semibold text-[#15181d] dark:text-slate-200">🗓️ Groomer schedules</h2>
        <span className="text-slate-400 transition-transform group-open:rotate-180 dark:text-slate-500">▾</span>
      </summary>
      <div className="border-t border-[#edeff3] p-4 dark:border-slate-800">
        <p className="text-xs text-[#8a91a0] dark:text-slate-500">
          Tick the days each groomer normally works. Days off show grayed out on the calendar with an{" "}
          <span className="font-medium">Open this day</span> button for when they come in anyway. &quot;Every
          day&quot; (or nothing ticked) means no schedule — always bookable.
        </p>
        <div className="mt-3 flex flex-col gap-2.5">
          {specialists.map((s) => (
            <form
              key={s.id}
              action={setSpecialistWorkDays.bind(null, s.id)}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5"
            >
              <span className="w-32 shrink-0 truncate text-sm font-semibold text-[#15181d] dark:text-slate-100">
                {s.name}
              </span>
              <span className="flex flex-wrap gap-1">
                {DAY_LABELS.map((label, dow) => (
                  <label
                    key={dow}
                    className="flex cursor-pointer items-center gap-1 rounded-full border border-[#e3e5ea] px-2 py-1 text-[11px] font-medium text-[#565d6d] has-[:checked]:border-indigo-300 has-[:checked]:bg-indigo-50 has-[:checked]:text-indigo-700 dark:border-slate-700 dark:text-slate-300 dark:has-[:checked]:bg-indigo-950/40 dark:has-[:checked]:text-indigo-300"
                  >
                    <input
                      type="checkbox"
                      name="work_day"
                      value={dow}
                      defaultChecked={s.workDays?.includes(dow) ?? false}
                      className="h-3 w-3"
                    />
                    {label}
                  </label>
                ))}
              </span>
              <label className="flex items-center gap-1 text-[11px] text-[#8a91a0] dark:text-slate-500">
                <input type="checkbox" name="every_day" defaultChecked={s.workDays == null} className="h-3 w-3" />
                Every day
              </label>
              <button
                type="submit"
                className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                Save
              </button>
            </form>
          ))}
        </div>

        {overrides.length > 0 && (
          <div className="mt-4 border-t border-[#edeff3] pt-3 dark:border-slate-800">
            <span className="text-xs font-semibold uppercase tracking-wide text-[#8a91a0] dark:text-slate-500">
              Opened days off — {date}
            </span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {overrides.map((o) => {
                const who = specialists.find((s) => s.id === o.staffId)?.name ?? "Unknown";
                return (
                  <span
                    key={o.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                  >
                    ☀️ {who} opened
                    <button
                      type="button"
                      onClick={() => startTransition(() => revokeSpecialistDay(o.id).catch(() => {}))}
                      title="Undo — back to their normal day off"
                      className="text-emerald-600 hover:text-emerald-900 dark:hover:text-emerald-100"
                    >
                      ✕
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
