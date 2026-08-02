import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import PageQuickActions from "@/components/PageQuickActions";
import AnimalForm from "@/components/AnimalForm";
import AnimalPhotoUpload from "@/components/AnimalPhotoUpload";
import { updateAnimal } from "../actions";
import { overallVaccineStatus, vaccineShield, vaccineStatus, VACCINE_LABELS, type VaccineExpirations } from "@/lib/vaccines";
import { getProfileTagCatalog, getProfileTagsFor } from "@/lib/profileTags";
import ProfileTagEditor from "@/components/ProfileTagEditor";
import ProfileTagBadges from "@/components/ProfileTagBadges";
import { getAnimalFieldHistory, ANIMAL_HISTORY_FIELD_LABELS, type AnimalHistoryField } from "@/lib/animalFieldHistory";
import { getGroomingRecordsForAnimal } from "@/app/grooming-notes/actions";

export default async function AnimalDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;
  const { error } = await searchParams;

  const supabase = createClient();
  const { data: animal } = await supabase
    .from("animals")
    .select("*, parents ( id, first_name, last_name )")
    .eq("id", id)
    .maybeSingle();
  if (!animal) notFound();

  const parent = animal.parents as unknown as { id: string; first_name: string; last_name: string } | null;
  const updateWithId = updateAnimal.bind(null, id);

  const vaxRecord: VaccineExpirations = {
    rabies_expiration: animal.rabies_expiration,
    distemper_expiration: animal.distemper_expiration,
    bordetella_expiration: animal.bordetella_expiration,
  };
  const overallStatus = overallVaccineStatus(vaxRecord);
  const overallShield = vaccineShield(overallStatus);

  const [tagCatalog, assignedTags, fieldHistory, groomingRecords] = await Promise.all([
    getProfileTagCatalog("animal"),
    getProfileTagsFor("animal", id),
    getAnimalFieldHistory(id),
    getGroomingRecordsForAnimal(id),
  ]);

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <a href="/animals" className="text-sm text-slate-400 underline dark:text-slate-500">
          ← Animals
        </a>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{animal.name}</h1>
          <ProfileTagBadges tags={assignedTags} />
          {overallStatus !== "unknown" && (
            <span
              title={overallShield.label}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${overallShield.className} ${
                overallStatus === "expired"
                  ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
                  : overallStatus === "expiring_soon"
                    ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"
                    : "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30"
              }`}
            >
              🛡️ {overallShield.label}
            </span>
          )}
          <a href={`/animals/${id}/reservations`} className="text-sm text-indigo-600 underline dark:text-indigo-400">
            📋 Visit History
          </a>
          <a href={`/animals/${id}/invoices`} className="text-sm text-indigo-600 underline dark:text-indigo-400">
            🧾 Receipts
          </a>
          <a
            href={`/reservations/new?animal_id=${id}`}
            className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium hover:border-slate-500 dark:border-slate-700 dark:hover:border-slate-500"
          >
            📅 New Booking
          </a>
        </div>
        {parent && (
          <p className="text-sm text-slate-400 dark:text-slate-500">
            Parent:{" "}
            <a href={`/parents/${parent.id}`} className="underline">
              {parent.first_name} {parent.last_name}
            </a>
          </p>
        )}
        {overallStatus !== "current" && overallStatus !== "unknown" && (
          <div className="mt-2 flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
            {(Object.keys(VACCINE_LABELS) as (keyof VaccineExpirations)[])
              .filter((k) => vaccineStatus(vaxRecord[k]) === "expired" || vaccineStatus(vaxRecord[k]) === "expiring_soon")
              .map((k) => {
                const s = vaccineStatus(vaxRecord[k]);
                const shield = vaccineShield(s);
                return (
                  <span key={k} className={shield.className}>
                    {shield.icon} {VACCINE_LABELS[k]}: {s === "expired" ? "expired" : "expiring soon"}
                    {vaxRecord[k] ? ` (${vaxRecord[k]})` : ""}
                  </span>
                );
              })}
          </div>
        )}

        <div className="mt-3">
          <PageQuickActions session={session!} />
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300">Tags</h2>
          <div className="mt-2">
            <ProfileTagEditor
              targetType="animal"
              targetId={id}
              catalog={tagCatalog}
              assigned={assignedTags}
              staffName={session!.staffName}
            />
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <AnimalPhotoUpload animalId={id} currentUrl={animal.photo_url ?? null} />
        </div>

        {animal.grooming_photo_url && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300">✂️ Grooming Style Photo</h2>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={animal.grooming_photo_url}
              alt="Grooming style reference"
              className="mt-2 h-32 w-32 rounded-lg border border-slate-200 object-cover dark:border-slate-700"
            />
          </div>
        )}

        {groomingRecords.length > 0 && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300">✂️ Grooming History</h2>
            <div className="mt-2 flex flex-col gap-2">
              {groomingRecords.map((g) => (
                <a
                  key={g.id}
                  href={`/reservations/${g.reservation_id}`}
                  className="flex gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm hover:border-slate-400 dark:border-slate-800 dark:hover:border-slate-600"
                >
                  {g.photo_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={g.photo_url}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded-md border border-slate-200 object-cover dark:border-slate-700"
                    />
                  )}
                  <div>
                    {g.notes && <div className="text-slate-600 dark:text-slate-300">{g.notes}</div>}
                    <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                      {g.groomer_name ?? "Unknown"} · {new Date(g.created_at).toLocaleString()}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
          <AnimalForm
            action={updateWithId}
            defaults={animal}
            submitLabel="Save Changes"
            error={error}
            showActiveToggle
          />
        </div>

        {fieldHistory.length > 0 && (
          <details className="group mt-4 rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <summary className="flex cursor-pointer select-none list-none items-center justify-between px-4 py-3">
              <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300">🕓 Notes History ({fieldHistory.length})</h2>
              <span className="text-slate-400 transition-transform group-open:rotate-180 dark:text-slate-500">▾</span>
            </summary>
            <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 dark:border-slate-800">
              {fieldHistory.map((h) => (
                <div key={h.id} className="rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                  <div className="font-medium">{ANIMAL_HISTORY_FIELD_LABELS[h.field as AnimalHistoryField] ?? h.field}</div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    <span className="text-slate-400 line-through dark:text-slate-500">{h.old_value || "(empty)"}</span>
                    {" → "}
                    <span>{h.new_value || "(empty)"}</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                    {h.changed_by ?? "Unknown"} · {new Date(h.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </main>
  );
}
