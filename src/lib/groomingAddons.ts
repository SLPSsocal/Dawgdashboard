// Grooming add-ons: extra services (de-shed, flea bath, teeth, special
// shampoo …) booked alongside the main grooming service. Stored on
// reservations.grooming_addons as [{ name, price }] and billed as separate
// grooming lines at checkout.
export type GroomingAddon = { name: string; price: number };

/** Normalises whatever came back from Postgres / a form into a clean list. */
export function parseGroomingAddons(raw: unknown): GroomingAddon[] {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const out: GroomingAddon[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const name = String((item as { name?: unknown }).name ?? "").trim();
    const price = Number((item as { price?: unknown }).price ?? 0);
    if (!name) continue;
    out.push({ name, price: Number.isFinite(price) && price >= 0 ? Math.round(price * 100) / 100 : 0 });
  }
  return out;
}

export function addonsTotal(addons: GroomingAddon[]): number {
  return Math.round(addons.reduce((s, a) => s + (a.price || 0), 0) * 100) / 100;
}

/** "De-shed ($25), Flea bath ($15)" — for calendar chips, run cards, history. */
export function describeAddons(addons: GroomingAddon[]): string {
  return addons.map((a) => (a.price > 0 ? `${a.name} ($${a.price.toFixed(0)})` : a.name)).join(", ");
}
