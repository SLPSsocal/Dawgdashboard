"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Suite-by-date on one reservation (Mark, Sep 14 — "like Gingr"). A stay
// with no segments lives entirely in reservations.lodging_area_id. Once
// split, its segments cover the stay end-to-end and lodging_area_id mirrors
// the segment for today (or the first one) so the board, run card, feeding
// log and anything else reading the single column keep working.

export type LodgingSegment = {
  id: string;
  reservationId: string;
  lodgingAreaId: string | null;
  lodgingName: string | null;
  startYmd: string;
  endYmd: string; // exclusive
};

type SegRow = {
  id: string;
  reservation_id: string;
  lodging_area_id: string | null;
  start_ymd: string;
  end_ymd: string;
  lodging_areas: { name: string } | null;
};

const SEG_COLS = "id, reservation_id, lodging_area_id, start_ymd, end_ymd, lodging_areas ( name )";

function toSeg(r: SegRow): LodgingSegment {
  return {
    id: r.id,
    reservationId: r.reservation_id,
    lodgingAreaId: r.lodging_area_id,
    lodgingName: r.lodging_areas?.name ?? null,
    startYmd: String(r.start_ymd).slice(0, 10),
    endYmd: String(r.end_ymd).slice(0, 10),
  };
}

function refresh(reservationId?: string) {
  revalidatePath("/reservations");
  revalidatePath("/lodging/calendar");
  if (reservationId) revalidatePath(`/reservations/${reservationId}`);
}

async function logHistory(reservationId: string, details: string, performedBy: string | null) {
  const supabase = createClient();
  await supabase.from("reservation_history").insert({ reservation_id: reservationId, action: "modified", details, performed_by: performedBy });
}

export async function getLodgingSegments(reservationId: string): Promise<LodgingSegment[]> {
  const supabase = createClient();
  const { data } = await supabase.from("reservation_lodging_segments").select(SEG_COLS).eq("reservation_id", reservationId).order("start_ymd");
  return ((data as unknown as SegRow[]) ?? []).map(toSeg);
}

/** Segments for many reservations at once (board / calendar / availability). */
export async function getLodgingSegmentsFor(reservationIds: string[]): Promise<Map<string, LodgingSegment[]>> {
  const out = new Map<string, LodgingSegment[]>();
  if (reservationIds.length === 0) return out;
  const supabase = createClient();
  for (let i = 0; i < reservationIds.length; i += 200) {
    const { data } = await supabase
      .from("reservation_lodging_segments")
      .select(SEG_COLS)
      .in("reservation_id", reservationIds.slice(i, i + 200))
      .order("start_ymd");
    for (const r of (data as unknown as SegRow[]) ?? []) {
      const s = toSeg(r);
      out.set(s.reservationId, [...(out.get(s.reservationId) ?? []), s]);
    }
  }
  return out;
}

/** Which segment applies on a given day (or the first one if the day is before the stay). */
export async function segmentForDay(segments: LodgingSegment[], ymd: string): Promise<LodgingSegment | null> {
  if (segments.length === 0) return null;
  return segments.find((s) => ymd >= s.startYmd && ymd < s.endYmd) ?? (ymd < segments[0].startYmd ? segments[0] : segments[segments.length - 1]);
}

// Keep reservations.lodging_area_id = today's segment (or the first).
async function syncSingleColumn(reservationId: string, segments: LodgingSegment[], tz: string) {
  const supabase = createClient();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  const cur = await segmentForDay(segments, today);
  await supabase.from("reservations").update({ lodging_area_id: cur?.lodgingAreaId ?? null }).eq("id", reservationId);
}

