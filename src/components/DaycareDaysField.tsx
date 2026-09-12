"use client";

import { useEffect, useState } from "react";
import { fmtDaycareDay, stayDays } from "@/lib/daycareAddon";

// Day picker for "which days of this boarding stay does the dog join
// daycare?" (Mark, Sep 10 — Gingr lets staff pick specific days; parents
// often only want daycare on some of them). Each picked day bills the
// facility's daycare add-on rule at checkout, and shows in the estimate.
//
// Controlled (value/onChange) for the booking form; uncontrolled with a
// hidden `daycare_dates` JSON field for the server-action edit form.
export default function DaycareDaysField({
  startDate,
  endDate,
  value,
  onChange,
  defaultValue,
  name = "daycare_dates",
  perDayPrice,
  compact = false,
}: {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  value?: string[];
  onChange?: (dates: string[]) => void;
  defaultValue?: string[];
  name?: string;
  /** Facility's per-day add-on, if a rule exists — shown as a hint. */
  perDayPrice?: number | null;
  compact?: boolean;
}) {
  const [inner, setInner] = useState<string[]>(defaultValue ?? []);
  const selected = value ?? inner;
  const days = stayDays(startDate, endDate);

  // Drop any picked day that fell outside the stay after a date change.
  useEffect(() => {
    const valid = selected.filter((d) => days.includes(d));
    if (valid.length !== selected.length) {
      if (onChange) onChange(valid);
      else setInner(valid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  function set(next: string[]) {
    const sorted = [...new Set(next)].sort();
    if (onChange) onChange(sorted);
    else setInner(sorted);
  }
  function toggle(d: string) {
    set(selected.includes(d) ? selected.filter((x) => x !== d) : [...selected, d]);
  }

  const all = days.length > 0 && days.every((d) => selected.includes(d));

  return (
    <div>
      {!value && <input type="hidden" name={name} value={JSON.stringify(selected)} />}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Daycare days
          {selected.length > 0 && (
            <span className="ml-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
              {selected.length} day{selected.length === 1 ? "" : "s"}
              {perDayPrice != null ? ` · $${(perDayPrice * selected.length).toFixed(2)}` : ""}
            </span>
          )}
        </span>
        {days.length > 1 && (
          <button
            type="button"
            onClick={() => set(all ? [] : days)}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
          >
            {all ? "Clear all" : "Every day"}
          </button>
        )}
      </div>
      {days.length === 0 ? (
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Pick the stay dates first.</p>
      ) : (
        <div className={`mt-1.5 flex flex-wrap gap-1.5 ${compact ? "" : ""}`}>
          {days.map((d) => {
            const on = selected.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggle(d)}
                aria-pressed={on}
                className={`rounded-lg border px-2.5 py-1.5 text-[12.5px] font-medium transition-colors ${
                  on
                    ? "border-amber-400 bg-amber-50 text-amber-900 ring-1 ring-amber-400 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-200"
                    : "border-[#e3e5ea] bg-white text-[#565d6d] hover:border-amber-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                }`}
              >
                {on ? "☀️ " : ""}
                {fmtDaycareDay(d)}
              </button>
            );
          })}
        </div>
      )}
      <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
        {perDayPrice != null
          ? `Each picked day adds $${perDayPrice.toFixed(2)} (this facility's daycare add-on rule) — shown in the estimate and billed at checkout.`
          : "No daycare add-on price is set for this facility yet — days are tracked, but nothing is added to the bill until a rule exists under Pricing Rules."}
      </p>
    </div>
  );
}
