"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { logFeeding } from "@/app/feeding/actions";
import Link from "next/link";

// PawFeed-style feeding board, living inside the dashboard. One card per
// checked-in animal for the selected date + meal: the animal's standing
// feeding instructions, All/Half/Some/None appetite buttons, and the
// billable extras (house fresh food, topper, CBD) plus a medication check.
// Every control saves on tap — no submit button to forget.

export type MealName = "Breakfast" | "Lunch" | "Dinner";

export type FeedingRow = {
  petId: string; // gingr id when available (matches PawFeed), else animal uuid
  animalId: string;
  reservationId: string;
  name: string;
  parentLastName: string | null;
  feeding: string | null;
  medications: string | null;
  alertNote: string | null;
  typeName: string | null;
  isOvernight: boolean;
  startYmd: string;
  endYmd: string;
};

type LogRow = {
  pet_id: string;
  meal_time: string;
  amount: string | null;
  fresh_food: boolean;
  fresh_food_items: string | null;
  medication_administered: boolean;
  staff_notes: string | null;
  logged_by: string | null;
};

const MEALS: { name: MealName; icon: string }[] = [
  { name: "Breakfast", icon: "🍳" },
  { name: "Lunch", icon: "☀️" },
  { name: "Dinner", icon: "🌙" },
];

const AMOUNTS = ["All", "Half", "Some", "None"] as const;

function fmtShort(ymd: string) {
  const [, m, d] = ymd.split("-").map(Number);
  return `${m}/${d}`;
}

