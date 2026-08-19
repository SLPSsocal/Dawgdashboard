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
  gingrOwnerId: string | null;
  ownerFirstName: string | null;
  ownerLastName: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  ownerPhone: string | null;
  type: string | null;
  checkInDate: string | null;
  checkOutDate: string | null;
  startDate: string;
  endDate: string;
  medicines: string | null;
  allergies: string | null;
  notes: string | null;
};

export type GingrDay = {
  checkins: GingrCheckin[];
  expected: GingrCheckin[];
  checkedOut: GingrCheckin[];
  error: string | null;
};

export async function getGingrDay(facilitySlug: string): Promise<GingrDay> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const empty = { checkins: [], expected: [], checkedOut: [] };
  if (!base || !anon) return { ...empty, error: "Supabase env missing" };
  try {
    const res = await fetch(`${base}/functions/v1/gingr-proxy?facility=${encodeURIComponent(facilitySlug)}`, {
      headers: { Authorization: `Bearer ${anon}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ...empty, error: `Gingr proxy ${res.status}` };
    const j = (await res.json()) as Partial<GingrDay>;
    return { checkins: j.checkins ?? [], expected: j.expected ?? [], checkedOut: j.checkedOut ?? [], error: null };
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : "Gingr unreachable" };
  }
}

/** Back-compat helper for callers that only need the checked-in list. */
export async function getGingrCheckins(facilitySlug: string) {
  const day = await getGingrDay(facilitySlug);
  return { checkins: day.checkins, error: day.error };
}
