// Shared vaccine-expiration logic — used by the animal form, animal list,
// and animal detail page so the "expired / expiring soon / current" rule
// lives in exactly one place.

export type VaccineStatus = "expired" | "expiring_soon" | "current" | "unknown";

const EXPIRING_SOON_DAYS = 30;

export type VaccineExpirations = {
  rabies_expiration?: string | null;
  distemper_expiration?: string | null;
  bordetella_expiration?: string | null;
};

export const VACCINE_LABELS: Record<keyof VaccineExpirations, string> = {
  rabies_expiration: "Rabies",
  distemper_expiration: "Distemper",
  bordetella_expiration: "Bordetella",
};

// A single vaccine's status, given just its own expiration date.
export function vaccineStatus(expiration: string | null | undefined, today: Date = new Date()): VaccineStatus {
  if (!expiration) return "unknown";
  const exp = new Date(`${expiration}T00:00:00`);
  const todayStr = today.toISOString().slice(0, 10);
  const t = new Date(`${todayStr}T00:00:00`);
  const daysUntil = Math.floor((exp.getTime() - t.getTime()) / (1000 * 60 * 60 * 24));
  if (daysUntil < 0) return "expired";
  if (daysUntil <= EXPIRING_SOON_DAYS) return "expiring_soon";
  return "current";
}

// Worst-of-the-three overall status — this is what drives the shield color.
// "unknown" (never entered) is deliberately NOT treated as a red flag on its
// own; it only shows if nothing is worse, so a dog with no vaccine data
// doesn't visually look identical to one with an actually expired shot.
export function overallVaccineStatus(a: VaccineExpirations, today: Date = new Date()): VaccineStatus {
  const statuses = (Object.keys(VACCINE_LABELS) as (keyof VaccineExpirations)[]).map((k) => vaccineStatus(a[k], today));
  if (statuses.some((s) => s === "expired")) return "expired";
  if (statuses.some((s) => s === "expiring_soon")) return "expiring_soon";
  if (statuses.every((s) => s === "unknown")) return "unknown";
  return "current";
}

export function vaccineShield(status: VaccineStatus): { icon: string; label: string; className: string } {
  switch (status) {
    case "expired":
      return { icon: "🔴", label: "Vaccines expired", className: "text-red-600 dark:text-red-400" };
    case "expiring_soon":
      return { icon: "🟡", label: "Vaccines expiring soon", className: "text-amber-600 dark:text-amber-400" };
    case "current":
      return { icon: "🟢", label: "Vaccines current", className: "text-green-600 dark:text-green-400" };
    case "unknown":
      return { icon: "", label: "No vaccine info on file", className: "text-slate-400 dark:text-slate-500" };
  }
}
