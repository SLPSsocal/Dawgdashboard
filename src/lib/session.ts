import { cookies } from "next/headers";

export type Session = {
  staffId: string;
  staffName: string;
  facilityId: string;
  facilitySlug: string;
  facilityName: string;
};

const COOKIE_NAME = "dawg_session";

// Simple trusted-app-layer session (PIN login, no Supabase Auth) — mirrors the
// low-friction model already in production for PawFeed. Not encrypted; this is
// an internal staff kiosk cookie, not a security boundary by itself. The real
// facility isolation happens because every query in this app is written to
// filter by session.facilityId.
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, "base64").toString("utf-8"));
  } catch {
    return null;
  }
}

export async function setSession(session: Session) {
  const store = await cookies();
  const raw = Buffer.from(JSON.stringify(session), "utf-8").toString("base64");
  store.set(COOKIE_NAME, raw, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12, // 12hr shift-length session
  });
}

export async function clearSession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
