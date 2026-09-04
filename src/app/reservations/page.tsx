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
import { syncGingrDay } from "@/lib/gingrSync";
import Link from "next/link";
import { formatInZone } from "@/lib/timezone";

type Row = {
  id: string;
  status: string;
  start_date: string;
  end_date: string;
  gingr_reservation_id: string | null;
  grooming_service_name?: string | null;
  service_subtype?: string | null;
  animals: {
    id: string;
    name: string;
    breed: string | null;
    photo_url: string | null;
    alert_note: string | null;
    gingr_animal_id: number | string | null;
    parents: { id: string; first_name: string; last_name: string; phone: string | null } | null;
  } | null;
  lodging_areas: { name: string } | null;
  reservation_types: { name: string; category?: string | null } | null;
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
    // "Type" column: grooming's is its service; boarding/daycare use the
    // service_subtype picked at booking (Private Play, In Daycare, …).
    serviceType: r.grooming_service_name ?? r.service_subtype ?? null,
    lodgingName: r.lodging_areas?.name ?? null,
    startDate: r.start_date,
    endDate: r.end_date,
    phone: r.animals?.parents?.phone ?? null,
    precheckinStatus: precheckinByReservation.get(r.id) ?? null,
    isLive: Boolean(r.gingr_reservation_id),
  };
}

