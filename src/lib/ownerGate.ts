import { cookies } from "next/headers";

const OWNER_COOKIE = "dawg_owner_unlock";

// Lightweight gate for owner-only pages (like commission rates), separate
// from the regular staff session. There's no staff role distinction in the
// session yet (PIN login is currently paused, everyone logs in as generic
// "Staff"), so this checks its own cookie instead — unlocked by entering the
// facility's Owner PIN (staff.role = 'owner'). Same trust model as the rest
// of the app: not a hard security boundary, just keeps this off the regular
// staff nav and out of casual reach.
export async function isOwnerUnlocked(facilityId: string): Promise<boolean> {
  const store = await cookies();
  return store.get(OWNER_COOKIE)?.value === facilityId;
}

export async function setOwnerUnlocked(facilityId: string) {
  const store = await cookies();
  store.set(OWNER_COOKIE, facilityId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12, // matches the 12hr staff session length
  });
}
