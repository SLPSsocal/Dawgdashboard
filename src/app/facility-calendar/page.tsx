import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import PageQuickActions from "@/components/PageQuickActions";
import FacilityCalendarBoard, { type ApptCard, type Specialist, type SpecialistBlock } from "@/components/FacilityCalendarBoard";
import SpecialistBlockForm from "@/components/SpecialistBlockForm";
import CalendarDateJump from "@/components/CalendarDateJump";
import { todayLocal } from "@/lib/dates";
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

  const todayStr = todayLocal();
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

  const pagerChip =
    "inline-flex h-8 items-center rounded-full border border-[#e3e5ea] bg-white px-3 text-[13px] font-medium text-[#565d6d] shadow-sm transition-colors hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300";

  return (
    <main className="min-h-screen bg-[#f5f6f8] dark:bg-slate-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-[#15181d] dark:text-slate-50">
              Facility calendar
            </h1>
            <p className="mt-1 text-[13px] text-[#8a91a0] dark:text-slate-500">
              {new Date(`${dateStr}T00:00:00`).toLocaleDateString([], {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}{" "}
              · drag grooming cards between groomers; double-booked slots flag red ⚠️
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/facility-calendar?date=${prevDate}`} className={pagerChip}>
              ← Day
            </Link>
            {dateStr !== todayStr && (
              <Link href="/facility-calendar" className={`${pagerChip} !text-indigo-600`}>
                Today
              </Link>
            )}
            <Link href={`/facility-calendar?date=${nextDate}`} className={pagerChip}>
              Day →
            </Link>
            {/* Direct month/date jump (Alan's request) — no more paging day by day. */}
            <CalendarDateJump date={dateStr} basePath="/facility-calendar" />
          </div>
        </div>

        <div className="mt-3">
          <PageQuickActions session={session!} />
        </div>

        <SpecialistBlockForm specialists={specialists} date={dateStr} />

        <FacilityCalendarBoard specialists={specialists} cards={cards} blocks={blocks} />
      </div>
    </main>
  );
}
