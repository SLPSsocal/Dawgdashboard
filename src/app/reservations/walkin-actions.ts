"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { zonedTimeToUtc } from "@/lib/timezone";

// Walk-in check-in (4 staff tickets, Sep 14–15): daycare regulars turn up
// with no booking, and Quick Check-in only listed dogs that already had one,
// so staff had to leave the board, build a full reservation, then come back
// to check the dog in. This creates the reservation AND checks the dog in
// from one place, with sensible defaults staff can override.

export type WalkInType = { id: string; name: string; category: string | null; requiresLodging: boolean };
export type WalkInArea = { id: string; name: string };

export type WalkInOptions = {
  types: WalkInType[];
  defaultTypeId: string | null;
  defaultPickup: string; // "HH:MM" wall-clock at the facility
  areas: WalkInArea[];
  timezone: string;
};

export type WalkInAnimal = {
  id: string;
  name: string;
  breed: string | null;
  parentId: string | null;
  parentName: string | null;
  phone: string | null;
  alertNote: string | null;
  active: boolean;
  vaccinationExpiry: string | null;
  /** Already on the board today — id of that reservation and its status. */
  todayReservationId: string | null;
  todayStatus: "booked" | "checked_in" | null;
};

const DEFAULT_PICKUP = "17:30";

export async function getWalkInOptions(): Promise<WalkInOptions> {
  const session = await getSession();
  if (!session) throw new Error("Not signed in");
  const supabase = createClient();
  const since = new Date(Date.now() - 45 * 86400000).toISOString();

  const [{ data: typeRows }, { data: areaRows }, { data: facility }, { data: recent }] = await Promise.all([
    supabase
      .from("reservation_types")
      .select("id, name, category, requires_lodging")
      .eq("facility_id", session.facilityId)
      .eq("active", true)
      .in("category", ["daycare", "evaluation"])
      .order("name"),
    supabase.from("lodging_areas").select("id, name").eq("facility_id", session.facilityId).eq("active", true).order("name"),
    supabase.from("facilities").select("timezone").eq("id", session.facilityId).maybeSingle(),
    // Default to whatever daycare type this facility actually books most.
    supabase
      .from("reservations")
      .select("reservation_type_id")
      .eq("facility_id", session.facilityId)
      .gte("created_at", since)
      .not("reservation_type_id", "is", null)
      .limit(1000),
  ]);

  const types: WalkInType[] = ((typeRows ?? []) as { id: string; name: string; category: string | null; requires_lodging: boolean | null }[]).map(
    (t) => ({ id: t.id, name: t.name, category: t.category, requiresLodging: t.requires_lodging === true })
  );
  const counts = new Map<string, number>();
  for (const r of (recent ?? []) as { reservation_type_id: string }[]) {
    counts.set(r.reservation_type_id, (counts.get(r.reservation_type_id) ?? 0) + 1);
  }
  const daycare = types.filter((t) => t.category === "daycare");
  const ranked = [...(daycare.length ? daycare : types)].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0));

  return {
    types,
    defaultTypeId: ranked[0]?.id ?? null,
    defaultPickup: DEFAULT_PICKUP,
    areas: ((areaRows ?? []) as WalkInArea[]).map((a) => ({ id: a.id, name: a.name })),
    timezone: facility?.timezone ?? "America/Los_Angeles",
  };
}

/** Dogs matching a name / parent name / phone, with today's board status. */
export async function searchWalkInAnimals(query: string): Promise<WalkInAnimal[]> {
  const session = await getSession();
  if (!session) return [];
  const q = query.trim();
  if (q.length < 2) return [];
  const supabase = createClient();
  const like = `%${q.replace(/[%_]/g, "")}%`;

  type Row = {
    id: string;
    name: string;
    breed: string | null;
    active: boolean | null;
    alert_note: string | null;
    vaccination_expiry: string | null;
    parents: { id: string; first_name: string; last_name: string; phone: string | null } | null;
  };
  const cols = "id, name, breed, active, alert_note, vaccination_expiry, parents ( id, first_name, last_name, phone )";

  // Two cheap queries instead of one clever one: by dog name, and by parent.
  const [{ data: byName }, { data: parentRows }] = await Promise.all([
    supabase.from("animals").select(cols).ilike("name", like).order("name").limit(12),
    supabase
      .from("parents")
      .select("id")
      .or(`first_name.ilike.${like},last_name.ilike.${like},phone.ilike.${like}`)
      .limit(10),
  ]);
  let byParent: Row[] = [];
  const parentIds = ((parentRows ?? []) as { id: string }[]).map((p) => p.id);
  if (parentIds.length) {
    const { data } = await supabase.from("animals").select(cols).in("parent_id", parentIds).order("name").limit(12);
    byParent = (data as unknown as Row[]) ?? [];
  }

  const seen = new Set<string>();
  const rows: Row[] = [];
  for (const r of [...((byName as unknown as Row[]) ?? []), ...byParent]) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    rows.push(r);
  }
  const top = rows.slice(0, 8);
  if (top.length === 0) return [];

  // Is any of them already on today's board here?
  const { data: resRows } = await supabase
    .from("reservations")
    .select("id, animal_id, status, start_date")
    .eq("facility_id", session.facilityId)
    .in("animal_id", top.map((r) => r.id))
    .in("status", ["booked", "checked_in"])
    .gte("end_date", new Date(Date.now() - 86400000).toISOString());
  const todayYmd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
  const byAnimal = new Map<string, { id: string; status: "booked" | "checked_in" }>();
  for (const r of (resRows ?? []) as { id: string; animal_id: string; status: "booked" | "checked_in"; start_date: string }[]) {
    const isToday = String(r.start_date).slice(0, 10) === todayYmd;
    if (r.status === "checked_in" || isToday) {
      const cur = byAnimal.get(r.animal_id);
      if (!cur || r.status === "checked_in") byAnimal.set(r.animal_id, { id: r.id, status: r.status });
    }
  }

  return top.map((r) => ({
    id: r.id,
    name: r.name,
    breed: r.breed,
    parentId: r.parents?.id ?? null,
    parentName: r.parents ? `${r.parents.first_name} ${r.parents.last_name}`.trim() : null,
    phone: r.parents?.phone ?? null,
    alertNote: r.alert_note,
    active: r.active !== false,
    vaccinationExpiry: r.vaccination_expiry,
    todayReservationId: byAnimal.get(r.id)?.id ?? null,
    todayStatus: byAnimal.get(r.id)?.status ?? null,
  }));
}

