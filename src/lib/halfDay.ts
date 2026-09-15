import { createClient } from "@/lib/supabase/server";

// Half Day → Full Day auto-conversion (Krishan, Sep 15).
//
// A half-day daycare dog that stays past the facility's half-day limit is
// simply a full-day dog. Rather than relying on staff to remember the
// "Convert to Full Day" fee at checkout, the reservation itself flips to the
// Full Day type once the dog has been on site longer than the limit, so the
// board, checkout and reports all agree.
//
// The limit comes from the Half Day type's existing pricing rule, whose label
// reads like "Convert to Full Day (out after 260min)"; if a facility has no
// such rule the default is 260 minutes (4h20). Full Day is the sibling daycare
// type whose name contains "full".

export const DEFAULT_HALF_DAY_MINUTES = 260;

type TypeRow = { id: string; name: string; category: string | null };

export type HalfDayConfig = {
  halfDayTypeIds: Set<string>;
  fullDayTypeId: string | null;
  fullDayName: string | null;
  limitMinutes: number;
};

export async function getHalfDayConfig(facilityId: string): Promise<HalfDayConfig> {
  const supabase = createClient();
  const { data: types } = await supabase
    .from("reservation_types")
    .select("id, name, category")
    .eq("facility_id", facilityId)
    .eq("active", true)
    .eq("category", "daycare");
  const rows = (types ?? []) as TypeRow[];
  const half = rows.filter((t) => /half/i.test(t.name) && !/suite/i.test(t.name));
  const full = rows.find((t) => /full/i.test(t.name) && !/suite/i.test(t.name)) ?? null;

  let limit = DEFAULT_HALF_DAY_MINUTES;
  if (half.length) {
    const { data: rules } = await supabase
      .from("pricing_rules")
      .select("label")
      .in("reservation_type_id", half.map((t) => t.id))
      .eq("active", true)
      .ilike("label", "%full day%");
    for (const r of (rules ?? []) as { label: string }[]) {
      const m = r.label.match(/(\d{2,3})\s*min/i);
      if (m) {
        limit = Number(m[1]);
        break;
      }
    }
  }
  return { halfDayTypeIds: new Set(half.map((t) => t.id)), fullDayTypeId: full?.id ?? null, fullDayName: full?.name ?? null, limitMinutes: limit };
}

export type ConvertibleRow = {
  id: string;
  reservation_type_id: string | null;
  checked_in_at: string | null;
  status: string;
};

/**
 * Flip any checked-in Half Day reservation that has exceeded the limit to
 * Full Day. `asOf` lets checkout evaluate against the actual pickup time.
 * Returns the ids that were converted plus the Full Day type they now carry.
 */
export async function autoConvertHalfDays(
  facilityId: string,
  rows: ConvertibleRow[],
  asOf: Date = new Date(),
  performedBy: string | null = null
): Promise<{ converted: string[]; fullDayTypeId: string | null; fullDayName: string | null }> {
  const none = { converted: [] as string[], fullDayTypeId: null, fullDayName: null };
  const candidates = rows.filter((r) => r.status === "checked_in" && r.checked_in_at && r.reservation_type_id);
  if (candidates.length === 0) return none;
  const cfg = await getHalfDayConfig(facilityId);
  if (!cfg.fullDayTypeId || cfg.halfDayTypeIds.size === 0) return none;

  const supabase = createClient();
  const converted: string[] = [];
  for (const r of candidates) {
    if (!cfg.halfDayTypeIds.has(r.reservation_type_id as string)) continue;
    const minutes = (asOf.getTime() - new Date(r.checked_in_at as string).getTime()) / 60000;
    if (minutes <= cfg.limitMinutes) continue;
    const { error } = await supabase.from("reservations").update({ reservation_type_id: cfg.fullDayTypeId }).eq("id", r.id);
    if (error) continue;
    await supabase.from("reservation_history").insert({
      reservation_id: r.id,
      action: "modified",
      details: `Half Day → ${cfg.fullDayName ?? "Full Day"} (on site ${Math.round(minutes)} min, over the ${cfg.limitMinutes}-min half-day limit)`,
      performed_by: performedBy ?? "System",
    });
    converted.push(r.id);
  }
  return { converted, fullDayTypeId: cfg.fullDayTypeId, fullDayName: cfg.fullDayName };
}