export default function FeedingBoard({
  rows,
  logs,
  date,
  meal,
  facilitySlug,
  staffName,
}: {
  rows: FeedingRow[];
  logs: LogRow[];
  date: string;
  meal: MealName;
  facilitySlug: string;
  staffName?: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Who's logging — PawFeed asks at login; here we remember the last name
  // typed on this device. Falls back to the session staff name.
  const [loggedBy, setLoggedBy] = useState(staffName && staffName !== "Staff" ? staffName : "");
  useEffect(() => {
    const saved = window.localStorage.getItem("feeding_logged_by");
    if (saved) setLoggedBy(saved);
  }, []);
  function rememberName(v: string) {
    setLoggedBy(v);
    try {
      window.localStorage.setItem("feeding_logged_by", v);
    } catch {
      /* private mode — fine */
    }
  }

  // Optimistic local copy of today's logs, keyed pet|meal.
  const [local, setLocal] = useState<Map<string, Partial<LogRow>>>(new Map());
  useEffect(() => setLocal(new Map()), [date]);
  const logFor = useMemo(() => {
    const m = new Map<string, LogRow>();
    for (const l of logs) m.set(`${l.pet_id}|${l.meal_time}`, l);
    return m;
  }, [logs]);
  function current(petId: string, forMeal: MealName): Partial<LogRow> {
    return { ...logFor.get(`${petId}|${forMeal}`), ...local.get(`${petId}|${forMeal}`) };
  }

  function save(row: FeedingRow, patch: Parameters<typeof logFeeding>[5]) {
    const key = `${row.petId}|${meal}`;
    setError(null);
    setSavingKey(key);
    setLocal((prev) => {
      const next = new Map(prev);
      next.set(key, { ...prev.get(key), ...patch, logged_by: loggedBy || "Dashboard" } as Partial<LogRow>);
      return next;
    });
    startTransition(async () => {
      try {
        await logFeeding(facilitySlug, row.petId, row.name, date, meal, {
          ...patch,
          logged_by: loggedBy || "Dashboard",
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save — check connection and retap.");
        router.refresh();
      } finally {
        setSavingKey((k) => (k === key ? null : k));
      }
    });
  }

  function setParam(next: { date?: string; meal?: string }) {
    const p = new URLSearchParams({ date, meal, ...next });
    router.push(`/feeding?${p.toString()}`);
  }

  function toggleItem(row: FeedingRow, item: "topper" | "cbd") {
    const cur = current(row.petId, meal);
    const items = new Set(
      (cur.fresh_food_items ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    );
    if (items.has(item)) items.delete(item);
    else items.add(item);
    save(row, { fresh_food_items: items.size ? Array.from(items).join(",") : null });
  }

  const doneCount = (forMeal: MealName) =>
    rows.filter((r) => current(r.petId, forMeal).amount != null).length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[19px] font-semibold leading-tight">Feeding Log</h1>
          <p className="text-[13px] text-slate-500 dark:text-slate-400">
            {rows.length} checked in · logs sync with the PawFeed tablet app
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={loggedBy}
            onChange={(e) => rememberName(e.target.value)}
            placeholder="Your name"
            className="h-9 w-28 rounded-lg border border-slate-300 bg-white px-2.5 text-[13px] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
          <input
            type="date"
            value={date}
            onChange={(e) => setParam({ date: e.target.value })}
            className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-[13px] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
      </div>

      {/* Meal tabs with per-meal progress */}
      <div className="mt-3 flex gap-1.5">
        {MEALS.map((m) => {
          const active = m.name === meal;
          return (
            <button
              key={m.name}
              type="button"
              onClick={() => setParam({ meal: m.name })}
              className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors ${
                active
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              <span>{m.icon}</span>
              {m.name}
              <span className={active ? "opacity-70" : "text-slate-400 dark:text-slate-500"}>
                {doneCount(m.name)}/{rows.length}
              </span>
            </button>
          );
        })}
      </div>

      {error && <p className="mt-2 text-[13px] text-red-600 dark:text-red-400">{error}</p>}

      {rows.length === 0 && (
        <p className="mt-8 text-sm text-slate-400 dark:text-slate-500">No animals checked in right now.</p>
      )}

      <div className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => {
          const cur = current(row.petId, meal);
          const items = new Set(
            (cur.fresh_food_items ?? "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          );
          const saving = savingKey === `${row.petId}|${meal}`;
          const logged = cur.amount != null;
          return (
            <div
              key={row.petId}
              className={`rounded-xl border bg-white p-3 dark:bg-slate-900 ${
                logged
                  ? "border-emerald-300 dark:border-emerald-900"
                  : "border-slate-200 dark:border-slate-800"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    href={`/animals/${row.animalId}`}
                    className="text-[15px] font-semibold underline decoration-slate-300 hover:decoration-slate-600 dark:decoration-slate-600"
                  >
                    {row.name}
                  </Link>
                  {row.parentLastName && (
                    <span className="ml-1.5 text-[12px] text-slate-400 dark:text-slate-500">({row.parentLastName})</span>
                  )}
                  {row.alertNote && <span title={`Alert: ${row.alertNote}`}> ❗</span>}
                  <div className="text-[11px] text-slate-400 dark:text-slate-500">
                    {row.isOvernight ? `🌙 Overnight ${fmtShort(row.startYmd)}–${fmtShort(row.endYmd)}` : row.typeName}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    logged
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                      : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                  }`}
                >
                  {saving ? "saving…" : logged ? `ate ${cur.amount}` : "pending"}
                </span>
              </div>

              {row.feeding ? (
                <details className="mt-2">
                  <summary className="cursor-pointer select-none text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    Feeding instructions
                  </summary>
                  <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-slate-600 dark:text-slate-300">
                    {row.feeding}
                  </p>
                </details>
              ) : (
                <p className="mt-2 text-[11px] italic text-slate-400 dark:text-slate-500">
                  No feeding instructions on file.
                </p>
              )}

              <div className="mt-2 grid grid-cols-4 gap-1">
                {AMOUNTS.map((a) => {
                  const selected = cur.amount === a;
                  return (
                    <button
                      key={a}
                      type="button"
                      onClick={() => save(row, { amount: selected ? null : a })}
                      className={`h-9 rounded-lg text-[13px] font-medium transition-colors ${
                        selected
                          ? a === "None"
                            ? "bg-red-600 text-white"
                            : "bg-emerald-600 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                      }`}
                    >
                      {a}
                    </button>
                  );
                })}
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {/* Billable extras — these flow onto the parent's tab at checkout. */}
                <button
                  type="button"
                  onClick={() => save(row, { fresh_food: !cur.fresh_food })}
                  title="House fresh food — billed per meal at checkout"
                  className={`inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[12px] font-medium ${
                    cur.fresh_food
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  }`}
                >
                  🏠🌿 House Food{cur.fresh_food ? " ✓" : "?"}
                </button>
                <button
                  type="button"
                  onClick={() => toggleItem(row, "topper")}
                  className={`inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[12px] font-medium ${
                    items.has("topper")
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  }`}
                >
                  🥩 Topper{items.has("topper") ? " ✓" : ""}
                </button>
                <button
                  type="button"
                  onClick={() => toggleItem(row, "cbd")}
                  className={`inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[12px] font-medium ${
                    items.has("cbd")
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  }`}
                >
                  🌿 CBD{items.has("cbd") ? " ✓" : ""}
                </button>
                {row.medications && (
                  <button
                    type="button"
                    onClick={() => save(row, { medication_administered: !cur.medication_administered })}
                    title={row.medications}
                    className={`inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[12px] font-medium ${
                      cur.medication_administered
                        ? "bg-indigo-600 text-white"
                        : "bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-950/50 dark:text-amber-300"
                    }`}
                  >
                    💊 Meds{cur.medication_administered ? " given ✓" : "?"}
                  </button>
                )}
              </div>

              {row.medications && (
                <details className="mt-2">
                  <summary className="cursor-pointer select-none text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                    Medication instructions
                  </summary>
                  <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-slate-600 dark:text-slate-300">
                    {row.medications}
                  </p>
                </details>
              )}

              <input
                defaultValue={cur.staff_notes ?? ""}
                placeholder="Staff note (saves when you click away)"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v !== (cur.staff_notes ?? "")) save(row, { staff_notes: v || null });
                }}
                className="mt-2 h-8 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-[12px] placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
