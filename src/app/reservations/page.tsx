import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import CheckInBoard, { type CheckInRow } from "@/components/CheckInBoard";
import DailySummaryBar from "@/components/DailySummaryBar";

type Row = {
  id: string;
  status: string;
  start_date: string;
  end_date: string;
  animals: {
    id: string;
    name: string;
    breed: string | null;
    photo_url: string | null;
    parents: { id: string; first_name: string; last_name: string; phone: string | null } | null;
  } | null;
  lodging_areas: { name: string } | null;
  reservation_types: { name: string } | null;
};

export default async function ReservationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Facility isolation happens right here: every query in this app is filtered
  // by session.facilityId, which came from the PIN login for this facility only.
  const supabase = createClient();
  const { data, error } = await supabase
    .from("reservations")
    .select(
      `id, status, start_date, end_date,
       animals ( id, name, breed, photo_url, parents ( id, first_name, last_name, phone ) ),
       lodging_areas ( name ),
       reservation_types ( name )`
    )
    .eq("facility_id", session!.facilityId)
    .in("status", ["booked", "checked_in"])
    .order("start_date", { ascending: true });

  const todayStr = new Date().toISOString().slice(0, 10);
  const { count: checkedOutTodayCount } = await supabase
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .eq("facility_id", session!.facilityId)
    .eq("status", "checked_out")
    .gte("checked_out_at", `${todayStr}T00:00:00`)
    .lte("checked_out_at", `${todayStr}T23:59:59`);

  const rows = (data as unknown as Row[]) ?? [];
  const boardRows: CheckInRow[] = rows.map((r) => ({
    id: r.id,
    status: r.status,
    animalId: r.animals?.id ?? "",
    animalName: r.animals?.name ?? "Unknown",
    breed: r.animals?.breed ?? null,
    parentId: r.animals?.parents?.id ?? null,
    parentName: r.animals?.parents ? `${r.animals.parents.first_name} ${r.animals.parents.last_name}` : null,
    typeName: r.reservation_types?.name ?? null,
    lodgingName: r.lodging_areas?.name ?? null,
    startDate: r.start_date,
    endDate: r.end_date,
  }));

  const expectedTodayCount = boardRows.filter((r) => r.status === "booked" && r.startDate.slice(0, 10) === todayStr).length;
  const checkedInCount = boardRows.filter((r) => r.status === "checked_in").length;
  const overnightCount = boardRows.filter((r) => r.status === "checked_in" && r.endDate.slice(0, 10) > todayStr).length;

  const stats = [
    { label: "Expected Today", value: expectedTodayCount },
    { label: "Checked In", value: checkedInCount, accent: "border-l-4 border-l-green-500" },
    { label: "Checked Out Today", value: checkedOutTodayCount ?? 0 },
    { label: "Overnight", value: overnightCount },
    { label: "Total Today", value: expectedTodayCount + checkedInCount + (checkedOutTodayCount ?? 0) },
  ];

  return (
    <main className="min-h-screen bg-neutral-100 dark:bg-neutral-950">
      <FacilityHeader session={session!} />

      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="text-xl font-semibold">Check-in Board</h1>
        {error && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">Couldn&apos;t load reservations: {error.message}</p>
        )}

        <DailySummaryBar stats={stats} />

        {rows.length === 0 && !error ? (
          <p className="mt-8 text-sm text-neutral-400 dark:text-neutral-500">
            No reservations yet at {session!.facilityName}. Once reservation types and lodging
            areas are set up, bookings will show here.
          </p>
        ) : (
          <CheckInBoard rows={boardRows} />
        )}
      </div>
    </main>
  );
}
