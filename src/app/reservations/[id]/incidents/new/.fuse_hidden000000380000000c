import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import { createIncident } from "../../../actions";

export default async function NewIncidentPage({
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
  const { data: reservation } = await supabase
    .from("reservations")
    .select("id, animal_id, animals ( name )")
    .eq("id", id)
    .maybeSingle();
  if (!reservation) notFound();

  const animal = reservation.animals as unknown as { name: string } | null;
  const submitWithId = createIncident.bind(null, id);

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-lg px-4 py-6 sm:px-6 sm:py-8">
        <a href={`/reservations/${id}`} className="text-sm text-neutral-400 underline dark:text-neutral-500">
          ← Back
        </a>
        <h1 className="mt-2 text-xl font-semibold">New Incident — {animal?.name ?? "Animal"}</h1>

        <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-4 sm:p-6 dark:border-neutral-800 dark:bg-neutral-900">
          {error && (
            <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
              {error === "missing" ? "Description is required." : error}
            </div>
          )}
          <form action={submitWithId} className="flex flex-col gap-4">
            <input type="hidden" name="animal_id" value={reservation.animal_id} />
            <input type="hidden" name="facility_id" value={session!.facilityId} />

            <label className="block">
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Severity</span>
              <select
                name="severity"
                defaultValue="minor"
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              >
                <option value="minor">Minor</option>
                <option value="moderate">Moderate</option>
                <option value="severe">Severe</option>
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                What happened? <span className="text-red-500">*</span>
              </span>
              <textarea
                name="description"
                required
                rows={4}
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Reported By</span>
              <input
                name="reported_by"
                defaultValue={session!.staffName}
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              />
            </label>

            <button
              type="submit"
              className="mt-2 w-full rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white sm:w-fit dark:bg-neutral-100 dark:text-neutral-900"
            >
              Log Incident
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
