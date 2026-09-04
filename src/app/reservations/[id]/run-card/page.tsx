import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "@/components/PrintButton";
import { getProfileTagsFor } from "@/lib/profileTags";
import { getBookingGroupSiblings } from "../../actions";
import { stripHtml } from "@/lib/text";
import { todayLocal } from "@/lib/dates";
import QRCode from "qrcode";
import { formatInZone } from "@/lib/timezone";

function ageString(birthdate: string | null): string | null {
  if (!birthdate) return null;
  const bd = new Date(birthdate);
  if (Number.isNaN(bd.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - bd.getFullYear();
  let months = now.getMonth() - bd.getMonth();
  if (now.getDate() < bd.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} Year${years === 1 ? "" : "s"}`);
  parts.push(`${months} Month${months === 1 ? "" : "s"}`);
  return parts.join(", ");
}

// Compact: "Wed, Jul 15, 2:00 PM". Each rendered inside whitespace-nowrap so
// a date can never be split across two lines — wrapping happens only at the
// arrow between the two dates.
function fmtDateTime(iso: string, tz: string) {
  // Server-rendered — must format in the facility's zone, not the server's.
  return formatInZone(iso, tz, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function RunCardPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;

  const supabase = createClient();
  const { data: reservation } = await supabase
    .from("reservations")
    .select(
      `*, animals ( id, name, breed, size, sex, fixed, birthdate, photo_url, gingr_animal_id,
         medical_notes, medications, behavioral_notes, grooming_notes, alert_note,
         feeding_instructions, vet_name, vet_phone,
         parents ( first_name, last_name, phone, emergency_contact_name, emergency_contact_phone ) ),
       lodging_areas ( name ), reservation_types ( name )`
    )
    .eq("id", id)
    .maybeSingle();
  if (!reservation) notFound();

  const { data: facilityRow } = await supabase
    .from("facilities")
    .select("timezone")
    .eq("id", reservation.facility_id)
    .maybeSingle();
  const tz: string = facilityRow?.timezone ?? "America/New_York";

  const animal = reservation.animals as unknown as {
    id: string;
    name: string;
    breed: string | null;
    size: string | null;
    sex: string | null;
    fixed: boolean | null;
    birthdate: string | null;
    photo_url: string | null;
    gingr_animal_id: number | string | null;
    medical_notes: string | null;
    medications: string | null;
    behavioral_notes: string | null;
    grooming_notes: string | null;
    alert_note: string | null;
    feeding_instructions: string | null;
    vet_name: string | null;
    vet_phone: string | null;
    parents: {
      first_name: string;
      last_name: string;
      phone: string | null;
      emergency_contact_name: string | null;
      emergency_contact_phone: string | null;
    } | null;
  } | null;
  const lodging = reservation.lodging_areas as unknown as { name: string } | null;
  const type = reservation.reservation_types as unknown as { name: string } | null;
  const parent = animal?.parents ?? null;
  // Today's feeding log for this pet — same shared table the Feeding Log page
  // and the PawFeed tablet write to (keyed by dashboard id OR Gingr id), so a
  // meal logged in either place shows up here. Kath (Aug 19): the run card
  // showed static feeding instructions but never reflected what was actually
  // logged, and had no AM/PM checkboxes.
  const petKeys = animal
    ? [animal.id, ...(animal.gingr_animal_id != null ? [String(animal.gingr_animal_id)] : [])]
    : [];
  const todayYmd = todayLocal();
  const [animalTags, siblings, feedLogsRes] = await Promise.all([
    animal ? getProfileTagsFor("animal", animal.id) : Promise.resolve([]),
    getBookingGroupSiblings(id, reservation.booking_group_id ?? null),
    petKeys.length
      ? supabase
          .from("feeding_logs")
          .select("meal_time, amount, medication_administered")
          .in("pet_id", petKeys)
          .eq("date", todayYmd)
      : Promise.resolve({ data: [] as { meal_time: string; amount: string | null; medication_administered: boolean }[] }),
  ]);
  const feedLogs = feedLogsRes.data ?? [];
  const mealSlots: { label: string; meal: string }[] = [
    { label: "AM", meal: "Breakfast" },
    { label: "Lunch", meal: "Lunch" },
    { label: "PM", meal: "Dinner" },
  ];
  const isPoopEater = animalTags.some((t) => t.name === "Poop Eater");
  const isPeeDrinker = animalTags.some((t) => t.name === "Pee Drinker");

  // Unique per-animal QR (Kath's ask): the printed run card lives on the
  // suite, so scanning it with any phone opens THIS dog's feeding log,
  // pre-filtered — no hunting through the whole board.
  const feedingUrl = animal
    ? `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://dawgdashboard.vercel.app"}/feeding?animal=${animal.id}`
    : null;
  const feedingQrSvg = feedingUrl
    ? await QRCode.toString(feedingUrl, { type: "svg", margin: 1, width: 104, errorCorrectionLevel: "M" })
    : null;

  const age = ageString(animal?.birthdate ?? null);
  const sexLabel = animal?.sex
    ? `${animal.sex[0].toUpperCase()}${animal.sex.slice(1)}/${animal.fixed ? "Altered" : "Unaltered"}`
    : null;

  return (
    <main className="min-h-screen bg-white p-8 text-slate-900 print:p-4">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>{session!.facilityName}</span>
          <span className="flex items-center gap-3">
            Run Card {siblings.length > 0 ? `(1 of ${siblings.length + 1} in this booking)` : ""}
            <PrintButton />
          </span>
        </div>

        <div className="mt-3 flex gap-4">
          <div className="h-32 w-32 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
            {animal?.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={animal.photo_url} alt={animal.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-4xl">🐾</div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-bold leading-tight">
              {animal?.name ?? "Unknown"}
              {parent && <span className="font-normal text-slate-500"> {parent.last_name}</span>}
              {lodging && <span className="font-normal text-slate-400"> | {lodging.name}</span>}
            </h1>
            <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">
              <li>
                {animal?.breed ?? "—"}
                {age && `, ${age}`}
                {sexLabel && ` ${sexLabel}`}
              </li>
              {parent && (
                <li>
                  {parent.first_name} {parent.last_name}
                  {parent.phone && ` (${parent.phone})`}
                </li>
              )}
            </ul>
            <div className="mt-2">
              <div className="text-sm font-semibold text-slate-600">
                {type?.name ?? "Reservation"}
                {reservation.grooming_service_name ? ` — ${reservation.grooming_service_name}` : ""}
              </div>
              <div className="flex flex-wrap items-baseline gap-x-2 text-base leading-snug">
                <span className="whitespace-nowrap">{fmtDateTime(reservation.start_date, tz)}</span>
                <span className="text-slate-400">→</span>
                <span className="whitespace-nowrap font-bold">{fmtDateTime(reservation.end_date, tz)}</span>
              </div>
            </div>
          </div>

          {feedingQrSvg && (
            <div className="hidden w-[112px] shrink-0 flex-col items-center sm:flex print:flex">
              <div
                className="h-[104px] w-[104px] overflow-hidden rounded-md border border-slate-200 p-0.5"
                // QR is generated server-side from our own URL — no user input.
                dangerouslySetInnerHTML={{ __html: feedingQrSvg }}
              />
              <span className="mt-1 text-center text-[10px] leading-tight text-slate-500">
                Scan → {animal?.name}&apos;s feeding log
              </span>
            </div>
          )}
        </div>

        {/* whitespace-pre-line preserves the line breaks the pre-check-in form
            writes into these fields (AM/Lunch/PM feeding lines would otherwise
            collapse into one run-on sentence). break-words stops a long
            unbroken string (pasted URL, long drug name) from overflowing the
            max-w-2xl column and getting clipped at the paper edge on print. */}
        <div className="mt-4 border-t border-slate-300 pt-3 text-sm">
          {animal?.feeding_instructions && (
            <p className="whitespace-pre-line break-words text-amber-800">
              <span className="mr-1">🍽️</span>
              <span className="font-semibold">Feeding:</span> {stripHtml(animal.feeding_instructions)}
            </p>
          )}
          {animal && (
            // Live status from today's feeding log; unlogged meals print as
            // empty boxes staff can tick by hand on paper.
            <p className="mt-1 flex flex-wrap items-baseline gap-x-4 text-amber-800">
              <span className="font-semibold">Today&apos;s meals:</span>
              {mealSlots.map(({ label, meal }) => {
                const log = feedLogs.find((f) => f.meal_time === meal);
                const eaten = Boolean(log?.amount);
                return (
                  <span key={meal} className="whitespace-nowrap">
                    {eaten ? "☑" : "☐"} {label}
                    {log?.amount ? ` (${log.amount})` : ""}
                    {log?.medication_administered ? " 💊" : ""}
                  </span>
                );
              })}
            </p>
          )}
          {animal?.grooming_notes && (
            <p className="mt-1 whitespace-pre-line break-words text-blue-600">
              <span className="mr-1">✂️</span>
              <span className="font-semibold">Grooming:</span> {stripHtml(animal.grooming_notes)}
            </p>
          )}
          {animal?.behavioral_notes && (
            <p className="mt-1 whitespace-pre-line break-words text-green-700">
              <span className="mr-1">🐾</span>
              <span className="font-semibold">Groupable:</span> {stripHtml(animal.behavioral_notes)}
            </p>
          )}
          {animal?.alert_note && (
            <p className="mt-1 whitespace-pre-line break-words font-semibold text-slate-900">
              <span className="mr-1">❗</span>
              Read: {stripHtml(animal.alert_note)}
            </p>
          )}
          {(isPoopEater || isPeeDrinker) && (
            <p className="mt-1 flex gap-4">
              {isPoopEater && (
                <span className="text-amber-800">
                  <span className="mr-1">💩</span>
                  <span className="font-semibold">Poop Eater</span>
                </span>
              )}
              {isPeeDrinker && (
                <span className="text-purple-700">
                  <span className="mr-1">💧</span>
                  <span className="font-semibold">Pee Drinker</span>
                </span>
              )}
            </p>
          )}
          {!animal?.feeding_instructions && !animal?.grooming_notes && !animal?.behavioral_notes && !animal?.alert_note && !isPoopEater && !isPeeDrinker && (
            <p className="text-slate-400">No feeding, grooming, behavior, or alert notes on file.</p>
          )}
        </div>

        {animal?.medical_notes && (
          <div className="mt-3 whitespace-pre-line break-words border-t border-slate-200 pt-3 text-sm">
            <span className="font-semibold">Medical Notes / Allergies:</span> {stripHtml(animal.medical_notes)}
          </div>
        )}
        {animal?.medications && (
          <div className="mt-2 whitespace-pre-line break-words text-sm">
            <span className="font-semibold">Medications:</span> {stripHtml(animal.medications)}
          </div>
        )}
        {/* Boxed and photo-included so checkout staff can verify every item
            goes home — this is the "what did the dog come with" checklist. */}
        {(reservation.belongings || reservation.belongings_photo_url) && (
          <div className="mt-3 rounded-lg border-2 border-slate-300 p-3">
            <div className="text-sm font-bold uppercase tracking-wide">🧳 Came With — send home at checkout</div>
            <div className="mt-1.5 flex gap-3">
              {reservation.belongings_photo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={reservation.belongings_photo_url}
                  alt="Belongings"
                  className="h-24 w-24 shrink-0 rounded-md border border-slate-200 object-cover"
                />
              )}
              <div className="min-w-0 whitespace-pre-line break-words text-sm">
                {stripHtml(reservation.belongings) ?? "See photo"}
              </div>
            </div>
          </div>
        )}
        {reservation.notes && (
          <div className="mt-2 whitespace-pre-line break-words text-sm">
            <span className="font-semibold">Reservation Notes:</span> {stripHtml(reservation.notes)}
          </div>
        )}

        {siblings.length > 0 && (
          <div className="mt-3 border-t border-slate-200 pt-3 text-sm">
            <span className="font-semibold">🏠 Booked with (same household):</span>{" "}
            {siblings.map((s) => s.animalName).join(", ")}
          </div>
        )}

        <div className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-400">
          Emergency Contact: {parent?.emergency_contact_name ?? "—"}
          {parent?.emergency_contact_phone && ` · ${parent.emergency_contact_phone}`}
          {animal?.vet_name && (
            <>
              {" "}· Vet: {animal.vet_name}
              {animal.vet_phone && ` (${animal.vet_phone})`}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
