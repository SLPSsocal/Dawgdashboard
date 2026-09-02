import { createClient } from "@/lib/supabase/server";
import { getGingrDay, type GingrCheckin } from "@/lib/gingr";

// ============================================================================
// One-way Gingr mirror (migration/testing period).
//
// Live Gingr reservations are materialized into REAL local rows — parents,
// animals, reservations — so every dashboard feature (estimates, adjusting,
// checkout, Helcim) works on them natively. Direction is strictly
// Gingr → dashboard: the proxy only calls Gingr's read endpoint, and nothing
// in this codebase can write to Gingr. Checking a mirrored dog out here
// closes it HERE only; Gingr never knows.
//
// Matching:
//   parent  — parents.gingr_owner_id, else created
//   animal  — animals.gingr_animal_id, else created (linked to that parent)
//   reservation — reservations.gingr_reservation_id, else created; status &
//     dates follow Gingr on each sync EXCEPT rows already checked out in the
//     dashboard (a test checkout must stay closed, not get resurrected).
// ============================================================================

export type GingrSyncResult = {
  ok: boolean;
  error: string | null;
  created: number;
  updated: number;
};

export async function syncGingrDay(facilityId: string, facilitySlug: string): Promise<GingrSyncResult> {
  const day = await getGingrDay(facilitySlug);
  if (day.error) return { ok: false, error: day.error, created: 0, updated: 0 };

  const supabase = createClient();
  const all: { row: GingrCheckin; status: "checked_in" | "booked" | "checked_out" }[] = [
    ...day.checkins.map((row) => ({ row, status: "checked_in" as const })),
    ...day.expected.map((row) => ({ row, status: "booked" as const })),
    ...day.checkedOut.map((row) => ({ row, status: "checked_out" as const })),
  ];
  if (all.length === 0) return { ok: true, error: null, created: 0, updated: 0 };

  // ---- lookups in bulk ----
  const gids = Array.from(new Set(all.map((x) => x.row.gingrAnimalId).filter(Boolean)));
  const ownerIds = Array.from(new Set(all.map((x) => x.row.gingrOwnerId).filter((v): v is string => Boolean(v))));
  const gingrResIds = all.map((x) => x.row.gingrReservationId);

  const [{ data: animalsRows }, { data: parentRows }, { data: resRows }, { data: typeRows }] = await Promise.all([
    gids.length
      ? supabase.from("animals").select("id, gingr_animal_id, parent_id").in("gingr_animal_id", gids)
      : Promise.resolve({ data: [] as never[] }),
    ownerIds.length
      ? supabase.from("parents").select("id, gingr_owner_id").in("gingr_owner_id", ownerIds)
      : Promise.resolve({ data: [] as never[] }),
    supabase
      .from("reservations")
      .select("id, gingr_reservation_id, status")
      .in("gingr_reservation_id", gingrResIds),
    supabase.from("reservation_types").select("id, name").eq("facility_id", facilityId),
  ]);

  const animalByGid = new Map(
    ((animalsRows ?? []) as { id: string; gingr_animal_id: number | string | null; parent_id: string | null }[]).map((a) => [
      String(a.gingr_animal_id),
      a,
    ])
  );
  const parentByOwner = new Map(
    ((parentRows ?? []) as { id: string; gingr_owner_id: string | null }[]).map((p) => [String(p.gingr_owner_id), p.id])
  );
  const resByGingrId = new Map(
    ((resRows ?? []) as { id: string; gingr_reservation_id: string | null; status: string }[]).map((r) => [
      String(r.gingr_reservation_id),
      r,
    ])
  );
  const typeByName = new Map(((typeRows ?? []) as { id: string; name: string }[]).map((t) => [t.name.toLowerCase(), t.id]));

  let created = 0;
  let updated = 0;

  for (const { row: c, status } of all) {
    try {
      // ---- parent ----
      let parentId: string | null = c.gingrOwnerId ? parentByOwner.get(c.gingrOwnerId) ?? null : null;
      if (!parentId && c.gingrOwnerId && (c.ownerFirstName || c.ownerLastName)) {
        const { data: newParent } = await supabase
          .from("parents")
          .insert({
            first_name: c.ownerFirstName ?? "Unknown",
            last_name: c.ownerLastName ?? "(Gingr)",
            email: c.ownerEmail,
            phone: c.ownerPhone,
            gingr_owner_id: c.gingrOwnerId,
            notes: "Mirrored from Gingr (live sync)",
          })
          .select("id")
          .single();
        parentId = newParent?.id ?? null;
        if (parentId) parentByOwner.set(c.gingrOwnerId, parentId);
      }

      // ---- animal ----
      let animal = c.gingrAnimalId ? animalByGid.get(c.gingrAnimalId) : undefined;
      if (!animal && c.gingrAnimalId && c.animalName) {
        const { data: newAnimal } = await supabase
          .from("animals")
          .insert({
            name: c.animalName,
            breed: c.breed,
            species: "Dog",
            parent_id: parentId,
            gingr_animal_id: c.gingrAnimalId,
            medications: c.medicines,
            medical_notes: c.allergies && !/^none\.?$/i.test(c.allergies) ? `Allergies: ${c.allergies}` : null,
            active: true,
          })
          .select("id, gingr_animal_id, parent_id")
          .single();
        if (newAnimal) {
          animal = newAnimal as { id: string; gingr_animal_id: string | number | null; parent_id: string | null };
          animalByGid.set(c.gingrAnimalId, animal);
        }
      } else if (animal && !animal.parent_id && parentId) {
        // Imported animal that never got its parent linked — link it now.
        await supabase.from("animals").update({ parent_id: parentId }).eq("id", animal.id);
        animal.parent_id = parentId;
      }
      if (!animal) continue;

      // ---- reservation ----
      const typeId = c.type ? typeByName.get(c.type.toLowerCase()) ?? null : null;
      const existing = resByGingrId.get(c.gingrReservationId);
      if (!existing) {
        const { error } = await supabase.from("reservations").insert({
          facility_id: facilityId,
          animal_id: animal.id,
          reservation_type_id: typeId,
          status,
          start_date: c.startDate,
          end_date: c.endDate,
          checked_in_at: c.checkInDate,
          checked_out_at: c.checkOutDate,
          notes: c.notes,
          gingr_reservation_id: c.gingrReservationId,
        });
        if (!error) created++;
      } else if (existing.status !== "checked_out") {
        // Follow Gingr unless the dashboard already closed this one out
        // (a test checkout stays closed — we never resurrect it).
        const { error } = await supabase
          .from("reservations")
          .update({
            status,
            start_date: c.startDate,
            end_date: c.endDate,
            checked_in_at: c.checkInDate,
            reservation_type_id: typeId ?? undefined,
          })
          .eq("id", existing.id);
        if (!error) updated++;
      }
    } catch {
      // One bad record must not break the board — skip and continue.
    }
  }

  // ---- reconcile: close rows that dropped OUT of the feed ----
  // Gingr's endpoint only describes TODAY. A dog that checked out on a day
  // nobody loaded the board stayed "checked_in" here forever — by Sep the
  // board claimed 75 checked in / 91 reservations (Krishan, Sep 2). Any
  // mirrored row that started before today and is no longer in the feed is
  // over in Gingr's eyes, so close it here too: checked_in → checked_out,
  // stale booked (no-show / handled in Gingr) → cancelled.
  try {
    const feedIdList = `(${gingrResIds.map((id) => `"${String(id)}"`).join(",")})`;
    const todayYmd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
    await supabase
      .from("reservations")
      .update({ status: "checked_out" })
      .eq("facility_id", facilityId)
      .not("gingr_reservation_id", "is", null)
      .eq("status", "checked_in")
      .lt("start_date", `${todayYmd}T00:00:00`)
      .not("gingr_reservation_id", "in", feedIdList);
    await supabase
      .from("reservations")
      .update({ status: "cancelled" })
      .eq("facility_id", facilityId)
      .not("gingr_reservation_id", "is", null)
      .eq("status", "booked")
      .lt("end_date", `${todayYmd}T00:00:00`)
      .not("gingr_reservation_id", "in", feedIdList);
  } catch {
    // Reconciliation is best-effort; the upserts above already succeeded.
  }

  return { ok: true, error: null, created, updated };
}
