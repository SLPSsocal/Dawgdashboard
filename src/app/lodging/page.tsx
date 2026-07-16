import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import LodgingBoard, { type LodgingArea, type ReservationCard } from "@/components/LodgingBoard";
import { createLodgingArea } from "./actions";

type ReservationRow = {
  id: string;
  status: string;
  lodging_area_id: string | null;
  animals: { name: string; breed: string | null } | null;
  reservation_types: { name: string; requires_lodging: boolean | null } | null;
};

export default async function LodgingPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Facility-scoped table — only this facility's kennels/suites/runs.
  const supabase = createClient();
  const { data: areas } = await supabase
    .from("lodging_areas")
    .select("id, name, area_type, capacity, active")
    .eq("facility_id", session!.facilityId)
    .eq("active", true)
    .order("name");

  const { data: reservationData } = await supabase
    .from("reservations")
    .select(
      `id, status, lodging_area_id,
       animals ( name, breed ),
       reservation_types ( name, requires_lodging )`
    )
    .eq("facility_id", session!.facilityId)
    .in("status", ["booked", "checked_in"])
    .order("start_date", { ascending: true });

  const rows = (reservationData as unknown as ReservationRow[]) ?? [];
  const reservations: ReservationCard[] = rows
    .filter((r) => r.reservation_types?.requires_lodging !== false)
    .map((r) => ({
      id: r.id,
      animalName: r.animals?.name ?? "Unknown",
      breed: r.animals?.breed ?? null,
      status: r.status,
      typeName: r.reservation_types?.name ?? null,
      lodgingAreaId: r.lodging_area_id,
    }));

  const boardAreas: LodgingArea[] = (areas ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    area_type: a.area_type,
    capacity: a.capacity,
  }));

  return (
    <main className="min-h-screen bg-neutral-100 dark:bg-neutral-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Lodging — {session!.facilityName}</h1>
        </div>

        <details className="group mt-4 rounded-xl border border-neutral-300 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
          <summary className="flex cursor-pointer select-none list-none items-center justify-between px-4 py-3">
            <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
              + Add Lodging Area
            </h2>
            <span className="text-neutral-400 transition-transform group-open:rotate-180 dark:text-neutral-500">
              ▾
            </span>
          </summary>
          <form
            action={createLodgingArea}
            className="flex flex-col gap-3 border-t border-neutral-100 p-4 sm:flex-row sm:items-end dark:border-neutral-800"
          >
            <input type="hidden" name="facility_id" value={session!.facilityId} />
            <label className="flex-1">
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Name</span>
              <input
                name="name"
                required
                placeholder="Suite 8"
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              />
            </label>
            <label>
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Type</span>
              <select
                name="area_type"
                defaultValue="kennel"
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              >
                <option value="kennel">Kennel</option>
                <option value="suite">Suite</option>
                <option value="run">Run</option>
                <option value="daycare_pen">Daycare Pen</option>
              </select>
            </label>
            <label>
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Capacity</span>
              <input
                name="capacity"
                type="number"
                min={1}
                defaultValue={1}
                className="mt-1 w-24 rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              />
            </label>
            <button
              type="submit"
              className="w-full rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white sm:w-fit dark:bg-neutral-100 dark:text-neutral-900"
            >
              Add
            </button>
          </form>
        </details>

        {(!areas || areas.length === 0) ? (
          <p className="mt-8 text-sm text-neutral-400 dark:text-neutral-500">
            No lodging areas set up yet for {session!.facilityName}. Add one above to get started.
          </p>
        ) : (
          <LodgingBoard areas={boardAreas} initialReservations={reservations} />
        )}
      </div>
    </main>
  );
}