export default async function ReservationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Facility isolation happens right here: every query in this app is filtered
  // by session.facilityId, which came from the PIN login for this facility only.
  const supabase = createClient();

  // ---- One-way Gingr mirror (migration/testing period) ----
  // Live Gingr reservations become REAL local rows first, then the board
  // renders from local data as normal — so estimates, adjustments, checkout
  // and Helcim all work on live dogs. Nothing ever writes back to Gingr.
  const { data: facilityRow } = await supabase
    .from("facilities")
    .select("slug, timezone")
    .eq("id", session!.facilityId)
    .maybeSingle();
  const sync = await syncGingrDay(session!.facilityId, facilityRow?.slug ?? "");
  const facilityTz: string = facilityRow?.timezone ?? "America/New_York";

  const selectCols = `id, status, start_date, end_date, gingr_reservation_id, grooming_service_name, service_subtype,
       animals ( id, name, breed, photo_url, alert_note, gingr_animal_id, parents ( id, first_name, last_name, phone ) ),
       lodging_areas ( name ),
       reservation_types ( name, category )`;

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
      .lte("checked_out_at", `${todayStr}T23:59:59.999`)
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

  const allBoardRows: CheckInRow[] = rows.map(toRow);
  const checkedOutRows: CheckInRow[] = ((checkedOutData as unknown as Row[]) ?? []).map(toRow);

  // With the mirror active, checked-in rows Gingr doesn't know about are
  // almost certainly leftover test records — keep them out of the way in a
  // labelled drawer instead of polluting the board.
  const mirrorActive = sync.ok;
  const staleTestRows = mirrorActive
    ? allBoardRows.filter((r) => r.status === "checked_in" && !r.isLive)
    : [];
  const staleIds = new Set(staleTestRows.map((r) => r.id));
  const boardRows = allBoardRows.filter((r) => !staleIds.has(r.id));

  // --- Card enrichments (Krishan, Aug 30) ---
  // 1) Fresh-food meal counts this stay, from the shared feeding_logs table
  //    (also written by PawFeed — read-only here).
  // 2) Today's grooming appointment per dog, so a booked groom shows on the
  //    dog's board card instead of only on the Facility Calendar.
  const checkedInRaw = rows.filter((r) => r.status === "checked_in");
  const petKeyByAnimal = new Map<string, string[]>();
  const stayStartByAnimal = new Map<string, string>();
  for (const r of checkedInRaw) {
    if (!r.animals?.id) continue;
    const keys = [r.animals.id, ...(r.animals.gingr_animal_id != null ? [String(r.animals.gingr_animal_id)] : [])];
    petKeyByAnimal.set(r.animals.id, keys);
    const startYmd = ymdLocal(r.start_date);
    const cur = stayStartByAnimal.get(r.animals.id);
    if (!cur || startYmd < cur) stayStartByAnimal.set(r.animals.id, startYmd);
  }
  const allPetKeys = [...petKeyByAnimal.values()].flat();
  const freshMeals: Record<string, number> = {};
  if (allPetKeys.length > 0) {
    const minStart = [...stayStartByAnimal.values()].sort()[0];
    const { data: feedRows } = await supabase
      .from("feeding_logs")
      .select("pet_id, date, fresh_food")
      .in("pet_id", allPetKeys)
      .gte("date", minStart)
      .lte("date", todayStr);
    for (const [animalId, keys] of petKeyByAnimal) {
      const stayStart = stayStartByAnimal.get(animalId) ?? todayStr;
      freshMeals[animalId] = (feedRows ?? []).filter(
        (f) => keys.includes(String(f.pet_id)) && f.date >= stayStart && f.fresh_food
      ).length;
    }
  }

  const groomingToday: Record<string, { reservationId: string; time: string; service: string | null }> = {};
  for (const r of rows) {
    if (r.reservation_types?.category === "grooming" && r.animals?.id && ymdLocal(r.start_date) === todayStr) {
      groomingToday[r.animals.id] = {
        reservationId: r.id,
        time: r.start_date,
        service: r.grooming_service_name ?? null,
      };
    }
  }

  const allRows = [...allBoardRows, ...checkedOutRows];
  const [animalTags, parentTags] = await Promise.all([
    getProfileTagsBulk("animal", allRows.map((r) => r.animalId).filter(Boolean)),
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
    { label: "Expected Today", value: expectedTodayCount, dot: "bg-amber-500" },
    { label: "Checked In", value: checkedInCount, dot: "bg-emerald-500" },
    { label: "Checked Out", value: checkedOutTodayCount, dot: "bg-sky-500" },
    { label: "Overnight", value: overnightCount, dot: "bg-violet-500" },
    {
      label: "Total Today",
      value: expectedTodayCount + checkedInCount + checkedOutTodayCount,
      dot: "bg-indigo-500",
      highlight: true,
    },
  ];

  // Breakdown by service type — every active reservation type shows, even at
  // zero, so staff can see what's not moving today (matches Gingr's dash).
  const typeCounts = new Map<string, number>();
  for (const t of allTypes ?? []) typeCounts.set(t.name, 0);
  for (const r of [...boardRows, ...checkedOutRows]) {
    if (r.typeName) typeCounts.set(r.typeName, (typeCounts.get(r.typeName) ?? 0) + 1);
  }
  const breakdown = Array.from(typeCounts.entries()).map(([name, count]) => ({ name, count }));

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-950">
      <FacilityHeader session={session!} />

      {/* Summary stacks vertically and compactly — KPI strip, service mix,
          then straight into search + tables. */}
      <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6">
        {/* Page head per the redesign: big title, one meta line (date · live
            mirror status · refresh), calendar quick links as chips. */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[26px] font-bold leading-tight tracking-[-0.01em]">Check-in board</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px] text-[#565d6d] dark:text-slate-400">
              <span>{new Date().toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}</span>
              <span className="text-[#c4c9d4] dark:text-slate-600">·</span>
              {mirrorActive ? (
                <span className="font-medium text-indigo-600 dark:text-indigo-400">
                  ✱ {boardRows.filter((r) => r.isLive).length + checkedOutRows.filter((r) => r.isLive).length} mirrored
                  live from Gingr
                </span>
              ) : (
                <span className="text-amber-700 dark:text-amber-400">Gingr feed unreachable — local data only</span>
              )}
              <span className="text-[#c4c9d4] dark:text-slate-600">·</span>
              <Link href="/reservations" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                Refresh
              </Link>
            </p>
          </div>
          <div className="flex gap-2">
            <a
              href="/lodging/calendar"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center rounded-[10px] border border-[#e3e5ea] bg-white px-3 text-[13px] font-medium text-[#565d6d] hover:border-[#c4c9d4] hover:text-[#15181d] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              Lodging calendar ↗
            </a>
            <a
              href="/facility-calendar"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center rounded-[10px] border border-[#e3e5ea] bg-white px-3 text-[13px] font-medium text-[#565d6d] hover:border-[#c4c9d4] hover:text-[#15181d] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              Facility calendar ↗
            </a>
          </div>
        </div>
        {error && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">Couldn&apos;t load reservations: {error.message}</p>
        )}

        <div className="mt-4 flex flex-col gap-3">
          <DailySummaryBar stats={stats} />

          <div className={`grid gap-3 ${overnightRows.length > 0 ? "lg:grid-cols-[1fr_400px]" : ""}`}>
            <ServiceBreakdownTable breakdown={breakdown} />
            {overnightRows.length > 0 && (
              <div className="rounded-[14px] border border-[#e3e5ea] bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-[#8a91a0] dark:text-slate-500">
                  Overnight tonight — nights billing
                </div>
                {/* On phones each dog gets its own two-line block (name+night,
                    then departs) — the old single wrapping flex row broke into
                    ragged fragments on narrow screens (Krishan, Aug 30). */}
                <div className="mt-2 flex flex-col divide-y divide-[#f1f2f5] sm:divide-y-0 sm:gap-1.5 dark:divide-slate-800">
                  {overnightRows.slice(0, 6).map((o, i) => (
                    <div key={i} className="flex flex-col gap-0.5 py-1.5 text-[13px] sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-2 sm:py-0">
                      <span className="flex items-baseline gap-x-2">
                        <span className="font-semibold text-[#15181d] dark:text-slate-100">{o.animalName}</span>
                        <span className="text-[#8a91a0] dark:text-slate-500">
                          night of{" "}
                          {new Date(`${o.nightOf}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric" })} →{" "}
                          {new Date(new Date(`${o.nightOf}T12:00:00`).getTime() + 86400000).toLocaleDateString([], {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </span>
                      <span className="text-[12px] text-[#8a91a0] sm:ml-auto dark:text-slate-500">
                        departs{" "}
                        {formatInZone(o.departs, facilityTz, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </span>
                    </div>
                  ))}
                  {overnightRows.length > 6 && (
                    <p className="text-[12px] text-[#8a91a0] dark:text-slate-500">+ {overnightRows.length - 6} more staying tonight</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {staleTestRows.length > 0 && (
            <details className="group rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <summary className="flex cursor-pointer select-none list-none items-center justify-between px-4 py-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  Dashboard-only checked in ({staleTestRows.length}) — not in Gingr, likely test data
                </span>
                <span className="text-[12px] text-slate-400 transition-transform group-open:rotate-180 dark:text-slate-500">▾</span>
              </summary>
              <div className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
                {staleTestRows.map((r) => (
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

        </div>

        <div className="mt-3">
          {boardRows.length === 0 && !error ? (
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
              freshMeals={freshMeals}
              groomingToday={groomingToday}
            />
          )}
        </div>
      </div>
    </main>
  );
}
