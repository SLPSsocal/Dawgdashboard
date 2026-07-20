import { createClient } from "@/lib/supabase/server";

export type CheckInCandidate = {
  id: string;
  animalName: string;
  parentName: string | null;
  typeName: string | null;
  startDate: string;
};

type CandidateRow = {
  id: string;
  start_date: string;
  animals: { name: string; parents: { first_name: string; last_name: string } | null } | null;
  reservation_types: { name: string } | null;
};

// Shared by PageQuickActions (server component rendered on every page) so
// the Check-in popup's typeahead has data instantly with no client round-trip.
export async function getCheckInCandidates(facilityId: string): Promise<CheckInCandidate[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("reservations")
    .select(
      `id, start_date,
       animals ( name, parents ( first_name, last_name ) ),
       reservation_types ( name )`
    )
    .eq("facility_id", facilityId)
    .eq("status", "booked")
    .order("start_date", { ascending: true })
    .limit(150);

  const rows = (data as unknown as CandidateRow[]) ?? [];
  return rows.map((r) => ({
    id: r.id,
    animalName: r.animals?.name ?? "Unknown",
    parentName: r.animals?.parents ? `${r.animals.parents.first_name} ${r.animals.parents.last_name}` : null,
    typeName: r.reservation_types?.name ?? null,
    startDate: r.start_date,
  }));
}
