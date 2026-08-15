import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import PageQuickActions from "@/components/PageQuickActions";
import CheckInBoard, { type CheckInRow } from "@/components/CheckInBoard";
import DailySummaryBar from "@/components/DailySummaryBar";
import ServiceBreakdownTable from "@/components/ServiceBreakdownTable";
import { getProfileTagsBulk } from "@/lib/profileTags";
import { todayLocal, ymdLocal } from "@/lib/dates";
import { getGingrDay, type GingrCheckin } from "@/lib/gingr";
import Link from "next/link";

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

  // Facility-local day, NOT UTC — 5pm PT is already "tomorrow" in UTC, which
  // misclassified evening daycare departures as overnight stays.
  const todayStr = todayLocal();

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

  // ---- Gingr is the SOURCE OF TRUTH for today during the migration period.
  // The board's Checked In / Expected / Checked Out sections come from the
  // live Gingr feed; dashboard-native rows that Gingr doesn't know about are
  // shown separately (they're test data until cutover). Fail-soft: if Gingr
  // is unreachable, the board falls back to dashboard data with a notice.
  const { data: facilityRowForSlug } = await supabase
    .from("facilities")
    .select("slug")
    .eq("id", session!.facilityId)
    .maybeSingle();
  const gingr = await getGingrDay(facilityRowForSlug?.slug ?? "");
  const gingrMode = !gingr.error;
  const allGingr = [...gingr.checkins, ...gingr.expected, ...gingr.checkedOut];
  const gingrGids = allGingr.map((c) => c.gingrAnimalId).filter(Boolean);
  const { data: gingrMatched } = gingrGids.length
    ? await supabase.from("animals").select("id, gingr_animal_id, alert_note").in("gingr_animal_id", gingrGids)
    : { data: [] };
  const gidToAnimal = new Map(
    ((gingrMatched ?? []) as { id: string; gingr_animal_id: number | string | null; alert_note: string | null }[]).map((a) => [
      String(a.gingr_animal_id),
      a,
    ])
  );

  const gToRow = (c: GingrCheckin, status: "booked" | "checked_in" | "checked_out"): CheckInRow => {
    const m = gidToAnimal.get(c.gingrAnimalId);
    const allergy = c.allergies && !/^none\.?$/i.test(c.allergies) ? `Allergies: ${c.allergies}` : null;
    return {
      id: `gingr:${c.gingrReservationId}`,
      status,
      animalId: m?.id ?? "",
      animalName: c.animalName ?? "Unknown",
      alertNote: m?.alert_note ?? allergy,
      breed: c.breed,
      parentId: null,
      parentName: c.ownerName,
      typeName: c.type,
      lodgingName: null,
      startDate: c.startDate,
      endDate: c.endDate,
      phone: c.ownerPhone,
      precheckinStatus: null,
      isLive: true,
    };
  };

  const dashboardRows: CheckInRow[] = rows.map(toRow);
  // A dashboard row duplicates a Gingr row when its animal is matched to a
  // Gingr id present in today's feed — Gingr wins.
  const gingrAnimalIdSet = new Set(allGingr.map((c) => c.gingrAnimalId));
  const animalIdToGid = new Map(
    ((gingrMatched ?? []) as { id: string; gingr_animal_id: number | string | null }[]).map((a) => [a.id, String(a.gingr_animal_id)])
  );
  const dupOfGingr = (r: CheckInRow) => gingrAnimalIdSet.has(animalIdToGid.get(r.animalId) ?? "");

  let boardRows: CheckInRow[];
  let checkedOutRowsFinal: CheckInRow[];
  let dashboardOnlyCheckedIn: CheckInRow[] = [];
  if (gingrMode) {
    const dashBooked = dashboardRows.filter((r) => r.status === "booked" && !dupOfGingr(r));
    dashboardOnlyCheckedIn = dashboardRows.filter((r) => r.status === "checked_in" && !dupOfGingr(r));
    boardRows = [
      ...gingr.checkins.map((c) => gToRow(c, "checked_in")),
      ...gingr.expected.map((c) => gToRow(c, "booked")),
      ...dashBooked,
    ];
    checkedOutRowsFinal = gingr.checkedOut.map((c) => gToRow(c, "checked_out"));
  } else {
    boardRows = dashboardRows;
    checkedOutRowsFinal = ((checkedOutData as unknown as Row[]) ?? []).map(toRow);
  }
  const checkedOutRows = checkedOutRowsFinal;

  const allRows = [...boardRows, ...checkedOutRows, ...dashboardOnlyCheckedIn];
  const [animalTags, parentTags] = await Promise.all([
    getProfileTagsBulk("animal", allRows.map((r) => r.animalId)),
    getProfileTagsBulk("parent", allRows.map((r) => r.parentId ?? "").filter(Boolean)),
  ]);
  const animalTagsObj = Object.fromEntries(animalTags);
  const parentTagsObj = Object.fromEntries(parentTags);

  const expectedTodayCount = boardRows.filter((r) => r.status === "booked" && ymdLocal(r.startDate) === todayStr).length;
  const checkedInCount = boardRows.filter((r) => r.status === "checked_in").length;
  const overnightCount = boardRows.filter((r) => r.status === "checked_in" && ymdLocal(r.endDate) > todayStr).length;
  const checkedOutTodayCount = checkedOutRows.length;

  // "Overnight: 2" on its own doesn't tell you which nights are being billed.
  // List each staying dog with the night it's covering, so the count can be
  // reconciled against an invoice instead of taken on faith.
  const overnightRows = boardRows
    .filter((r) => r.status === "checked_in" && ymdLocal(r.endDate) > todayStr)
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

  // Breakdown by service type — in Gingr mode the counts come from the live
  // feed's own type names; otherwise every active dashboard type shows, even
  // at zero, so staff can see what's not moving today.
  const typeCounts = new Map<string, number>();
  if (!gingrMode) for (const t of allTypes ?? []) typeCounts.set(t.name, 0);
  for (const r of [...boardRows, ...checkedOutRows]) {
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
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="text-[19px] font-semibold leading-tight">Check-in Board</h1>
            {/* Quick calendar links (Kathleen's request) — new tab so the board stays put. */}
            <a
              href="/lodging/calendar"
              target="_blank"
              rel="noreferrer"
              className="text-[13px] text-indigo-600 underline decoration-indigo-300 hover:decoration-indigo-600 dark:text-indigo-400"
            >
              Lodging Calendar ↗
            </a>
            <a
              href="/facility-calendar"
              target="_blank"
              rel="noreferrer"
              className="text-[13px] text-indigo-600 underline decoration-indigo-300 hover:decoration-indigo-600 dark:text-indigo-400"
            >
              Facility Calendar ↗
            </a>
          </div>
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

          {/* Where today's numbers come from. */}
          <p className="px-1 text-[12px] text-slate-400 dark:text-slate-500">
            {gingrMode
              ? "✱ Board is live from Gingr (migration mode) — dogs not yet ported show a ✱ and are managed in Gingr until cutover."
              : `Gingr feed unreachable (${gingr.error}) — showing dashboard data only.`}
          </p>

          {/* Dashboard-native checked-in rows Gingr doesn't know about —
              during migration these are almost always test records. */}
          {gingrMode && dashboardOnlyCheckedIn.length > 0 && (
            <details className="group rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <summary className="flex cursor-pointer select-none list-none items-center justify-between px-4 py-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  Dashboard-only checked in ({dashboardOnlyCheckedIn.length}) — not in Gingr, likely test data
                </span>
                <span className="text-[12px] text-slate-400 transition-transform group-open:rotate-180 dark:text-slate-500">▾</span>
              </summary>
              <div className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
                {dashboardOnlyCheckedIn.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-baseline gap-x-3 px-4 py-1.5 text-[13px]">
                    <Link href={`/reservations/${r.id}`} className="font-medium underline decoration-slate-300 hover:decoration-slate-600 dark:decoration-slate-600">
                      {r.animalName}
                    </Link>
                    <span className="text-slate-400 dark:text-slate-500">{r.typeName ?? ""}</span>
                    <span className="ml-auto text-slate-400 dark:text-slate-500">
                      since {new Date(r.startDate).toLocaleDateString([], { month: "short", day: "numeric" })}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}

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