/**
 * Create a same-day reservation already in checked_in state. If the dog is
 * already booked today, that booking is checked in instead (no duplicate);
 * if already checked in, nothing changes.
 */
export async function walkInCheckIn(payload: {
  animalId: string;
  reservationTypeId: string | null;
  pickupTime: string; // "HH:MM"
  lodgingAreaId?: string | null;
  notes?: string | null;
}): Promise<{ reservationId: string; reused: boolean }> {
  const session = await getSession();
  if (!session) throw new Error("Not signed in");
  const supabase = createClient();
  if (!payload.animalId) throw new Error("Pick a dog first.");

  const { data: animal } = await supabase
    .from("animals")
    .select("id, name, active, alert_note")
    .eq("id", payload.animalId)
    .maybeSingle();
  if (!animal) throw new Error("Dog not found.");
  if (animal.active === false) {
    throw new Error(`${animal.name} is marked inactive${animal.alert_note ? ` — ${animal.alert_note}` : ""}. Reactivate on the dog's profile first.`);
  }

  const { data: facility } = await supabase.from("facilities").select("timezone").eq("id", session.facilityId).maybeSingle();
  const tz = facility?.timezone ?? "America/Los_Angeles";
  const todayYmd = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());

  // Duplicate guard.
  const { data: existing } = await supabase
    .from("reservations")
    .select("id, status, start_date")
    .eq("facility_id", session.facilityId)
    .eq("animal_id", payload.animalId)
    .in("status", ["booked", "checked_in"])
    .gte("end_date", new Date(Date.now() - 86400000).toISOString())
    .order("start_date", { ascending: true });
  for (const r of (existing ?? []) as { id: string; status: string; start_date: string }[]) {
    if (r.status === "checked_in") return { reservationId: r.id, reused: true };
    if (String(r.start_date).slice(0, 10) === todayYmd) {
      const { error } = await supabase
        .from("reservations")
        .update({ status: "checked_in", checked_in_at: new Date().toISOString() })
        .eq("id", r.id);
      if (error) throw new Error(error.message);
      await supabase.from("reservation_history").insert({
        reservation_id: r.id,
        action: "checked_in",
        details: "Walk-in — existing booking for today used",
        performed_by: session.staffName ?? null,
      });
      revalidatePath("/reservations");
      return { reservationId: r.id, reused: true };
    }
  }

  const now = new Date();
  const time = /^\d{2}:\d{2}$/.test(payload.pickupTime) ? payload.pickupTime : DEFAULT_PICKUP;
  let end = zonedTimeToUtc(todayYmd, time, tz);
  // Pickup already in the past (late-evening walk-in)? Give it an hour.
  if (end.getTime() <= now.getTime()) end = new Date(now.getTime() + 60 * 60000);

  const { data: created, error } = await supabase
    .from("reservations")
    .insert({
      facility_id: session.facilityId,
      animal_id: payload.animalId,
      reservation_type_id: payload.reservationTypeId,
      lodging_area_id: payload.lodgingAreaId ?? null,
      start_date: now.toISOString(),
      end_date: end.toISOString(),
      status: "checked_in",
      checked_in_at: now.toISOString(),
      notes: payload.notes?.trim() ? `Walk-in. ${payload.notes.trim()}` : "Walk-in",
    })
    .select("id")
    .single();
  if (error || !created) throw new Error(error?.message ?? "Could not create the walk-in");

  await supabase.from("reservation_history").insert([
    { reservation_id: created.id, action: "created", details: "Walk-in (no prior booking)", performed_by: session.staffName ?? null },
    { reservation_id: created.id, action: "checked_in", details: null, performed_by: session.staffName ?? null },
  ]);
  revalidatePath("/reservations");
  revalidatePath("/lodging/calendar");
  return { reservationId: created.id as string, reused: false };
}
