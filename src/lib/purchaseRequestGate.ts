import { createHash, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "dawg_purchase_request";

// Shared PIN for the public /purchase-request form — separate from the staff
// facility session. Same trust model as ownerGate: an httpOnly cookie, not a
// hard security boundary. Krishan is fine with link-sharing; this just keeps
// casual visitors off the form when PURCHASE_REQUEST_PIN is set.
export function configuredPurchaseRequestPin(): string | null {
  const pin = process.env.PURCHASE_REQUEST_PIN?.trim();
  return pin || null;
}

export function purchaseRequestPinRequired(): boolean {
  return configuredPurchaseRequestPin() !== null;
}

function unlockToken(pin: string): string {
  return createHash("sha256").update(pin).digest("hex").slice(0, 32);
}

export async function isPurchaseRequestUnlocked(): Promise<boolean> {
  const pin = configuredPurchaseRequestPin();
  if (!pin) return true;
  const store = await cookies();
  const got = store.get(COOKIE_NAME)?.value;
  if (!got) return false;
  const expected = Buffer.from(unlockToken(pin));
  const actual = Buffer.from(got);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function pinsMatch(entered: string, expected: string): boolean {
  const a = Buffer.from(entered);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function setPurchaseRequestUnlocked() {
  const pin = configuredPurchaseRequestPin();
  if (!pin) return;
  const store = await cookies();
  store.set(COOKIE_NAME, unlockToken(pin), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}
