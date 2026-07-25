import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import PageQuickActions from "@/components/PageQuickActions";
import AnimalForm from "@/components/AnimalForm";
import AnimalPhotoUpload from "@/components/AnimalPhotoUpload";
import { updateAnimal } from "../actions";
import { overallVaccineStatus, vaccineShield, vaccineStatus, VACCINE_LABELS, type VaccineExpirations } from "@/lib/vaccines";

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

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <a href="/animals" className="text-sm text-slate-400 underline dark:text-slate-500">
          ← Animals
        </a>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{animal.name}</h1>
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
          <AnimalPhotoUpload animalId={id} currentUrl={animal.photo_url ?? null} />
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
          <AnimalForm
            action={updateWithId}
            defaults={animal}
            submitLabel="Save Changes"
            error={error}
            showActiveToggle
          />
        </div>
      </div>
    </main>
  );
}
