import { createClient } from "@/lib/supabase/server";
import { getGingrDay } from "@/lib/gingr";

export type CheckInCandidate = {
  id: string;
  animalName: string;
  parentName: string | null;
  typeName: string | null;
  startDate: string;
  /** True for dogs that live in Gingr during migration — visible here, but
   *  checked in from Gingr, not the dashboard. */
  inGingr?: boolean;
};

type CandidateRow = {
  id: string;
  start_date: string;
  animals: { name: string; parents: { first_name: string; last_name: string } | null } | null;
  reservation_types: { name: string } | null;
};

// Powers the Quick Check-in typeahead in the header nav.
//
// The Check-in Board runs in "Gingr mode" during the migration: its Expected
// rows come from the live Gingr feed, not from this table. Quick Check-in used
// to query only dashboard-native "booked" reservations, so a facility whose
// expected dogs all live in Gingr saw an empty list and the misleading message
// "Nothing expected — everyone is checked in" (Anne, House of Woof, Aug 17).
// Gingr-expected dogs are now included and clearly marked, matching the board.
export async function getCheckInCandidates(facilityId: string): Promise<CheckInCandidate[]> {
  const supabase = createClient();
  const [{ data }, { data: facilityRow }] = await Promise.all([
    supabase
      .from("reservations")
      .select(
        `id, start_date,
       animals ( name, parents ( first_name, last_name ) ),
       reservation_types ( name )`
      )
      .eq("facility_id", facilityId)
      .eq("status", "booked")
      .order("start_date", { ascending: true })
      .limit(150),
    supabase.from("facilities").select("slug").eq("id", facilityId).maybeSingle(),
  ]);

  const rows = (data as unknown as CandidateRow[]) ?? [];
  const dashboardCandidates = rows.map((r) => ({
    id: r.id,
    animalName: r.animals?.name ?? "Unknown",
    parentName: r.animals?.parents ? `${r.animals.parents.first_name} ${r.animals.parents.last_name}` : null,
    typeName: r.reservation_types?.name ?? null,
    startDate: r.start_date,
  }));

  // Fail-soft, same as the board: if Gingr is unreachable we just show the
  // dashboard-native list rather than erroring the whole dialog.
  const gingr = await getGingrDay(facilityRow?.slug ?? "");
  const gingrCandidates: CheckInCandidate[] = gingr.error
    ? []
    : gingr.expected.map((c) => ({
        id: `gingr:${c.gingrReservationId}`,
        animalName: c.animalName ?? "Unknown",
        parentName: c.ownerName,
        typeName: c.type,
        startDate: c.startDate,
        inGingr: true,
      }));

  return [...gingrCandidates, ...dashboardCandidates];
}
