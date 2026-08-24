import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import PageQuickActions from "@/components/PageQuickActions";
import LodgingCalendar, { type CalArea, type CalReservation, type LodgingBlock } from "@/components/LodgingCalendar";
import LodgingBlockForm from "@/components/LodgingBlockForm";
import { createLodgingArea } from "@/app/lodging/actions";
import { todayLocal } from "@/lib/dates";
import Link from "next/link";

function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
}

// Monday-start week containing dateStr.
function mondayOf(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay(); // 0 = Sun ... 6 = Sat
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d;
}

type ReservationRow = {
  id: string;
  status: string;
  lodging_area_id: string | null;
  start_date: string;
  end_date: string;
  animals: { name: string; breed: string | null } | null;
  reservation_types: { name: string; requires_lodging: boolean | null } | null;
};

export default async function LodgingCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { week } = await searchParams;

  const todayStr = todayLocal();
  const monday = mondayOf(week || todayStr);
  const days: string[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return fmt(d);
  });
  const weekStart = days[0];
  const weekEndExclusive = (() => {
    const d = new Date(monday);
    d.setDate(d.getDate() + 7);
    return fmt(d);
  })();
  const prevWeek = (() => {
    const d = new Date(monday);
    d.setDate(d.getDate() - 7);
    return fmt(d);
  })();
  const nextWeek = (() => {
    const d = new Date(monday);
    d.setDate(d.getDate() + 7);
    return fmt(d);
  })();
  const thisWeek = mondayOf(todayStr).getTime() === monday.getTime();

  const supabase = createClient();
  const { data: areas } = await supabase
    .from("lodging_areas")
    .select("id, name, area_type, capacity")
    .eq("facility_id", session!.facilityId)
    .eq("active", true)
    .order("name");

  const { data: blockRows } = await supabase
    .from("availability_blocks")
    .select("id, lodging_area_id, start_at, end_at, reason")
    .eq("facility_id", session!.facilityId)
    .eq("block_type", "lodging")
    .lt("start_at", `${weekEndExclusive}T00:00:00`)
    .gt("end_at", `${weekStart}T00:00:00`);

  const { data: reservationData } = await supabase
    .from("reservations")
    .select(
      `id, status, lodging_area_id, start_date, end_date,
       animals ( name, breed ),
       reservation_types ( name, requires_lodging )`
    )
    .eq("facility_id", session!.facilityId)
    .in("status", ["booked", "checked_in"])
    .lt("start_date", `${weekEndExclusive}T00:00:00`)
    .gt("end_date", `${weekStart}T00:00:00`)
    .order("start_date");

  const rows = (reservationData as unknown as ReservationRow[]) ?? [];
  const reservations: CalReservation[] = rows
    .filter((r) => r.reservation_types?.requires_lodging !== false)
    .map((r) => ({
      id: r.id,
      animalName: r.animals?.name ?? "Unknown",
      breed: r.animals?.breed ?? null,
      status: r.status,
      typeName: r.reservation_types?.name ?? null,
      lodgingAreaId: r.lodging_area_id,
      startDate: r.start_date,
      endDate: r.end_date,
    }));

  const blocks: LodgingBlock[] = ((blockRows as {
    id: string;
    lodging_area_id: string;
    start_at: string;
    end_at: string;
    reason: string | null;
  }[]) ?? []).map((b) => ({
    id: b.id,
    lodgingAreaId: b.lodging_area_id,
    startDate: b.start_at,
    endDate: b.end_at,
    reason: b.reason,
  }));

  const calAreas: CalArea[] = (areas ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    area_type: a.area_type,
    capacity: a.capacity,
  }));

  const weekLabel = `${new Date(`${weekStart}T00:00:00`).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  })} – ${new Date(`${days[6]}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric" })}`;

  // KPI strip (design: OCCUPIED TONIGHT / ARRIVING TODAY / DEPARTING TOMORROW / UNASSIGNED)
  const tomorrowStr = (() => {
    const d = new Date(`${todayStr}T12:00:00`);
    d.setDate(d.getDate() + 1);
    return fmt(d);
  })();
  const occupiedTonight = reservations.filter(
    (r) => todayStr >= r.startDate.slice(0, 10) && todayStr < r.endDate.slice(0, 10)
  ).length;
  const arrivingToday = reservations.filter((r) => r.startDate.slice(0, 10) === todayStr).length;
  const departingTomorrow = reservations.filter((r) => r.endDate.slice(0, 10) === tomorrowStr).length;
  const unassignedCount = reservations.filter((r) => !r.lodgingAreaId).length;
  const kpis = [
    { label: "Occupied tonight", value: occupiedTonight, dot: "bg-emerald-600" },
    { label: "Arriving today", value: arrivingToday, dot: "bg-sky-600" },
    { label: "Departing tomorrow", value: departingTomorrow, dot: "bg-violet-600" },
    { label: "Unassigned", value: unassignedCount, dot: "bg-amber-600", warn: unassignedCount > 0 },
  ];

  const pagerChip =
    "inline-flex h-8 items-center rounded-full border border-[#e3e5ea] bg-white px-3 text-[13px] font-medium text-[#565d6d] shadow-sm transition-colors hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300";

  return (
    <main className="min-h-screen bg-[#f5f6f8] dark:bg-slate-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-[#15181d] dark:text-slate-50">
              Lodging calendar
            </h1>
            <p className="mt-1 text-[13px] text-[#8a91a0] dark:text-slate-500">
              {weekLabel} · drag a chip to a suite row to reassign — the check-in board reads the same reservation
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/lodging/calendar?week=${prevWeek}`} className={pagerChip}>
              ← Week
            </Link>
            {!thisWeek && (
              <Link href="/lodging/calendar" className={`${pagerChip} !text-indigo-600`}>
                This week
              </Link>
            )}
            <Link href={`/lodging/calendar?week=${nextWeek}`} className={pagerChip}>
              Week →
            </Link>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-[#e3e5ea] bg-[#e3e5ea] shadow-sm sm:grid-cols-4 dark:border-slate-800 dark:bg-slate-800">
          {kpis.map((k) => (
            <div key={k.label} className="bg-white px-4 py-3 dark:bg-slate-900">
              <div className="flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${k.dot}`} />
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8a91a0] dark:text-slate-500">
                  {k.label}
                </span>
              </div>
              <div
                className={`mt-1 text-[26px] font-semibold leading-none ${
                  k.warn ? "text-amber-700 dark:text-amber-400" : "text-[#15181d] dark:text-slate-50"
                }`}
              >
                {k.value}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3">
          <PageQuickActions session={session!} />
        </div>

        <details className="group mt-4 rounded-[14px] border border-[#e3e5ea] bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <summary className="flex cursor-pointer select-none list-none items-center justify-between px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">+ Add Lodging Area</h2>
            <span className="text-slate-400 transition-transform group-open:rotate-180 dark:text-slate-500">▾</span>
          </summary>
          <form
            action={createLodgingArea}
            className="flex flex-col gap-3 border-t border-slate-100 p-4 sm:flex-row sm:items-end dark:border-slate-800"
          >
            <input type="hidden" name="facility_id" value={session!.facilityId} />
            <label className="flex-1">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Name</span>
              <input
                name="name"
                required
                placeholder="Suite 8"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <label>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Type</span>
              <select
                name="area_type"
                defaultValue="kennel"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="kennel">Kennel</option>
                <option value="suite">Suite</option>
                <option value="run">Run</option>
                <option value="daycare_pen">Daycare Pen</option>
              </select>
            </label>
            <label>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Capacity</span>
              <input
                name="capacity"
                type="number"
                min={1}
                defaultValue={1}
                className="mt-1 w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <button
              type="submit"
              className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-medium text-white sm:w-fit dark:bg-slate-100 dark:text-slate-900"
            >
              Add
            </button>
          </form>
        </details>

        {(!areas || areas.length === 0) ? (
          <p className="mt-8 text-sm text-slate-400 dark:text-slate-500">
            No lodging areas set up yet for {session!.facilityName}.
          </p>
        ) : (
          <>
            <LodgingBlockForm
              areas={calAreas.map((a) => ({ id: a.id, name: a.name }))}
              week={weekStart}
              defaultDate={todayStr >= weekStart && todayStr <= days[6] ? todayStr : weekStart}
            />
            <LodgingCalendar areas={calAreas} days={days} initialReservations={reservations} blocks={blocks} today={todayStr} />
          </>
        )}
      </div>
    </main>
  );
}
