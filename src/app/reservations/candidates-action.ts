"use server";

import { getSession } from "@/lib/session";
import { getCheckInCandidates, type CheckInCandidate } from "@/lib/checkinCandidates";

// Fetched on demand when the Quick Check-in dialog opens, instead of on every
// single page render. Previously FacilityHeader awaited this query before any
// page could stream, so every navigation paid for a list almost nobody opened.
export async function fetchCheckInCandidates(): Promise<CheckInCandidate[]> {
  const session = await getSession();
  if (!session) return [];
  return getCheckInCandidates(session.facilityId);
}
