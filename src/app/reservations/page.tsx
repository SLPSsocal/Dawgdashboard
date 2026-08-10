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

let precheckinByReservation = new Map<string, string>();

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
    phone: r.animals?.parents?.phone ?? null,
    precheckinStatus: precheckinByReservation.get(r.id) ?? null,
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

  // Latest pre-check-in status per reservation ("submitted" wins) so the
  // board can show a done-marker instead of another Send button.
  const allIds = [...rows.map((r) => r.id), ...(((checkedOutData as unknown as Row[]) ?? []).map((r) => r.id))];
  precheckinByReservation = new Map();
  if (allIds.length > 0) {
    const { data: pcRows } = await supabase
      .from("precheckin_requests")
      .select("reservation_id, status")
      .in("reservation_id", allIds);
    for (const pc of pcRows ?? []) {
      const cur = precheckinByReservation.get(pc.reservation_id);
      if (cur !== "submitted") precheckinByReservation.set(pc.reservation_id, pc.status);
    }
  }

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

  // "Overnight: 2" on its own doesn't tell you which nights are being billed.
  // List each staying dog with the night it's covering, so the count can be
  // reconciled against an invoice instead of taken on faith.
  const overnightRows = boardRows
    .filter((r) => r.status === "checked_in" && r.endDate.slice(0, 10) > todayStr)
    .map((r) => ({
      animalName: r.animalName,
      // The night worked tonight runs today -> tomorrow.
      nightOf: todayStr,
      departs: r.endDate,
    }));

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

      {/* Summary stacks vertically and compactly — KPI strip, service mix,
          then straight into search + tables. The old two-column layout left a
          tall empty gap under the short stat row beside the breakdown card. */}
      <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-[19px] font-semibold leading-tight">Check-in Board</h1>
          <span className="text-[13px] text-slate-500 dark:text-slate-400">
            {new Date().toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}
          </span>
        </div>
        {error && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">Couldn&apos;t load reservations: {error.message}</p>
        )}

        <div className="mt-3 flex flex-col gap-2">
          <DailySummaryBar stats={stats} />
          <ServiceBreakdownTable breakdown={breakdown} />

          {overnightRows.length > 0 && (
            <details className="group rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <summary className="flex cursor-pointer select-none list-none items-center justify-between px-4 py-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  Overnight tonight — which nights are billing
                </span>
                <span className="text-[12px] text-slate-400 transition-transform group-open:rotate-180 dark:text-slate-500">
                  ▾
                </span>
              </summary>
              <div className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
                {overnightRows.map((o, i) => (
                  <div key={i} className="flex flex-wrap items-baseline gap-x-3 px-4 py-1.5 text-[13px]">
                    <span className="font-medium">{o.animalName}</span>
                    <span className="text-slate-500 dark:text-slate-400">
                      night of{" "}
                      {new Date(`${o.nightOf}T12:00:00`).toLocaleDateString([], {
                        month: "short",
                        day: "numeric",
                      })}
                      {" → "}
                      {new Date(
                        new Date(`${o.nightOf}T12:00:00`).getTime() + 86400000
                      ).toLocaleDateString([], { month: "short", day: "numeric" })}
                    </span>
                    <span className="ml-auto text-slate-400 dark:text-slate-500">
                      departs{" "}
                      {new Date(o.departs).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>

        <div className="mt-3">
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
              facilityId={session!.facilityId}
              animalTags={animalTagsObj}
              parentTags={parentTagsObj}
            />
          )}
        </div>
      </div>
    </main>
  );
}
