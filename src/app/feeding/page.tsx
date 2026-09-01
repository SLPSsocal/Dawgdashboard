import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import FeedingBoard, { type FeedingRow, type MealName } from "@/components/FeedingBoard";
import { stripHtml } from "@/lib/text";
import { syncGingrDay } from "@/lib/gingrSync";

// Default the meal tab to whatever mealtime it actually is right now
// (Pacific), so staff opening the page at 5pm land on Dinner, not Breakfast.
function currentMeal(): MealName {
  const hourPT = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/Los_Angeles" }).format(
      new Date()
    )
  );
  if (hourPT < 11) return "Breakfast";
  if (hourPT < 16) return "Lunch";
  return "Dinner";
}

function todayPT() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
}

function ymdPT(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date(iso));
}

export default async function FeedingPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; meal?: string; animal?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const sp = await searchParams;

  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : todayPT();
  const meal: MealName = sp.meal === "Breakfast" || sp.meal === "Lunch" || sp.meal === "Dinner" ? sp.meal : currentMeal();

  const supabase = createClient();
  const { data: facilityRow } = await supabase
    .from("facilities")
    .select("slug")
    .eq("id", session!.facilityId)
    .maybeSingle();
  const slug = facilityRow?.slug ?? "";

  // Mirror the live Gingr day into local rows first (one-way; never writes
  // back to Gingr), then read local reservations like any other page.
  const sync = await syncGingrDay(session!.facilityId, slug);

  const { data: resRows } = await supabase
    .from("reservations")
    .select(
      `id, start_date, end_date, status, gingr_reservation_id,
       animals ( id, name, gingr_animal_id, feeding_instructions, medications, alert_note, parents ( last_name ) ),
       reservation_types ( name, category )`
    )
    .eq("facility_id", session!.facilityId)
    .eq("status", "checked_in")
    .order("start_date", { ascending: true });

  type ResRow = {
    id: string;
    start_date: string;
    end_date: string;
    gingr_reservation_id: string | null;
    animals: {
      id: string;
      name: string;
      gingr_animal_id: number | string | null;
      feeding_instructions: string | null;
      medications: string | null;
      alert_note: string | null;
      parents: { last_name: string } | null;
    } | null;
    reservation_types: { name: string; category: string | null } | null;
  };

  const seen = new Set<string>();
  const rows: FeedingRow[] = [];
  for (const r of ((resRows as unknown as ResRow[]) ?? [])) {
    const a = r.animals;
    if (!a || seen.has(a.id)) continue;
    // With the mirror active, checked-in rows Gingr doesn't know about are
    // leftover test records — don't ask staff to feed ghosts.
    if (sync.ok && !r.gingr_reservation_id) continue;
    seen.add(a.id);
    rows.push({
      petId: a.gingr_animal_id != null ? String(a.gingr_animal_id) : a.id,
      animalId: a.id,
      reservationId: r.id,
      name: a.name,
      parentLastName: a.parents?.last_name ?? null,
      feeding: a.feeding_instructions ? stripHtml(a.feeding_instructions) : null,
      medications: a.medications ? stripHtml(a.medications) : null,
      alertNote: a.alert_note,
      typeName: r.reservation_types?.name ?? null,
      // Local-day comparison — a 5pm PT daycare pickup is past midnight UTC
      // and must not read as an overnight stay.
      isOvernight: ymdPT(r.end_date) > ymdPT(r.start_date),
      startYmd: ymdPT(r.start_date),
      endYmd: ymdPT(r.end_date),
      isLive: Boolean(r.gingr_reservation_id),
    });
  }
  rows.sort((x, y) => x.name.localeCompare(y.name));

  // ?animal=<id> — deep link from the run-card QR code: show just that dog.
  const focus = sp.animal ?? null;
  const focusedRows = focus ? rows.filter((r) => r.animalId === focus || r.petId === focus) : rows;

  // All of today's logs (every meal) so the tabs can show progress counts and
  // the strip can show per-dog status dots.
  const petIds = rows.map((r) => r.petId);
  const { data: logRows } = petIds.length
    ? await supabase
        .from("feeding_logs")
        .select("pet_id, meal_time, amount, fresh_food, fresh_food_items, medication_administered, staff_notes, logged_by")
        .eq("facility", slug)
        .eq("date", date)
        .in("pet_id", petIds)
    : { data: [] };

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-[1200px] px-4 py-5 sm:px-6">
        {focus && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-300">
            <span>
              {focusedRows.length > 0
                ? `Showing only ${focusedRows[0].name} (scanned QR code).`
                : "That dog isn't checked in today — nothing to log."}
            </span>
            <a href={`/feeding?date=${date}`} className="font-semibold underline">
              Show all dogs
            </a>
          </div>
        )}
        <FeedingBoard
          rows={focusedRows}
          logs={(logRows ?? []) as never}
          date={date}
          meal={meal}
          facilitySlug={slug}
          staffName={session!.staffName}
          gingrNote={
            sync.ok
              ? "✱ = mirrored live from Gingr. Logging here syncs with PawFeed; nothing touches Gingr."
              : `Live Gingr feed unavailable right now (${sync.error}) — showing dashboard reservations only.`
          }
        />
      </div>
    </main>
  );
}
