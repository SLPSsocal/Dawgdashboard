import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import PageQuickActions from "@/components/PageQuickActions";
import AnimalPicker, { type AnimalOption } from "@/components/AnimalPicker";
import { createReservation } from "../actions";

export default async function NewReservationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { error } = await searchParams;

  const supabase = createClient();
  const [{ data: animals }, { data: types }, { data: areas }] = await Promise.all([
    // Animals are shared across facilities, so any dog can be booked here.
    supabase
      .from("animals")
      .select("id, name, breed, parents ( first_name, last_name )")
      .eq("active", true)
      .order("name"),
    supabase.from("reservation_types").select("id, name").eq("facility_id", session!.facilityId).eq("active", true).order("name"),
    supabase.from("lodging_areas").select("id, name").eq("facility_id", session!.facilityId).order("name"),
  ]);

  type AnimalRow = { id: string; name: string; breed: string | null; parents: { first_name: string; last_name: string } | null };
  const animalOptions: AnimalOption[] = ((animals as unknown as AnimalRow[]) ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    breed: a.breed,
    parentName: a.parents ? `${a.parents.first_name} ${a.parents.last_name}` : null,
  }));

  const createWithFacility = createReservation.bind(null, session!.facilityId);
  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <a href="/reservations" className="text-sm text-slate-400 underline dark:text-slate-500">
          ← Check-in Board
        </a>
        <h1 className="mt-2 text-xl font-semibold">New Booking</h1>
        <p className="text-sm text-slate-400 dark:text-slate-500">
          Creates a booked reservation at {session!.facilityName} — it shows up in Quick Check-in right after you
          create it.
        </p>

        <div className="mt-3">
          <PageQuickActions session={session!} />
        </div>

        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
          {error && (
            <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
              {error === "missing" ? "A dog and start date are required." : error}
            </div>
          )}

          <form action={createWithFacility} className="flex flex-col gap-4">
            <AnimalPicker animals={animalOptions} />
            {animalOptions.length === 0 && (
              <p className="text-xs text-slate-400 dark:text-slate-500">
                No animals yet —{" "}
                <a href="/animals/new" className="underline">
                  add one first
                </a>
                .
              </p>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Reservation Type</span>
                <select
                  name="reservation_type_id"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="">—</option>
                  {(types ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Lodging Area</span>
                <select
                  name="lodging_area_id"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="">— Unassigned —</option>
                  {(areas ?? []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Start Date<span className="text-red-500"> *</span>
                </span>
                <input
                  type="date"
                  name="start_date"
                  defaultValue={todayStr}
                  required
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">End Date</span>
                <input
                  type="date"
                  name="end_date"
                  defaultValue={todayStr}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
            </div>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Belongings</span>
              <input
                name="belongings"
                placeholder="Leash, bed, food…"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Notes</span>
              <textarea
                name="notes"
                rows={2}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>

            <button
              type="submit"
              className="mt-2 w-full rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 sm:w-fit dark:bg-slate-100 dark:text-slate-900"
            >
              Create Booking
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
