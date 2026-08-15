// Live "who's checked in right now" from Gingr, during the migration period.
//
// Goes through the gingr-proxy Supabase edge function — Gingr API keys live
// ONLY there (this repo is public). Fail-soft by design: if Gingr or the
// proxy is down, pages render their own data and show a note instead of
// erroring.

export type GingrCheckin = {
  gingrReservationId: string;
  gingrAnimalId: string;
  animalName: string | null;
  breed: string | null;
  ownerName: string | null;
  type: string | null;
  checkInDate: string | null;
  startDate: string;
  endDate: string;
  medicines: string | null;
  allergies: string | null;
  notes: string | null;
};

export async function getGingrCheckins(
  facilitySlug: string
): Promise<{ checkins: GingrCheckin[]; error: string | null }> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !anon) return { checkins: [], error: "Supabase env missing" };
  try {
    const res = await fetch(`${base}/functions/v1/gingr-proxy?facility=${encodeURIComponent(facilitySlug)}`, {
      headers: { Authorization: `Bearer ${anon}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { checkins: [], error: `Gingr proxy ${res.status}` };
    const j = (await res.json()) as { checkins?: GingrCheckin[] };
    return { checkins: j.checkins ?? [], error: null };
  } catch (e) {
    return { checkins: [], error: e instanceof Error ? e.message : "Gingr unreachable" };
  }
}
