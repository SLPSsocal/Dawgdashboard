import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import PageQuickActions from "@/components/PageQuickActions";
import FacilityCalendarBoard, { type ApptCard, type Specialist, type SpecialistBlock } from "@/components/FacilityCalendarBoard";
import SpecialistBlockForm from "@/components/SpecialistBlockForm";
import CalendarDateJump from "@/components/CalendarDateJump";
import Link from "next/link";

function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
}

type ReservationRow = {
  id: string;
  status: string;
  start_date: string;
  end_date: string;
  specialist_id: string | null;
  grooming_service_name: string | null;
  animals: { name: string; breed: string | null } | null;
  reservation_types: { name: string; category: string | null } | null;
};

export default async function FacilityCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { date } = await searchParams;

  const todayStr = new Date().toISOString().slice(0, 10);
  const dateStr = date || todayStr;
  const prevDate = fmt(new Date(new Date(`${dateStr}T00:00:00`).getTime() - 86400000));
  const nextDate = fmt(new Date(new Date(`${dateStr}T00:00:00`).getTime() + 86400000));

  const supabase = createClient();
  const { data: specialistRows } = await supabase
    .from("staff")
    .select("id, full_name")
    .eq("facility_id", session!.facilityId)
    .eq("is_specialist", true)
    .eq("active", true)
    .order("full_name");

  // Blackouts overlapping this day (vacation, sick day, lunch, etc.).
  const { data: blockRows } = await supabase
    .from("availability_blocks")
    .select("id, specialist_id, start_at, end_at, reason")
    .eq("facility_id", session!.facilityId)
    .eq("block_type", "specialist")
    .lt("start_at", `${nextDate}T00:00:00`)
    .gt("end_at", `${dateStr}T00:00:00`);

  const { data: resData } = await supabase
    .from("reservations")
    .select(
      `id, status, start_date, end_date, specialist_id, grooming_service_name,
       animals ( name, breed ),
       reservation_types ( name, category )`
    )
    .eq("facility_id", session!.facilityId)
    .in("status", ["booked", "checked_in"])
    .gte("start_date", `${dateStr}T00:00:00`)
    .lt("start_date", `${nextDate}T00:00:00`)
    .order("start_date");

  const rows = (resData as unknown as ReservationRow[]) ?? [];
  const cards: ApptCard[] = rows.map((r) => ({
    id: r.id,
    animalName: r.animals?.name ?? "Unknown",
    breed: r.animals?.breed ?? null,
    status: r.status,
    typeName: r.reservation_types?.name ?? null,
    category: r.reservation_types?.category ?? null,
    serviceName: r.grooming_service_name,
    specialistId: r.specialist_id,
    time: r.start_date,
    endTime: r.end_date,
  }));

  const specialists: Specialist[] = (specialistRows ?? []).map((s) => ({ id: s.id, name: s.full_name }));

  const blocks: SpecialistBlock[] = ((blockRows as {
    id: string;
    specialist_id: string;
    start_at: string;
    end_at: string;
    reason: string | null;
  }[]) ?? []).map((b) => ({
    id: b.id,
    specialistId: b.specialist_id,
    startAt: b.start_at,
    endAt: b.end_at,
    reason: b.reason,
  }));

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Facility Calendar — {session!.facilityName}</h1>
        </div>

        <div className="mt-3">
          <PageQuickActions session={session!} />
        </div>

        <div className="mt-3 flex items-center gap-2 text-sm">
          <Link
            href={`/facility-calendar?date=${prevDate}`}
            className="rounded-md border border-slate-300 px-2 py-1 hover:border-slate-500 dark:border-slate-700 dark:hover:border-slate-500"
          >
            ← Day
          </Link>
          <span className="font-medium">
            {new Date(`${dateStr}T00:00:00`).toLocaleDateString([], {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </span>
          {dateStr !== todayStr && (
            <Link href="/facility-calendar" className="text-xs text-slate-400 underline dark:text-slate-500">
              Today
            </Link>
          )}
          <Link
            href={`/facility-calendar?date=${nextDate}`}
            className="rounded-md border border-slate-300 px-2 py-1 hover:border-slate-500 dark:border-slate-700 dark:hover:border-slate-500"
          >
            Day →
          </Link>
          {/* Direct month/date jump (Alan's request) — no more paging day by day. */}
          <CalendarDateJump date={dateStr} basePath="/facility-calendar" />
        </div>

        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
          Grooming appointments can be dragged between groomers to reassign — or on mobile, tap a card, then tap
          a column. Evaluations and daycare/boarding arrivals are shown for visibility only. Overbooking a
          specialist is allowed, but double-booked appointments show side-by-side with a{" "}
          <span className="text-red-500 dark:text-red-400">red ⚠️ warning</span> so it doesn&apos;t go unnoticed.
        </p>

        <SpecialistBlockForm specialists={specialists} date={dateStr} />

        <FacilityCalendarBoard specialists={specialists} cards={cards} blocks={blocks} />
      </div>
    </main>
  );
}
