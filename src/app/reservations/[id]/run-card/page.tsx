import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "@/components/PrintButton";

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

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString([], {
    weekday: "short",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
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
      `*, animals ( name, breed, size, sex, fixed, birthdate, photo_url,
         medical_notes, medications, behavioral_notes, grooming_notes, alert_note, poop_eater, pee_drinker,
         parents ( first_name, last_name, phone, emergency_contact_name, emergency_contact_phone ) ),
       lodging_areas ( name ), reservation_types ( name )`
    )
    .eq("id", id)
    .maybeSingle();
  if (!reservation) notFound();

  const animal = reservation.animals as unknown as {
    name: string;
    breed: string | null;
    size: string | null;
    sex: string | null;
    fixed: boolean | null;
    birthdate: string | null;
    photo_url: string | null;
    medical_notes: string | null;
    medications: string | null;
    behavioral_notes: string | null;
    grooming_notes: string | null;
    alert_note: string | null;
    poop_eater: boolean | null;
    pee_drinker: boolean | null;
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
            Run Card 1 of 1
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
            <p className="mt-2 text-base">
              {type?.name ?? "Reservation"}: {fmtDateTime(reservation.start_date)} -{" "}
              <span className="font-bold">{fmtDateTime(reservation.end_date)}</span>
            </p>
          </div>
        </div>

        <div className="mt-4 border-t border-slate-300 pt-3 text-sm">
          {animal?.grooming_notes && (
            <p className="text-blue-600">
              <span className="mr-1">✂️</span>
              <span className="font-semibold">Grooming:</span> {animal.grooming_notes}
            </p>
          )}
          {animal?.behavioral_notes && (
            <p className="mt-1 text-green-700">
              <span className="mr-1">🐾</span>
              <span className="font-semibold">Groupable:</span> {animal.behavioral_notes}
            </p>
          )}
          {animal?.alert_note && (
            <p className="mt-1 font-semibold text-slate-900">
              <span className="mr-1">❗</span>
              Read: {animal.alert_note}
            </p>
          )}
          {(animal?.poop_eater || animal?.pee_drinker) && (
            <p className="mt-1 flex gap-4">
              {animal?.poop_eater && (
                <span className="text-amber-800">
                  <span className="mr-1">💩</span>
                  <span className="font-semibold">Poop Eater</span>
                </span>
              )}
              {animal?.pee_drinker && (
                <span className="text-purple-700">
                  <span className="mr-1">💧</span>
                  <span className="font-semibold">Pee Drinker</span>
                </span>
              )}
            </p>
          )}
          {!animal?.grooming_notes && !animal?.behavioral_notes && !animal?.alert_note && !animal?.poop_eater && !animal?.pee_drinker && (
            <p className="text-slate-400">No grooming, behavior, or alert notes on file.</p>
          )}
        </div>

        {animal?.medical_notes && (
          <div className="mt-3 border-t border-slate-200 pt-3 text-sm">
            <span className="font-semibold">Medical Notes / Allergies:</span> {animal.medical_notes}
          </div>
        )}
        {animal?.medications && (
          <div className="mt-2 text-sm">
            <span className="font-semibold">Medications:</span> {animal.medications}
          </div>
        )}
        {reservation.belongings && (
          <div className="mt-2 text-sm">
            <span className="font-semibold">Belongings:</span> {reservation.belongings}
          </div>
        )}
        {reservation.notes && (
          <div className="mt-2 text-sm">
            <span className="font-semibold">Reservation Notes:</span> {reservation.notes}
          </div>
        )}

        <div className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-400">
          Emergency Contact: {parent?.emergency_contact_name ?? "—"}
          {parent?.emergency_contact_phone && ` · ${parent.emergency_contact_phone}`}
        </div>
      </div>
    </main>
  );
}
