import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import PageQuickActions from "@/components/PageQuickActions";
import CheckInBoard, { type CheckInRow } from "@/components/CheckInBoard";
import DailySummaryBar from "@/components/DailySummaryBar";
import ServiceBreakdownTable from "@/components/ServiceBreakdownTable";
import { getProfileTagsBulk } from "@/lib/profileTags";

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
    alert_note: string | null;
    parents: { id: string; first_name: string; last_name: string; phone: string | null } | null;
  } | null;
  lodging_areas: { name: string } | null;
  reservation_types: { name: string } | null;
};

function toRow(r: Row): CheckInRow {
  return {
    id: r.id,
    status: r.status,
    animalId: r.animals?.id ?? "",
    animalName: r.animals?.name ?? "Unknown",
    alertNote: r.animals?.alert_note ?? null,
    breed: r.animals?.breed ?? null,
    parentId: r.animals?.parents?.id ?? null,
    parentName: r.animals?.parents ? `${r.animals.parents.first_name} ${r.animals.parents.last_name}` : null,
    typeName: r.reservation_types?.name ?? null,
    lodgingName: r.lodging_areas?.name ?? null,
    startDate: r.start_date,
    endDate: r.end_date,
  };
}

export default async function ReservationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Facility isolation happens right here: every query in this app is filtered
  // by session.facilityId, which came from the PIN login for this facility only.
  const supabase = createClient();
  const selectCols = `id, status, start_date, end_date,
       animals ( id, name, breed, photo_url, alert_note, parents ( id, first_name, last_name, phone ) ),
       lodging_areas ( name ),
       reservation_types ( name )`;

  const todayStr = new Date().toISOString().slice(0, 10);

  const [{ data, error }, { data: checkedOutData }, { data: allTypes }] = await Promise.all([
    supabase
      .from("reservations")
      .select(selectCols)
      .eq("facility_id", session!.facilityId)
      .in("status", ["booked", "checked_in"])
      .order("start_date", { ascending: true }),
    // Fetched in full (not just a count) so "Undo Check Out" is reachable
    // right here if staff need to reverse an accidental checkout.
    supabase
      .from("reservations")
      .select(selectCols)
      .eq("facility_id", session!.facilityId)
      .eq("status", "checked_out")
      .gte("checked_out_at", `${todayStr}T00:00:00`)
      .lte("checked_out_at", `${todayStr}T23:59:59`)
      .order("checked_out_at", { ascending: false }),
    supabase
      .from("reservation_types")
      .select("name")
      .eq("facility_id", session!.facilityId)
      .eq("active", true)
      .order("name"),
  ]);

  const rows = (data as unknown as Row[]) ?? [];
  const boardRows: CheckInRow[] = rows.map(toRow);
  const checkedOutRows: CheckInRow[] = ((checkedOutData as unknown as Row[]) ?? []).map(toRow);

  const allRows = [...boardRows, ...checkedOutRows];
  const [animalTags, parentTags] = await Promise.all([
    getProfileTagsBulk("animal", allRows.map((r) => r.animalId)),
    getProfileTagsBulk("parent", allRows.map((r) => r.parentId ?? "").filter(Boolean)),
  ]);
  const animalTagsObj = Object.fromEntries(animalTags);
  const parentTagsObj = Object.fromEntries(parentTags);

  const expectedTodayCount = boardRows.filter((r) => r.status === "booked" && r.startDate.slice(0, 10) === todayStr).length;
  const checkedInCount = boardRows.filter((r) => r.status === "checked_in").length;
  const overnightCount = boardRows.filter((r) => r.status === "checked_in" && r.endDate.slice(0, 10) > todayStr).length;
  const checkedOutTodayCount = checkedOutRows.length;

  const stats = [
    { label: "Expected Today", value: expectedTodayCount },
    { label: "Checked In", value: checkedInCount, accent: "border-l-4 border-l-green-500" },
    { label: "Checked Out Today", value: checkedOutTodayCount },
    { label: "Overnight", value: overnightCount },
    { label: "Total Today", value: expectedTodayCount + checkedInCount + checkedOutTodayCount },
  ];

  // Breakdown by service type — every active reservation type shows, even at
  // zero, so staff can see what's not moving today (matches Gingr's dash).
  const typeCounts = new Map<string, number>();
  for (const t of allTypes ?? []) typeCounts.set(t.name, 0);
  for (const r of boardRows) {
    if (r.typeName) typeCounts.set(r.typeName, (typeCounts.get(r.typeName) ?? 0) + 1);
  }
  const breakdown = Array.from(typeCounts.entries()).map(([name, count]) => ({ name, count }));

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-950">
      <FacilityHeader session={session!} />

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="text-xl font-semibold">Check-in Board</h1>
        {error && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">Couldn&apos;t load reservations: {error.message}</p>
        )}

        <div className="mt-4 lg:flex lg:items-start lg:gap-4">
          <div className="lg:flex-1">
            <DailySummaryBar stats={stats} />
            {/* Lives in the same column as the stat cards (not full-width
                below both columns) specifically so it fills the empty space
                left under the short stat-card row instead of getting pushed
                all the way down past the taller Breakdown card next to it. */}
            <div className="mt-4">
              <PageQuickActions session={session!} />
            </div>
          </div>
          <div className="lg:w-80 lg:shrink-0">
            <ServiceBreakdownTable breakdown={breakdown} />
          </div>
        </div>

        <div className="mt-4">
          {rows.length === 0 && !error ? (
            <p className="text-sm text-slate-400 dark:text-slate-500">
              No reservations yet at {session!.facilityName}. Once reservation types and lodging
              areas are set up, bookings will show here.
            </p>
          ) : (
            <CheckInBoard
              rows={boardRows}
              checkedOutToday={checkedOutRows}
              staffName={session!.staffName}
              animalTags={animalTagsObj}
              parentTags={parentTagsObj}
            />
          )}
        </div>
      </div>
    </main>
  );
}
