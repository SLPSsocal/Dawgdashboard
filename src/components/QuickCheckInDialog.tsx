"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { checkInReservation } from "@/app/reservations/actions";
import {
  getWalkInOptions,
  searchWalkInAnimals,
  walkInCheckIn,
  type WalkInAnimal,
  type WalkInOptions,
} from "@/app/reservations/walkin-actions";

export type CheckInCandidate = {
  id: string;
  animalId?: string | null;
  animalName: string;
  parentName: string | null;
  typeName: string | null;
  startDate: string;
  /** Lives in Gingr during migration — listed so staff can see the dog is
   *  expected, but checked in from Gingr rather than here. */
  inGingr?: boolean;
};

// Typeahead "who's arriving?" dialog. Lives on its own so the header nav and
// any page-level entry point can both open it without duplicating the list.
//
// Two halves: dogs EXPECTED today (existing bookings — one tap checks them
// in) and, once you've typed a name, any other dog on file as a WALK-IN —
// a same-day daycare reservation is created and checked in on the spot
// (4 staff tickets, Sep 14–15).
export default function QuickCheckInDialog({
  open,
  setOpen,
  candidates,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  candidates: CheckInCandidate[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState(candidates);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Walk-in state
  const [walkIns, setWalkIns] = useState<WalkInAnimal[]>([]);
  const [searching, setSearching] = useState(false);
  const [options, setOptions] = useState<WalkInOptions | null>(null);
  const [picked, setPicked] = useState<WalkInAnimal | null>(null);
  const [typeId, setTypeId] = useState<string>("");
  const [pickup, setPickup] = useState<string>("17:30");
  const [areaId, setAreaId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => setItems(candidates), [candidates]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setPicked(null);
      setError(null);
      setDone(null);
      setWalkIns([]);
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      getWalkInOptions()
        .then((o) => {
          setOptions(o);
          setTypeId(o.defaultTypeId ?? "");
          setPickup(o.defaultTypeId && o.halfDayTypeIds.includes(o.defaultTypeId) ? o.halfDayPickup : o.defaultPickup);
        })
        .catch(() => setOptions(null));
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  // Debounced walk-in search across every dog on file.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setWalkIns([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      searchWalkInAnimals(q)
        .then((rows) => setWalkIns(rows))
        .catch(() => setWalkIns([]))
        .finally(() => setSearching(false));
    }, 220);
    return () => clearTimeout(t);
  }, [query, open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? items.filter(
          (c) =>
            c.animalName.toLowerCase().includes(q) ||
            (c.parentName ?? "").toLowerCase().includes(q)
        )
      : items;
    return base.slice(0, 8);
  }, [items, query]);

  // Walk-in rows: hide dogs already listed as expected above.
  const expectedAnimalIds = useMemo(() => new Set(items.map((c) => c.animalId).filter(Boolean)), [items]);
  const walkInRows = walkIns.filter((w) => !expectedAnimalIds.has(w.id));

  const selectedType = options?.types.find((t) => t.id === typeId) ?? null;
  const isHalfDay = !!options && options.halfDayTypeIds.includes(typeId);

  // Switching service swaps the pickup default: half day = now + limit,
  // anything else = the facility's usual pickup.
  function changeType(id: string) {
    setTypeId(id);
    if (options) setPickup(options.halfDayTypeIds.includes(id) ? options.halfDayPickup : options.defaultPickup);
  }

  function pick(c: CheckInCandidate) {
    // Gingr rows are read-only here — the proxy is a one-way feed, so there is
    // no way to write the check-in back to Gingr. The board treats them the
    // same way ("in Gingr" badge, no check-in button).
    if (c.inGingr) return;
    setCheckingId(c.id);
    startTransition(async () => {
      try {
        await checkInReservation(c.id);
        setItems((prev) => prev.filter((x) => x.id !== c.id));
      } finally {
        setCheckingId(null);
      }
    });
  }

  function submitWalkIn() {
    if (!picked) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await walkInCheckIn({
          animalId: picked.id,
          reservationTypeId: typeId || null,
          pickupTime: pickup,
          lodgingAreaId: selectedType?.requiresLodging && areaId ? areaId : null,
        });
        setDone(res.reused ? `${picked.name} was already on today's board — checked in.` : `${picked.name} checked in as a walk-in.`);
        setPicked(null);
        setQuery("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Walk-in failed");
      }
    });
  }

  if (!open) return null;

  const input =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-20" onClick={() => setOpen(false)}>
      <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Quick Check-in</h2>
          <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Close">
            ✕
          </button>
        </div>

        {done && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
            ✓ {done}
          </div>
        )}

        {picked ? (
          <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50/60 p-3 dark:border-indigo-900 dark:bg-indigo-950/30">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  Walk-in: {picked.name}
                  {picked.breed && <span className="ml-1 font-normal text-slate-400">· {picked.breed}</span>}
                </div>
                <div className="text-[12px] text-slate-500 dark:text-slate-400">{picked.parentName ?? "No parent on file"}</div>
                {picked.alertNote && (
                  <div className="mt-1 text-[12px] font-medium text-amber-700 dark:text-amber-400">⚠ {picked.alertNote}</div>
                )}
                {picked.vaccinationExpiry && picked.vaccinationExpiry < new Date().toISOString().slice(0, 10) && (
                  <div className="mt-1 text-[12px] font-medium text-rose-600 dark:text-rose-400">
                    ⚠ Vaccines expired {new Date(`${picked.vaccinationExpiry}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                  </div>
                )}
              </div>
              <button type="button" onClick={() => setPicked(null)} className="text-[12px] text-slate-400 underline hover:text-slate-600">
                Change
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="col-span-2 text-[12px] text-slate-500 dark:text-slate-400">
                Service
                <select value={typeId} onChange={(e) => changeType(e.target.value)} className={`mt-1 ${input}`}>
                  {(options?.types ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                  {!options?.types.length && <option value="">Loading…</option>}
                </select>
              </label>
              <label className="text-[12px] text-slate-500 dark:text-slate-400">
                Pickup today
                <input type="time" value={pickup} onChange={(e) => setPickup(e.target.value)} className={`mt-1 ${input}`} />
              </label>
              {selectedType?.requiresLodging && (
                <label className="text-[12px] text-slate-500 dark:text-slate-400">
                  Suite
                  <select value={areaId} onChange={(e) => setAreaId(e.target.value)} className={`mt-1 ${input}`}>
                    <option value="">Assign later</option>
                    {(options?.areas ?? []).map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {error && <p className="mt-2 text-[12px] text-rose-600 dark:text-rose-400">{error}</p>}
            <button
              type="button"
              disabled={isPending || !typeId}
              onClick={submitWalkIn}
              className="mt-3 w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
            >
              {isPending ? "Checking in…" : `Create booking & check in ${picked.name}`}
            </button>
            <p className="mt-1.5 text-center text-[11px] text-slate-400 dark:text-slate-500">
              {isHalfDay
                ? `Half day converts to Full Day automatically if ${picked.name} is still here after ${Math.floor((options?.halfDayMinutes ?? 260) / 60)}h${(options?.halfDayMinutes ?? 260) % 60 ? ` ${(options?.halfDayMinutes ?? 260) % 60}m` : ""}.`
                : "Billed at today's rates at checkout, like any other stay."}
            </p>
          </div>
        ) : (
          <>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type a dog or parent name…"
              className={`mt-3 ${input}`}
            />
            <div className="mt-2 max-h-[60vh] overflow-y-auto">
              {results.length === 0 && walkInRows.length === 0 && !searching && (
                <div className="px-1 py-4 text-center text-sm text-slate-400 dark:text-slate-500">
                  <p>
                    {items.length === 0 && !query.trim()
                      ? "No dogs are expected right now."
                      : query.trim().length < 2
                        ? "No matches."
                        : "No dog on file with that name."}
                  </p>
                  {query.trim().length >= 2 && (
                    <p className="mt-2 text-[12px]">
                      Not a customer yet?{" "}
                      <a href="/parents/new" onClick={() => setOpen(false)} className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                        Add the parent and dog
                      </a>{" "}
                      first, then come back here.
                    </p>
                  )}
                  {query.trim().length < 2 && (
                    <p className="mt-2 text-[12px]">Type at least two letters to find any dog on file for a walk-in.</p>
                  )}
                </div>
              )}

              {results.length > 0 && (
                <div className="px-1 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  Expected
                </div>
              )}
              {results.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={c.inGingr || (isPending && checkingId === c.id)}
                  onClick={() => pick(c)}
                  title={c.inGingr ? "This stay lives in Gingr — check this dog in from Gingr until cutover." : undefined}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm disabled:opacity-50 ${
                    c.inGingr ? "cursor-default" : "hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  <span>
                    <span className="font-medium">{c.animalName}</span>
                    {c.inGingr && <span className="ml-1 text-[12px] text-indigo-500 dark:text-indigo-400">✱</span>}{" "}
                    <span className="text-slate-400 dark:text-slate-500">
                      {c.parentName ? `· ${c.parentName}` : ""} {c.typeName ? `· ${c.typeName}` : ""}
                    </span>
                  </span>
                  {c.inGingr ? (
                    <span className="shrink-0 whitespace-nowrap rounded-md bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300">
                      in Gingr
                    </span>
                  ) : (
                    <span className="shrink-0 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                      {checkingId === c.id && isPending ? "Checking in…" : "Check in →"}
                    </span>
                  )}
                </button>
              ))}

              {(walkInRows.length > 0 || (searching && query.trim().length >= 2)) && (
                <div className="mt-2 border-t border-slate-100 px-1 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:text-slate-500">
                  Walk-in — no booking today {searching && <span className="font-normal normal-case">· searching…</span>}
                </div>
              )}
              {walkInRows.map((w) => {
                const onBoard = w.todayStatus === "checked_in";
                return (
                  <button
                    key={w.id}
                    type="button"
                    disabled={onBoard || !w.active}
                    onClick={() => {
                      setDone(null);
                      setPicked(w);
                    }}
                    title={!w.active ? w.alertNote ?? "Inactive" : undefined}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">{w.name}</span>{" "}
                      <span className="text-slate-400 dark:text-slate-500">
                        {w.parentName ? `· ${w.parentName}` : ""} {w.breed ? `· ${w.breed}` : ""}
                      </span>
                      {w.alertNote && <span className="ml-1 text-[11px] text-amber-600 dark:text-amber-400">⚠</span>}
                    </span>
                    <span className="shrink-0 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                      {onBoard ? "Already in" : !w.active ? "Inactive" : "Walk-in →"}
                    </span>
                  </button>
                );
              })}
            </div>
            {results.some((c) => c.inGingr) && (
              <p className="mt-2 border-t border-slate-100 px-1 pt-2 text-[12px] text-slate-400 dark:border-slate-800 dark:text-slate-500">
                ✱ Still managed in Gingr — check these dogs in from Gingr until cutover.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
