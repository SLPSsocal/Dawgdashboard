import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import PageQuickActions from "@/components/PageQuickActions";
import BookingForm from "@/components/BookingForm";
import type { AnimalOption } from "@/components/AnimalPicker";

export default async function NewReservationPage({
  searchParams,
}: {
  searchParams: Promise<{ animal_id?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { animal_id: animalIdParam } = await searchParams;

  const supabase = createClient();
  const [{ data: animals }, { data: types }, { data: areas }, { data: groomingItems }, { data: staffRows }] =
    await Promise.all([
      // Animals are shared across facilities, so any dog can be booked here.
      supabase
        .from("animals")
        .select("id, name, breed, parent_id, alert_note, parents ( first_name, last_name )")
        .eq("active", true)
        .order("name"),
      supabase
        .from("reservation_types")
        .select("id, name, category, requires_lodging, requires_specialist, duration_minutes")
        .eq("facility_id", session!.facilityId)
        .eq("active", true)
        .order("name"),
      supabase.from("lodging_areas").select("id, name").eq("facility_id", session!.facilityId).order("name"),
      supabase
        .from("grooming_menu_items")
        .select("name, default_duration_minutes")
        .eq("facility_id", session!.facilityId)
        .eq("active", true)
        .order("name"),
      supabase
        .from("staff")
        .select("id, full_name")
        .eq("facility_id", session!.facilityId)
        .eq("is_specialist", true)
        .eq("active", true)
        .order("full_name"),
    ]);

  type AnimalRow = {
    id: string;
    name: string;
    breed: string | null;
    parent_id: string | null;
    alert_note: string | null;
    parents: { first_name: string; last_name: string } | null;
  };
  const animalOptions: AnimalOption[] = ((animals as unknown as AnimalRow[]) ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    breed: a.breed,
    parentId: a.parent_id,
    parentName: a.parents ? `${a.parents.first_name} ${a.parents.last_name}` : null,
    alertNote: a.alert_note,
  }));

  const reservationTypes = (types ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    category: t.category,
    requiresLodging: t.requires_lodging,
    requiresSpecialist: t.requires_specialist,
    durationMinutes: t.duration_minutes,
  }));

  const groomingServices = (groomingItems ?? []).map((g) => ({
    name: g.name,
    defaultDurationMinutes: g.default_duration_minutes,
  }));

  const specialists = (staffRows ?? []).map((s) => ({ id: s.id, name: s.full_name }));

  // Arriving here from a dog's or parent's page ("New Booking") should
  // pre-fill the dog instead of making staff search for who they were just
  // looking at.
  const initialAnimal = animalIdParam ? animalOptions.find((a) => a.id === animalIdParam) ?? null : null;

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <a href="/reservations" className="text-sm text-slate-400 underline dark:text-slate-500">
          ← Check-in Board
        </a>
        <h1 className="mt-2 text-xl font-semibold">New Booking</h1>
        <p className="text-sm text-slate-400 dark:text-slate-500">
          Creates a booked reservation at {session!.facilityName} — it shows up in Quick Check-in right after you
          create it. Pick a grooming reservation type to schedule a time slot and specialist instead of a date
          range.
        </p>

        <div className="mt-3">
          <PageQuickActions session={session!} />
        </div>

        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
          <BookingForm
            facilityId={session!.facilityId}
            animals={animalOptions}
            reservationTypes={reservationTypes}
            lodgingAreas={areas ?? []}
            groomingServices={groomingServices}
            specialists={specialists}
            initialAnimal={initialAnimal}
            staffName={session!.staffName}
          />
        </div>
      </div>
    </main>
  );
}
