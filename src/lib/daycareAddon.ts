// Daycare days on a boarding stay (Mark, Sep 10). A boarding dog can join
// daycare on specific days of its stay; each day bills the facility's
// "daycare add-on" pricing rule (a flat_fee rule whose label mentions
// daycare — Don Doggos: $10/day; other facilities set their own or none).

export type RuleLike = { rule_type: string; label: string; amount: number | string };

export function isDaycareAddonRule(rule: RuleLike): boolean {
  return rule.rule_type === "flat_fee" && /daycare/i.test(rule.label);
}

/** YYYY-MM-DD for every calendar day of a stay, arrival through departure day. */
export function stayDays(startYmd: string, endYmd: string): string[] {
  if (!startYmd) return [];
  const out: string[] = [];
  const start = new Date(`${startYmd}T12:00:00`);
  const end = new Date(`${(endYmd || startYmd)}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  for (let d = new Date(start); d <= end && out.length < 120; d.setDate(d.getDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Tolerant parse of the jsonb column — always a sorted, de-duplicated list of YYYY-MM-DD. */
export function parseDaycareDates(raw: unknown): string[] {
  let arr: unknown = raw;
  if (typeof raw === "string") {
    try {
      arr = JSON.parse(raw);
    } catch {
      arr = [];
    }
  }
  if (!Array.isArray(arr)) return [];
  const set = new Set<string>();
  for (const v of arr) {
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) set.add(v);
  }
  return [...set].sort();
}

export function fmtDaycareDay(ymd: string): string {
  return new Date(`${ymd}T12:00:00`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

/** "Sep 12, 13, 15" — compact list for summaries and invoice lines. */
export function describeDaycareDates(dates: string[]): string {
  if (dates.length === 0) return "";
  const byMonth = new Map<string, string[]>();
  for (const d of dates) {
    const dt = new Date(`${d}T12:00:00`);
    const m = dt.toLocaleDateString([], { month: "short" });
    byMonth.set(m, [...(byMonth.get(m) ?? []), String(dt.getDate())]);
  }
  return [...byMonth.entries()].map(([m, days]) => `${m} ${days.join(", ")}`).join("; ");
}