async function loadStay(reservationId: string) {
  const supabase = createClient();
  const { data: res } = await supabase
    .from("reservations")
    .select("id, start_date, end_date, lodging_area_id, facilities ( timezone ), lodging_areas ( name )")
    .eq("id", reservationId)
    .maybeSingle();
  if (!res) throw new Error("Reservation not found");
  const tz = (res as unknown as { facilities: { timezone: string } | null }).facilities?.timezone ?? "America/Los_Angeles";
  const fmt = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso));
  const startYmd = fmt(res.start_date);
  let endYmd = fmt(res.end_date);
  if (endYmd <= startYmd) {
    // Same-day stay (daycare-style) — treat as one night so a segment can exist.
    const d = new Date(`${startYmd}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    endYmd = d.toISOString().slice(0, 10);
  }
  return {
    tz,
    startYmd,
    endYmd,
    lodgingAreaId: res.lodging_area_id as string | null,
    lodgingName: (res as unknown as { lodging_areas: { name: string } | null }).lodging_areas?.name ?? null,
  };
}

async function areaName(id: string | null): Promise<string> {
  if (!id) return "Unassigned";
  const supabase = createClient();
  const { data } = await supabase.from("lodging_areas").select("name").eq("id", id).maybeSingle();
  return data?.name ?? "Unknown suite";
}

/**
 * From `fromYmd` to the end of the stay, use `lodgingAreaId`. Everything
 * before keeps whatever it had (the single column if not yet split, or the
 * existing segments, trimmed). Splitting at the stay's first day just
 * changes the whole stay.
 */
export async function splitLodgingFrom(
  reservationId: string,
  fromYmd: string,
  lodgingAreaId: string | null,
  performedBy?: string | null
): Promise<LodgingSegment[]> {
  const supabase = createClient();
  const stay = await loadStay(reservationId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromYmd)) throw new Error("Pick a date.");
  if (fromYmd < stay.startYmd || fromYmd >= stay.endYmd) {
    throw new Error(`Pick a date within the stay (${stay.startYmd} to ${stay.endYmd}).`);
  }

  let existing = await getLodgingSegments(reservationId);
  if (existing.length === 0) {
    // Not split yet: the whole stay is one implicit segment.
    existing = [
      { id: "", reservationId, lodgingAreaId: stay.lodgingAreaId, lodgingName: stay.lodgingName, startYmd: stay.startYmd, endYmd: stay.endYmd },
    ];
  }

  // Keep what's before `from`, trimmed; replace everything from `from` on.
  const kept = existing
    .filter((s) => s.startYmd < fromYmd)
    .map((s) => ({ lodging_area_id: s.lodgingAreaId, start_ymd: s.startYmd, end_ymd: s.endYmd < fromYmd ? s.endYmd : fromYmd }));
  const rows = [...kept, { lodging_area_id: lodgingAreaId, start_ymd: fromYmd, end_ymd: stay.endYmd }]
    // Merge neighbours that ended up in the same suite.
    .reduce<{ lodging_area_id: string | null; start_ymd: string; end_ymd: string }[]>((acc, r) => {
      const last = acc[acc.length - 1];
      if (last && last.lodging_area_id === r.lodging_area_id && last.end_ymd === r.start_ymd) {
        last.end_ymd = r.end_ymd;
        return acc;
      }
      acc.push({ ...r });
      return acc;
    }, [])
    .map((r) => ({ ...r, reservation_id: reservationId }));

  await supabase.from("reservation_lodging_segments").delete().eq("reservation_id", reservationId);
  if (rows.length > 1) {
    const { error } = await supabase.from("reservation_lodging_segments").insert(rows);
    if (error) throw new Error(error.message);
  } else {
    // Collapsed back to one suite — no segments needed.
    await supabase.from("reservations").update({ lodging_area_id: rows[0]?.lodging_area_id ?? null }).eq("id", reservationId);
  }

  const segments = await getLodgingSegments(reservationId);
  if (segments.length) await syncSingleColumn(reservationId, segments, stay.tz);

  const to = await areaName(lodgingAreaId);
  await logHistory(
    reservationId,
    rows.length > 1
      ? `Lodging from ${fromYmd}: → ${to} (suite changes mid-stay: ${rows.map((r) => `${r.start_ymd}`).join(", ")})`
      : `Lodging: → ${to} (whole stay)`,
    performedBy ?? null
  );
  refresh(reservationId);
  return segments;
}

/** Undo a split: whole stay back in one suite. */
export async function clearLodgingSegments(reservationId: string, lodgingAreaId: string | null, performedBy?: string | null) {
  const supabase = createClient();
  await supabase.from("reservation_lodging_segments").delete().eq("reservation_id", reservationId);
  await supabase.from("reservations").update({ lodging_area_id: lodgingAreaId }).eq("id", reservationId);
  await logHistory(reservationId, `Lodging: whole stay → ${await areaName(lodgingAreaId)} (mid-stay split removed)`, performedBy ?? null);
  refresh(reservationId);
}

/** Move ONE segment to another suite (lodging-calendar drag on a split stay). */
export async function moveLodgingSegment(segmentId: string, lodgingAreaId: string | null, performedBy?: string | null) {
  const supabase = createClient();
  const { data: seg } = await supabase.from("reservation_lodging_segments").select(SEG_COLS).eq("id", segmentId).maybeSingle();
  if (!seg) throw new Error("Segment not found");
  const s = toSeg(seg as unknown as SegRow);
  const { error } = await supabase.from("reservation_lodging_segments").update({ lodging_area_id: lodgingAreaId }).eq("id", segmentId);
  if (error) throw new Error(error.message);
  const stay = await loadStay(s.reservationId);
  const segments = await getLodgingSegments(s.reservationId);
  await syncSingleColumn(s.reservationId, segments, stay.tz);
  await logHistory(s.reservationId, `Lodging ${s.startYmd}→${s.endYmd}: ${s.lodgingName ?? "Unassigned"} → ${await areaName(lodgingAreaId)}`, performedBy ?? null);
  refresh(s.reservationId);
}
