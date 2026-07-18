import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import { updateReservation } from "../actions";

function toLocalInput(iso: string) {
  // yyyy-MM-ddThh:mm for <input type="datetime-local">
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function ReservationDetailPage({
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
    .select(
      `*, animals ( id, name, breed, parent_id, parents ( id, first_name, last_name ) )`
    )
    .eq("id", id)
    .maybeSingle();
  if (!reservation) notFound();

  const animal = reservation.animals as unknown as {
    id: string;
    name: string;
    breed: string | null;
    parent_id: string;
    parents: { id: string; first_name: string; last_name: string } | null;
  } | null;

  const [{ data: types }, { data: areas }, { data: incidents }, { data: reportCards }] = await Promise.all([
    supabase
      .from("reservation_types")
      .select("id, name")
      .eq("facility_id", session!.facilityId)
      .order("name"),
    supabase
      .from("lodging_areas")
      .select("id, name")
      .eq("facility_id", session!.facilityId)
      .eq("active", true)
      .order("name"),
    supabase
      .from("incidents")
      .select("id, description, severity, reported_by, created_at")
      .eq("reservation_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("report_cards")
      .select("id, rating, activities, notes, created_at")
      .eq("reservation_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const updateWithId = updateReservation.bind(null, id);

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        <a href="/reservations" className="text-sm text-slate-400 underline dark:text-slate-500">
          ← Check-in Board
        </a>
        <h1 className="mt-2 text-xl font-semibold">{animal?.name ?? "Unknown"}&apos;s Reservation</h1>
        {animal?.parents && (
          <p className="text-sm text-slate-400 dark:text-slate-500">
            Parent:{" "}
            <a href={`/parents/${animal.parents.id}`} className="underline">
              {animal.parents.first_name} {animal.parents.last_name}
            </a>
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={`/reservations/${id}/run-card`}
            target="_blank"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:border-slate-500 dark:border-slate-700 dark:hover:border-slate-500"
          >
            🖨️ Print Run Card
          </a>
          {animal && (
            <a
              href={`/reservations/${id}/incidents/new`}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:border-slate-500 dark:border-slate-700 dark:hover:border-slate-500"
            >
              ⚠️ New Incident
            </a>
          )}
          {animal && (
            <a
              href={`/reservations/${id}/report-card/new`}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:border-slate-500 dark:border-slate-700 dark:hover:border-slate-500"
            >
              ❤️ New Report Card
            </a>
          )}
        </div>

        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
          {error && (
            <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
              {error}
            </div>
          )}
          <form action={updateWithId} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Arrival</span>
                <input
                  name="start_date"
                  type="datetime-local"
                  defaultValue={toLocalInput(reservation.start_date)}
                  required
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Departure</span>
                <input
                  name="end_date"
                  type="datetime-local"
                  defaultValue={toLocalInput(reservation.end_date)}
                  required
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
            </div>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Reservation Type</span>
              <select
                name="reservation_type_id"
                defaultValue={reservation.reservation_type_id ?? ""}
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
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Lodging</span>
              <select
                name="lodging_area_id"
                defaultValue={reservation.lodging_area_id ?? ""}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="">Unassigned</option>
                {(areas ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Belongings</span>
              <input
                name="belongings"
                defaultValue={reservation.belongings ?? ""}
                placeholder="Leash, bed, favorite toy…"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Notes</span>
              <textarea
                name="notes"
                defaultValue={reservation.notes ?? ""}
                rows={3}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>

            <button
              type="submit"
              className="mt-2 w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 px-5 py-2.5 text-sm font-medium text-white sm:w-fit dark:bg-slate-100 dark:text-slate-900"
            >
              Save Changes
            </button>
          </form>
        </div>

        {(incidents?.length ?? 0) > 0 && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">⚠️ Incidents</h2>
            <div className="mt-2 flex flex-col gap-2">
              {incidents!.map((inc) => (
                <div key={inc.id} className="rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                  <div className="font-medium capitalize">{inc.severity}</div>
                  <div className="text-slate-500 dark:text-slate-400">{inc.description}</div>
                  <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                    {inc.reported_by ?? "Unknown"} · {new Date(inc.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(reportCards?.length ?? 0) > 0 && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">❤️ Report Cards</h2>
            <div className="mt-2 flex flex-col gap-2">
              {reportCards!.map((rc) => (
                <div key={rc.id} className="rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                  <div className="font-medium capitalize">{rc.rating ?? "—"}</div>
                  {rc.activities && rc.activities.length > 0 && (
                    <div className="text-slate-500 dark:text-slate-400">{rc.activities.join(", ")}</div>
                  )}
                  {rc.notes && <div className="text-slate-500 dark:text-slate-400">{rc.notes}</div>}
                  <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                    {new Date(rc.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
