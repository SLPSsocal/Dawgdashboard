"use server";

import { createClient } from "@/lib/supabase/server";

// "View Estimate" for the booking form (Mark + Alan S, Sep 3 — Gingr shows
// the expected cost before the reservation is saved so staff can quote the
// parent). Mirrors CheckoutCalculator's rules so the number staff quote is
// the number checkout produces: current rate from rate history, multi-day
// discount, additional-dog tiers per household rank, automatic late
// check-out fee, and the quoted grooming price. Retail/tax aren't known yet
// at booking time, so they're not included.

export type EstimateLine = {
  label: string;
  amount: number;
  kind: "base" | "discount" | "fee" | "service";
};

export type BookingEstimate = {
  lines: EstimateLine[];
  total: number;
  units: number;
  unitLabel: string; // "night" | "day" | "session"
  hint: string | null; // e.g. the next multi-day tier they're close to
};

type Rule = {
  id: string;
  reservation_type_id: string | null;
  label: string;
  rule_type: "multi_day_discount" | "additional_animal_discount" | "flat_fee";
  threshold: number | null;
  method: "dollar" | "percent";
  amount: number;
};

function daysBetween(startYmd: string, endYmd: string): number {
  return Math.round(
    (new Date(`${endYmd}T12:00:00`).getTime() - new Date(`${startYmd}T12:00:00`).getTime()) / 86400000
  );
}

export async function estimateBooking(input: {
  facilityId: string;
  reservationTypeId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD (same as start for slot-based types)
  pickUpTime: string | null; // HH:MM — drives the late check-out fee for overnight stays
  dogNames: string[]; // primary first; length = household dogs on this booking
  groomingPrice: number | null;
  serviceName: string | null;
}): Promise<BookingEstimate | null> {
  const supabase = createClient();
  const { data: type } = await supabase
    .from("reservation_types")
    .select("id, name, category, rate_unit, base_rate")
    .eq("id", input.reservationTypeId)
    .maybeSingle();
  if (!type) return null;

  const rateUnit: string = type.rate_unit ?? "per_session";
  const isStay = rateUnit === "per_night" || rateUnit === "per_day";
  const unitLabel = rateUnit === "per_night" ? "night" : rateUnit === "per_day" ? "day" : "session";
  const units = isStay ? Math.max(1, daysBetween(input.startDate, input.endDate)) : 1;

  const [{ data: rateRows }, { data: ruleRows }] = await Promise.all([
    supabase
      .from("reservation_type_rates")
      .select("rate, effective_date")
      .eq("reservation_type_id", type.id)
      .lte("effective_date", input.startDate)
      .order("effective_date", { ascending: false })
      .limit(1),
    supabase
      .from("pricing_rules")
      .select("id, reservation_type_id, label, rule_type, threshold, method, amount, effective_date, retired_date")
      .eq("facility_id", input.facilityId)
      .lte("effective_date", input.startDate)
      .or(`retired_date.is.null,retired_date.gt.${input.startDate}`),
  ]);

  const rate = rateRows && rateRows.length > 0 ? Number(rateRows[0].rate) : Number(type.base_rate ?? 0);
  const rules = ((ruleRows ?? []) as Rule[]).filter(
    (r) => !r.reservation_type_id || r.reservation_type_id === type.id
  );
  const multiDay = rules.filter((r) => r.rule_type === "multi_day_discount");
  const bestMultiDay =
    multiDay
      .filter((r) => units >= (r.threshold ?? Infinity))
      .sort((a, b) => (b.threshold ?? 0) - (a.threshold ?? 0))[0] ?? null;
  const addlTiers = rules
    .filter((r) => r.rule_type === "additional_animal_discount")
    .sort((a, b) => (a.threshold ?? 0) - (b.threshold ?? 0));
  const lateFee =
    rateUnit === "per_night" && input.pickUpTime && input.pickUpTime > "12:15"
      ? rules.find((r) => r.rule_type === "flat_fee" && /late\s*check[- ]?out/i.test(r.label)) ?? null
      : null;

  const isGrooming = type.category === "grooming";
  const lines: EstimateLine[] = [];
  const dogs = input.dogNames.length > 0 ? input.dogNames : ["Dog"];
  const many = dogs.length > 1;
  const who = (name: string) => (many ? `${name} — ` : "");

  dogs.forEach((name, i) => {
    const rank = i + 1;
    const baseTotal = rate * units;
    // A grooming type bills $0/session; its price is the service line.
    if (!(isGrooming && rate === 0)) {
      lines.push({
        label: `${who(name)}${units} × ${unitLabel} @ $${rate.toFixed(2)}`,
        amount: baseTotal,
        kind: "base",
      });
    }
    if (bestMultiDay) {
      const amt = bestMultiDay.method === "percent" ? baseTotal * (Number(bestMultiDay.amount) / 100) : Number(bestMultiDay.amount);
      lines.push({ label: `${who(name)}${bestMultiDay.label}`, amount: amt, kind: "discount" });
    }
    if (rank > 1 && addlTiers.length > 0) {
      const rule = addlTiers[Math.min(rank - 2, addlTiers.length - 1)];
      const amt = rule.method === "percent" ? rate * units * (Number(rule.amount) / 100) : Number(rule.amount) * units;
      lines.push({ label: `${who(name)}${rule.label}`, amount: amt, kind: "discount" });
    }
    if (lateFee) {
      lines.push({ label: `${who(name)}${lateFee.label}`, amount: Number(lateFee.amount), kind: "fee" });
    }
    if (isGrooming && input.groomingPrice != null && input.groomingPrice > 0) {
      lines.push({
        label: `${who(name)}${input.serviceName ?? "Grooming"}`,
        amount: input.groomingPrice,
        kind: "service",
      });
    }
  });

  const total = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;

  let hint: string | null = null;
  if (isStay && !bestMultiDay) {
    const next = multiDay
      .filter((r) => units < (r.threshold ?? Infinity))
      .sort((a, b) => (a.threshold ?? 0) - (b.threshold ?? 0))[0];
    if (next) hint = `${next.label} starts at ${next.threshold} ${unitLabel}s — this stay is ${units}.`;
  }

  return { lines, total, units, unitLabel, hint };
}
