"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import AnimalPicker, { type AnimalOption } from "@/components/AnimalPicker";
import { createReservation, getGroomingMemory, getSpecialistConflicts, getSiblingAnimals } from "@/app/reservations/actions";
import Link from "next/link";

type ReservationType = {
  id: string;
  name: string;
  category: string;
  requiresLodging: boolean;
  requiresSpecialist: boolean;
  durationMinutes: number | null;
};
type GroomingService = {
  name: string;
  defaultDurationMinutes: number | null;
  minPrice?: number | null;
  maxPrice?: number | null;
};
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
  initialAnimal,
  initialTypeId,
  staffName,
}: {
  facilityId: string;
  animals: AnimalOption[];
  reservationTypes: ReservationType[];
  lodgingAreas: LodgingArea[];
  groomingServices: GroomingService[];
  specialists: Specialist[];
  // Arriving here from a specific dog or parent's page ("New Booking")
  // should skip re-searching for who staff were already looking at.
  initialAnimal?: AnimalOption | null;
  /** Preselects a reservation type (e.g. the board's "+ Grooming" shortcut). */
  initialTypeId?: string | null;
  staffName?: string | null;
}) {
  const router = useRouter();
  const todayStr = new Date().toISOString().slice(0, 10);

  const [animal, setAnimal] = useState<AnimalOption | null>(initialAnimal ?? null);
  const [siblings, setSiblings] = useState<{ id: string; name: string; breed: string | null }[]>([]);
  const [selectedSiblingIds, setSelectedSiblingIds] = useState<Set<string>>(new Set());
  const [typeId, setTypeId] = useState(initialTypeId ?? reservationTypes[0]?.id ?? "");
  const [lodgingAreaId, setLodgingAreaId] = useState("");
  const [serviceName, setServiceName] = useState(groomingServices[0]?.name ?? "");
  const [specialistId, setSpecialistId] = useState("");
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  // Boarding/daycare drop-off and pick-up times (Kathleen's request — bookings
  // were date-only). Pick-up defaults to noon: that's the late-fee cutoff.
  const [dropOffTime, setDropOffTime] = useState("09:00");
  const [pickUpTime, setPickUpTime] = useState("12:00");
  const [startTime, setStartTime] = useState("09:00");
  const [durationMinutes, setDurationMinutes] = useState(FALLBACK_DURATION);
  const [durationTouched, setDurationTouched] = useState(false);
  // Grooming price, quotable at booking time (Kath, Aug 30). Prefills from
  // this dog's remembered price for the service, else the menu's min price.
  const [groomingPrice, setGroomingPrice] = useState<string>("");
  const [priceTouched, setPriceTouched] = useState(false);
  const [belongings, setBelongings] = useState("");
  const [notes, setNotes] = useState("");
  const [lastGroomedNote, setLastGroomedNote] = useState<string | null>(null);
  const [lastPriceNote, setLastPriceNote] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<{ id: string; animalName: string; startDate: string; endDate: string; isBlock?: boolean; reason?: string | null }[]>([]);
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
    setLastPriceNote(null);
    setGroomingPrice(svc?.minPrice != null ? String(svc.minPrice) : "");
    setPriceTouched(false);
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
      // Per-animal per-service price memory: what this dog's last
      // <serviceName> actually cost, so staff can quote it up front.
      // Checkout pre-fills the same number; a different service (e.g. bath
      // vs haircut) keeps its own remembered price.
      if (mem.price != null) {
        const when = mem.updated_at
          ? ` (${new Date(mem.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })})`
          : "";
        setLastPriceNote(`${animal.name}'s last ${serviceName}: $${Number(mem.price)}${when}`);
        setGroomingPrice((cur) => (priceTouched ? cur : String(Number(mem.price))));
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
        let firstReservationId: string | null = null;
        for (const aId of animalIds) {
          const { reservationId } = await createReservation({
            facilityId,
            animalId: aId,
            reservationTypeId: typeId || null,
            lodgingAreaId: type?.requiresLodging ? lodgingAreaId || null : null,
            startDate,
            startTime: usesTimeSlot ? startTime : dropOffTime || null,
            endDate: usesTimeSlot ? null : endDate,
            endTime: usesTimeSlot ? null : pickUpTime || null,
            durationMinutes: usesTimeSlot ? durationMinutes : null,
            // A shared specialist/service memory lookup only makes sense for
            // the primary dog that was actually picked via the grooming
            // memory flow above — siblings still get the same appointment
            // settings, just without double-writing that per-dog memory.
            specialistId: isGrooming ? specialistId || null : null,
            serviceName: isGrooming ? serviceName || null : null,
            groomingPrice: isGrooming && groomingPrice !== "" && Number(groomingPrice) > 0 ? Number(groomingPrice) : null,
            belongings: belongings || null,
            notes: notes || null,
            bookingGroupId,
            performedBy: staffName ?? null,
          });
          if (!firstReservationId) firstReservationId = reservationId;
        }
        // Land on the actual confirmation instead of the board — staff should
        // see arrival/departure and who/what was just booked right away,
        // same as Gingr does after saving a reservation.
        router.push(firstReservationId ? `/reservations/${firstReservationId}` : "/reservations");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create booking");
      }
    });
  }

  // Design system: numbered step cards on the left, live booking summary on
  // the right (mock: "New booking" screen).
  function StepCard({
    n,
    title,
    children,
  }: {
    n: number;
    title: string;
    children: ReactNode;
  }) {
    return (
      <section className="rounded-[14px] border border-[#e3e5ea] bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-50 text-[12px] font-bold text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">
            {n}
          </span>
          <h2 className="text-[15px] font-semibold text-[#15181d] dark:text-slate-100">{title}</h2>
        </div>
        {children}
      </section>
    );
  }

  const summaryDates = usesTimeSlot
    ? `${startDate} · ${SLOTS.find((s) => s.value === startTime)?.label ?? startTime}`
    : startDate === endDate
      ? `${startDate} (day visit)`
      : `${startDate} → ${endDate}`;
  const extraDogs = siblings.filter((s) => selectedSiblingIds.has(s.id));

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-4">
        <StepCard n={1} title="Who's coming in">
          <AnimalPicker animals={animals} onSelect={setAnimal} initialSelected={initialAnimal ?? null} />
          {animal?.alertNote && (
            <div className="mt-3 flex items-start gap-2 rounded-[10px] border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              <span>❗</span>
              <span>{animal.alertNote}</span>
            </div>
          )}
          {animals.length === 0 && (
            <p className="mt-2 text-xs text-[#8a91a0] dark:text-slate-500">
              No animals yet — <Link href="/animals/new" className="underline">add one first</Link>.
            </p>
          )}

          {siblings.length > 0 && (
            <div className="mt-3 rounded-[10px] border border-[#e3e5ea] bg-[#f9fafb] p-3 dark:border-slate-800 dark:bg-slate-950/40">
              <span className="text-sm font-semibold text-[#15181d] dark:text-slate-200">
                Also book from the same household?
              </span>
              <div className="mt-2 flex flex-wrap gap-2">
                {siblings.map((s) => (
                  <label
                    key={s.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                      selectedSiblingIds.has(s.id)
                        ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300"
                        : "border-[#e3e5ea] bg-white text-[#565d6d] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={selectedSiblingIds.has(s.id)}
                      onChange={() => toggleSibling(s.id)}
                    />
                    {selectedSiblingIds.has(s.id) ? "✓ " : "+ "}
                    {s.name}
                    {s.breed ? ` · ${s.breed}` : ""}
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-[#8a91a0] dark:text-slate-500">
                Creates identical bookings for each dog picked — adjust lodging per dog afterward.
              </p>
            </div>
          )}
        </StepCard>

        <StepCard n={2} title="Service">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {reservationTypes.map((t) => (
              <label
                key={t.id}
                className={`flex cursor-pointer items-center justify-between rounded-[10px] border px-3 py-2.5 text-sm transition-colors ${
                  typeId === t.id
                    ? "border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500 dark:border-indigo-500 dark:bg-indigo-950/30"
                    : "border-[#e3e5ea] bg-white hover:border-indigo-200 dark:border-slate-700 dark:bg-slate-900"
                }`}
              >
                <input
                  type="radio"
                  name="reservation_type"
                  className="sr-only"
                  checked={typeId === t.id}
                  onChange={() => setTypeId(t.id)}
                />
                <span className="font-semibold text-[#15181d] dark:text-slate-100">{t.name}</span>
                <span className="text-[11px] font-medium uppercase tracking-wide text-[#8a91a0] dark:text-slate-500">
                  {t.category.replace(/_/g, " ")}
                </span>
              </label>
            ))}
          </div>

          {type?.requiresLodging && (
            <label className="mt-3 block sm:max-w-xs">
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
        </StepCard>

        <StepCard n={3} title="When">
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
                {lastPriceNote && (
                  <p className="mt-1 text-xs font-medium text-green-700 dark:text-green-400">
                    💲 {lastPriceNote} — expect the same unless the coat&apos;s condition changed.
                  </p>
                )}
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
              <span className="hidden" />
            )}
            {isGrooming && (
              <label className="block">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Price ($)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={groomingPrice}
                  onChange={(e) => {
                    setGroomingPrice(e.target.value);
                    setPriceTouched(true);
                  }}
                  placeholder="0.00"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                  Quoted now, prefilled at checkout — adjust it there if the coat needs more work.
                </p>
              </label>
            )}
            {!isGrooming && (
              <div className="block">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Duration</span>
                <p className="mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                  {Math.round((type?.durationMinutes ?? EVAL_DEFAULT_DURATION) / 60)} hours (fixed)
                </p>
              </div>
            )}
          </div>

          {conflicts.some((c) => c.isBlock) && (
            <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-400">
              🚫 {specialists.find((s) => s.id === specialistId)?.name ?? "This specialist"} is blocked out during
              this window
              {(() => {
                const b = conflicts.find((c) => c.isBlock);
                return b?.reason ? ` (${b.reason})` : "";
              })()}
              . You can still book it, but someone should double-check they&apos;ll actually be here.
            </div>
          )}
          {conflicts.some((c) => !c.isBlock) && (
            <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
              ⚠️ {specialists.find((s) => s.id === specialistId)?.name ?? "This specialist"} already has{" "}
              {conflicts.filter((c) => !c.isBlock).map((c) => c.animalName).join(", ")} booked during this window —
              you can still create this, it&apos;ll just double-book them.
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Drop-off Time</span>
            <input
              type="time"
              value={dropOffTime}
              onChange={(e) => setDropOffTime(e.target.value)}
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
          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Pick-up Time</span>
            <input
              type="time"
              value={pickUpTime}
              onChange={(e) => setPickUpTime(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Boarding pick-ups after 12:15 PM add the late fee at checkout.
            </p>
          </label>
        </div>
      )}
        </StepCard>

        <StepCard n={4} title="Details">
          <div className="flex flex-col gap-3">
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
          </div>
        </StepCard>
      </div>

      {/* Booking summary rail — sticky on desktop, inline (bottom) on mobile. */}
      <aside className="rounded-[14px] border border-[#e3e5ea] bg-white p-4 shadow-sm lg:sticky lg:top-20 dark:border-slate-800 dark:bg-slate-900">
        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8a91a0] dark:text-slate-500">
          Booking summary
        </div>
        <dl className="mt-3 flex flex-col gap-2.5 text-sm">
          <div className="flex items-start justify-between gap-3">
            <dt className="shrink-0 text-[#8a91a0] dark:text-slate-500">Dog{extraDogs.length > 0 ? "s" : ""}</dt>
            <dd className="text-right font-semibold text-[#15181d] dark:text-slate-100">
              {animal ? [animal.name, ...extraDogs.map((s) => s.name)].join(", ") : "—"}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-3">
            <dt className="shrink-0 text-[#8a91a0] dark:text-slate-500">Service</dt>
            <dd className="text-right font-semibold text-[#15181d] dark:text-slate-100">
              {type?.name ?? "—"}
              {isGrooming && serviceName ? ` · ${serviceName}` : ""}
            </dd>
          </div>
          {type?.requiresLodging && (
            <div className="flex items-start justify-between gap-3">
              <dt className="shrink-0 text-[#8a91a0] dark:text-slate-500">Lodging</dt>
              <dd className="text-right font-semibold text-[#15181d] dark:text-slate-100">
                {lodgingAreas.find((a) => a.id === lodgingAreaId)?.name ?? "Unassigned"}
              </dd>
            </div>
          )}
          <div className="flex items-start justify-between gap-3">
            <dt className="shrink-0 text-[#8a91a0] dark:text-slate-500">When</dt>
            <dd className="text-right font-semibold text-[#15181d] dark:text-slate-100">{summaryDates}</dd>
          </div>
          {isGrooming && groomingPrice !== "" && Number(groomingPrice) > 0 && (
            <div className="flex items-start justify-between gap-3">
              <dt className="shrink-0 text-[#8a91a0] dark:text-slate-500">Price</dt>
              <dd className="text-right font-semibold text-[#15181d] dark:text-slate-100">
                ${Number(groomingPrice).toFixed(2)}
              </dd>
            </div>
          )}
          {!usesTimeSlot && (
            <div className="flex items-start justify-between gap-3">
              <dt className="shrink-0 text-[#8a91a0] dark:text-slate-500">Times</dt>
              <dd className="text-right font-semibold text-[#15181d] dark:text-slate-100">
                {dropOffTime || "—"} → {pickUpTime || "—"}
              </dd>
            </div>
          )}
        </dl>

        {!usesTimeSlot && pickUpTime > "12:15" && (
          <p className="mt-3 rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            Pick-up after 12:15 PM adds the late check-out fee at checkout.
          </p>
        )}

        {error && (
          <div className="mt-3 rounded-[10px] bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={isPending || !canSubmit}
          className="mt-4 w-full rounded-[10px] bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
        >
          {isPending
            ? "Creating…"
            : extraDogs.length > 0
              ? `Create ${1 + extraDogs.length} bookings`
              : "Create booking"}
        </button>
        <p className="mt-2 text-center text-[11px] text-[#8a91a0] dark:text-slate-500">
          Shows up in Quick Check-in right away.
        </p>
      </aside>
    </div>
  );
}
