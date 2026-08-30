import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import PageQuickActions from "@/components/PageQuickActions";
import BookingForm from "@/components/BookingForm";
import type { AnimalOption } from "@/components/AnimalPicker";
import Link from "next/link";

export default async function NewReservationPage({
  searchParams,
}: {
  searchParams: Promise<{ animal_id?: string; category?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { animal_id: animalIdParam, category: categoryParam } = await searchParams;

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
        .select("name, default_duration_minutes, min_price, max_price")
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
    minPrice: g.min_price != null ? Number(g.min_price) : null,
    maxPrice: g.max_price != null ? Number(g.max_price) : null,
  }));

  const specialists = (staffRows ?? []).map((s) => ({ id: s.id, name: s.full_name }));

  // Arriving here from a dog's or parent's page ("New Booking") should
  // pre-fill the dog instead of making staff search for who they were just
  // looking at.
  const initialAnimal = animalIdParam ? animalOptions.find((a) => a.id === animalIdParam) ?? null : null;

  // ?category=grooming (the board's "+ Grooming" shortcut) preselects the
  // first reservation type of that category so the time/service/price
  // fields are already showing when the form opens.
  const initialTypeId = categoryParam
    ? reservationTypes.find((t) => t.category === categoryParam)?.id ?? null
    : null;

  return (
    <main className="min-h-screen bg-[#f5f6f8] dark:bg-slate-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <Link
          href="/reservations"
          className="text-[13px] font-medium text-[#8a91a0] transition-colors hover:text-indigo-600 dark:text-slate-500"
        >
          ← Check-in board
        </Link>
        <h1 className="mt-1 text-[26px] font-semibold leading-tight tracking-[-0.01em] text-[#15181d] dark:text-slate-50">
          New booking
        </h1>
        <p className="mt-1 text-[13px] text-[#8a91a0] dark:text-slate-500">
          Books at {session!.facilityName} and shows in Quick Check-in right away. Grooming types schedule a time
          slot and specialist instead of a date range.
        </p>

        <div className="mt-3">
          <PageQuickActions session={session!} />
        </div>

        <div className="mt-5">
          <BookingForm
            facilityId={session!.facilityId}
            animals={animalOptions}
            reservationTypes={reservationTypes}
            lodgingAreas={areas ?? []}
            groomingServices={groomingServices}
            specialists={specialists}
            initialAnimal={initialAnimal}
            initialTypeId={initialTypeId}
            staffName={session!.staffName}
          />
        </div>
      </div>
    </main>
  );
}
