import type { Session } from "@/lib/session";
import { getCheckInCandidates } from "@/lib/checkinCandidates";
import QuickActionBar from "@/components/QuickActionBar";

// Rendered inside each page's own content area (right under the header),
// not as part of the sticky top chrome — keeps the identity strip slim and
// gives the nav buttons the full page width to breathe instead of being
// squeezed into the header row.
export default async function PageQuickActions({ session }: { session: Session }) {
  const candidates = await getCheckInCandidates(session.facilityId);
  return <QuickActionBar candidates={candidates} />;
}
