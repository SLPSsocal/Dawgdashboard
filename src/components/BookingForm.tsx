"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import AnimalPicker, { type AnimalOption } from "@/components/AnimalPicker";
import { createReservation, getGroomingMemory } from "@/app/reservations/actions";

type ReservationType = {
  id: string;
  name: string;
  category: string;
  requiresLodging: boolean;
  requiresSpecialist: boolean;
};
type GroomingService = { name: string; defaultDurationMinutes: number | null };
type Specialist = { id: string; name: string };
type LodgingArea = { id: string; name: string };

const FALLBACK_DURATION = 45;

function timeSlots() {
  // 7:00am-7:00pm in 15-minute steps, matching the granularity of a
  // typical grooming schedule (Gingr's own booking screen uses the same).
  const slots: { value: string; label: string }[] = [];
  for (let min = 7 * 60; min <= 19 * 60; min += 15) {
    const h24 = Math.floor(min / 60);
    const m = min % 60;
    const value = `${String(h24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    const ampm = h24 >= 12 ? "PM" : "AM";
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    slots.push({ value, label: `${h12}:${String(m).padStart(2, "0")} ${ampm}` });
  }
  return slots;
}
const SLOTS = timeSlots();

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
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const type = reservationTypes.find((t) => t.id === typeId) ?? null;
  const isGrooming = type?.category === "grooming";

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

  const canSubmit = Boolean(animal && startDate);

  function submit() {
    setError(null);
    if (!animal) {
      setError("Pick a dog first.");
      return;
    }
    startTransition(async () => {
      try {
        const { reservationId } = await createReservation({
          facilityId,
          animalId: animal.id,
          reservationTypeId: typeId || null,
          lodgingAreaId: type?.requiresLodging ? lodgingAreaId || null : null,
          startDate,
          startTime: isGrooming ? startTime : null,
          endDate: isGrooming ? null : endDate,
          durationMinutes: isGrooming ? durationMinutes : null,
          specialistId: isGrooming ? specialistId || null : null,
          serviceName: isGrooming ? serviceName || null : null,
          belongings: belongings || null,
          notes: notes || null,
        });
        void reservationId;
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

      {isGrooming ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Grooming Appointment
          </div>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                {SLOTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
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
          </div>
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
