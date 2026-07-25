"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import AnimalPicker, { type AnimalOption } from "@/components/AnimalPicker";
import { createReservation, getGroomingMemory, getSpecialistConflicts, getSiblingAnimals } from "@/app/reservations/actions";

type ReservationType = {
  id: string;
  name: string;
  category: string;
  requiresLodging: boolean;
  requiresSpecialist: boolean;
  durationMinutes: number | null;
};
type GroomingService = { name: string; defaultDurationMinutes: number | null };
type Specialist = { id: string; name: string };
type LodgingArea = { id: string; name: string };

const FALLBACK_DURATION = 45;
const EVAL_DEFAULT_DURATION = 240;
// Evaluations only run at fixed hourly starts, not a free 15-min grid.
const EVAL_HOURS = [8, 9, 10, 11, 12, 13];

function fmtSlot(h24: number, m = 0) {
  const value = `${String(h24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { value, label: `${h12}:${String(m).padStart(2, "0")} ${ampm}` };
}

function timeSlots() {
  // 7:00am-7:00pm in 15-minute steps, matching the granularity of a
  // typical grooming schedule (Gingr's own booking screen uses the same).
  const slots: { value: string; label: string }[] = [];
  for (let min = 7 * 60; min <= 19 * 60; min += 15) {
    slots.push(fmtSlot(Math.floor(min / 60), min % 60));
  }
  return slots;
}
const SLOTS = timeSlots();
const EVAL_SLOTS = EVAL_HOURS.map((h) => fmtSlot(h));

export default function BookingForm({
  facilityId,
  animals,
  reservationTypes,
  lodgingAreas,
  groomingServices,
  specialists,
}: {
  facilityId: string;
  animals: AnimalOption[];
  reservationTypes: ReservationType[];
  lodgingAreas: LodgingArea[];
  groomingServices: GroomingService[];
  specialists: Specialist[];
}) {
  const router = useRouter();
  const todayStr = new Date().toISOString().slice(0, 10);

  const [animal, setAnimal] = useState<AnimalOption | null>(null);
  const [siblings, setSiblings] = useState<{ id: string; name: string; breed: string | null }[]>([]);
  const [selectedSiblingIds, setSelectedSiblingIds] = useState<Set<string>>(new Set());
  const [typeId, setTypeId] = useState(reservationTypes[0]?.id ?? "");
  const [lodgingAreaId, setLodgingAreaId] = useState("");
  const [serviceName, setServiceName] = useState(groomingServices[0]?.name ?? "");
  const [specialistId, setSpecialistId] = useState("");
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [startTime, setStartTime] = useState("09:00");
  const [durationMinutes, setDurationMinutes] = useState(FALLBACK_DURATION);
  const [durationTouched, setDurationTouched] = useState(false);
  const [belongings, setBelongings] = useState("");
  const [notes, setNotes] = useState("");
  const [lastGroomedNote, setLastGroomedNote] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<{ id: string; animalName: string; startDate: string; endDate: string }[]>([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Most multi-dog bookings are the same household coming in together — once
  // a dog is picked, offer its other dogs (same parent) as one-click
  // additions instead of making staff repeat the whole form per dog.
  useEffect(() => {
    setSelectedSiblingIds(new Set());
    if (!animal?.parentId) {
      setSiblings([]);
      return;
    }
    let cancelled = false;
    getSiblingAnimals(animal.parentId, animal.id).then((rows) => {
      if (!cancelled) setSiblings(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [animal]);

  function toggleSibling(id: string) {
    setSelectedSiblingIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const type = reservationTypes.find((t) => t.id === typeId) ?? null;
  const isGrooming = type?.category === "grooming";
  const isEvaluation = type?.category === "evaluation";
  const usesTimeSlot = isGrooming || isEvaluation;

  // Evaluations are a fixed-length, fixed-slot block — no service picker,
  // no editable duration, just pick which of the offered hours works.
  useEffect(() => {
    if (!isEvaluation) return;
    setDurationMinutes(type?.durationMinutes ?? EVAL_DEFAULT_DURATION);
    setStartTime((t) => (EVAL_SLOTS.some((s) => s.value === t) ? t : EVAL_SLOTS[0].value));
    setSpecialistId("");
  }, [isEvaluation, type?.durationMinutes]);

  // Prefill duration from the service default whenever the service changes
  // (until the animal's own history overrides it below).
  useEffect(() => {
    if (!isGrooming) return;
    const svc = groomingServices.find((s) => s.name === serviceName);
    setDurationMinutes(svc?.defaultDurationMinutes ?? FALLBACK_DURATION);
    setDurationTouched(false);
    setLastGroomedNote(null);
  }, [serviceName, isGrooming, groomingServices]);

  // Once both a dog and a service are picked, look up what's remembered —
  // how long it actually took last time, and who groomed them — and use
  // that instead of the generic service default.
  useEffect(() => {
    if (!isGrooming || !animal || !serviceName) return;
    getGroomingMemory(animal.id, serviceName).then((mem) => {
      if (!mem) return;
      if (mem.duration_minutes != null) {
        setDurationMinutes(mem.duration_minutes);
        setDurationTouched(false);
      }
      if (mem.last_specialist_id) {
        setSpecialistId(mem.last_specialist_id);
        const name = specialists.find((s) => s.id === mem.last_specialist_id)?.name;
        setLastGroomedNote(name ? `Last groomed by ${name}` : null);
      }
    });
  }, [animal, serviceName, isGrooming, specialists]);

  // Overbooking a specialist is allowed, but flag it before they submit —
  // and again visually on the Facility Calendar once it's booked.
  useEffect(() => {
    if (!isGrooming || !specialistId || !startDate || !startTime || !durationMinutes) {
      setConflicts([]);
      return;
    }
    const start = new Date(`${startDate}T${startTime}:00`);
    const end = new Date(start.getTime() + durationMinutes * 60000);
    let cancelled = false;
    getSpecialistConflicts(facilityId, specialistId, start.toISOString(), end.toISOString()).then((rows) => {
      if (!cancelled) setConflicts(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [isGrooming, specialistId, startDate, startTime, durationMinutes, facilityId]);

  const canSubmit = Boolean(animal && startDate);

  function submit() {
    setError(null);
    if (!animal) {
      setError("Pick a dog first.");
      return;
    }
    const animalIds = [animal.id, ...siblings.filter((s) => selectedSiblingIds.has(s.id)).map((s) => s.id)];
    // Only link these as a group if there's actually more than one dog —
    // a solo booking doesn't need a booking_group_id at all.
    const bookingGroupId = animalIds.length > 1 ? crypto.randomUUID() : null;

    startTransition(async () => {
      try {
        for (const aId of animalIds) {
          await createReservation({
            facilityId,
            animalId: aId,
            reservationTypeId: typeId || null,
            lodgingAreaId: type?.requiresLodging ? lodgingAreaId || null : null,
            startDate,
            startTime: usesTimeSlot ? startTime : null,
            endDate: usesTimeSlot ? null : endDate,
            durationMinutes: usesTimeSlot ? durationMinutes : null,
            // A shared specialist/service memory lookup only makes sense for
            // the primary dog that was actually picked via the grooming
            // memory flow above — siblings still get the same appointment
            // settings, just without double-writing that per-dog memory.
            specialistId: isGrooming ? specialistId || null : null,
            serviceName: isGrooming ? serviceName || null : null,
            belongings: belongings || null,
            notes: notes || null,
            bookingGroupId,
          });
        }
        router.push("/reservations");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create booking");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <AnimalPicker animals={animals} onSelect={setAnimal} />
      {animals.length === 0 && (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          No animals yet — <a href="/animals/new" className="underline">add one first</a>.
        </p>
      )}

      {siblings.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Also book from the same household?
          </span>
          <div className="mt-2 flex flex-col gap-1">
            {siblings.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedSiblingIds.has(s.id)}
                  onChange={() => toggleSibling(s.id)}
                />
                {s.name}
                {s.breed ? ` · ${s.breed}` : ""}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Creates identical bookings for each dog checked — you can adjust lodging per dog afterward.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Reservation Type</span>
          <select
            value={typeId}
            onChange={(e) => setTypeId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="">—</option>
            {reservationTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        {type?.requiresLodging && (
          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Lodging Area</span>
            <select
              value={lodgingAreaId}
              onChange={(e) => setLodgingAreaId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">— Unassigned —</option>
              {lodgingAreas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {usesTimeSlot ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {isEvaluation ? "Evaluation Appointment" : "Grooming Appointment"}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {isGrooming && (
              <label className="block">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Service</span>
                <select
                  value={serviceName}
                  onChange={(e) => setServiceName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  {groomingServices.length === 0 && <option value="">No services set up yet</option>}
                  {groomingServices.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {isGrooming && (
              <label className="block">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Specialist</span>
                <select
                  value={specialistId}
                  onChange={(e) => setSpecialistId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="">Unassigned</option>
                  {specialists.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                {lastGroomedNote && (
                  <p className="mt-1 text-xs text-indigo-600 dark:text-indigo-400">{lastGroomedNote}</p>
                )}
              </label>
            )}
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Date<span className="text-red-500"> *</span>
              </span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Time</span>
              <select
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                {(isEvaluation ? EVAL_SLOTS : SLOTS).map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            {isGrooming ? (
              <label className="block">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Duration (minutes)</span>
                <input
                  type="number"
                  min={15}
                  step={15}
                  value={durationMinutes}
                  onChange={(e) => {
                    setDurationMinutes(Number(e.target.value));
                    setDurationTouched(true);
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                  {durationTouched
                    ? "Saved for this dog next time you book this service."
                    : "Prefilled from last time (or the service default) — change it if this one runs long."}
                </p>
              </label>
            ) : (
              <div className="block">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Duration</span>
                <p className="mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                  {Math.round((type?.durationMinutes ?? EVAL_DEFAULT_DURATION) / 60)} hours (fixed)
                </p>
              </div>
            )}
          </div>

          {conflicts.length > 0 && (
            <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
              ⚠️ {specialists.find((s) => s.id === specialistId)?.name ?? "This specialist"} already has{" "}
              {conflicts.map((c) => c.animalName).join(", ")} booked during this window — you can still create this,
              it'll just double-book them.
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Start Date<span className="text-red-500"> *</span>
            </span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">End Date</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
        </div>
      )}

      <label className="block">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Belongings</span>
        <input
          value={belongings}
          onChange={(e) => setBelongings(e.target.value)}
          placeholder="Leash, bed, food…"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </label>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={isPending || !canSubmit}
        className="mt-2 w-full rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 sm:w-fit dark:bg-slate-100 dark:text-slate-900"
      >
        {isPending ? "Creating…" : "Create Booking"}
      </button>
    </div>
  );
}
