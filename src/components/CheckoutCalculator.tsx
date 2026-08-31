"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeCheckout, type CheckoutLineItem } from "@/app/reservations/checkout-actions";
import { chargeSavedCard } from "@/app/billing/helcim-actions";
import HelcimCardModal from "@/components/HelcimCardModal";
import Link from "next/link";

type SavedCard = { id: string; card_brand: string | null; last4: string | null };

type PricingRule = {
  id: string;
  reservation_type_id: string | null;
  label: string;
  rule_type: "multi_day_discount" | "additional_animal_discount" | "flat_fee";
  threshold: number | null;
  method: "dollar" | "percent";
  amount: number;
};

type GroomingItem = { name: string; min_price: number | null; max_price: number | null };
type RememberedPrice = { service_name: string; price: number };

/** Another household dog checking out on this same (single, family) invoice. */
export type ExtraDog = {
  reservationId: string;
  animalId: string;
  animalName: string;
  baseRate: number;
  rateUnit: string;
  startDate: string;
  endDate: string;
  rank: number;
  typeName: string | null;
  isGrooming: boolean;
  bookedGroomingService: string | null;
  rules: PricingRule[];
  rememberedPrices: RememberedPrice[];
  initialRetailRows: { itemId: string; qty: number }[];
  careNote: string | null;
};

type ExtraDogState = {
  include: boolean;
  stayStart: string; // YYYY-MM-DD
  stayEnd: string;
  groomingRows: { service: string; price: number }[];
  retailRows: { itemId: string; qty: number }[];
  checkedFees: string[]; // flat-fee rule ids
};
type RetailItem = { id: string; name: string; price: number; taxable: boolean };
type OpenItemType = "Other" | "Price Adjustment" | "Tip";

const NEW_CARD_VALUE = "__new__";

// "" = collect nothing now; "card:<id>" = a saved card; the rest are
// non-gateway tenders recorded straight against the invoice.
type PaymentMethodKey = "" | "cash" | "store_credit" | "admin_credit" | string;
type PaymentRow = { method: PaymentMethodKey; amount: string };

function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}
const OPEN_ITEM_TYPES: OpenItemType[] = ["Other", "Price Adjustment", "Tip"];

export default function CheckoutCalculator({
  reservationId,
  facilityId,
  animalId,
  parentId,
  animalName,
  baseRate,
  rateUnit,
  units,
  startDate,
  endDate,
  rules,
  groomingItems,
  rememberedPrices,
  savedCards,
  retailItems,
  taxRate,
  initialRetailRows,
  careNote,
  householdRank,
  householdSize,
  bookedGroomingService,
  isGroomingReservation,
  extraDogs = [],
}: {
  reservationId: string;
  facilityId: string;
  animalId: string;
  parentId: string | null;
  animalName: string;
  baseRate: number;
  rateUnit: string;
  units: number;
  startDate: string;
  endDate: string;
  rules: PricingRule[];
  groomingItems: GroomingItem[];
  rememberedPrices: RememberedPrice[];
  savedCards: SavedCard[];
  retailItems: RetailItem[];
  taxRate: number;
  /** Pre-filled from the feeding log (house fresh food, CBD, …) — staff can adjust. */
  initialRetailRows?: { itemId: string; qty: number }[];
  careNote?: string | null;
  /** This dog's position (1-based) among the household's overlapping stays. */
  householdRank?: number;
  /** How many of the household's dogs are here across this window. */
  householdSize?: number;
  /** The grooming service booked on THIS reservation — prefills as a ticket line. */
  bookedGroomingService?: string | null;
  /** True when this reservation's type is a grooming appointment. */
  isGroomingReservation?: boolean;
  /** Household dogs still checked in — they join this ticket, one invoice per family. */
  extraDogs?: ExtraDog[];
}) {
  const [numDogs, setNumDogs] = useState(householdRank ?? 1);
  const autoDetectedDogs = (householdSize ?? 1) > 1;
  const dogCountEdited = numDogs !== (householdRank ?? 1);
  // Late checkout is automatic: boarding pickups after 12:15 PM (noon + 15min
  // grace) pre-check the late fee so nobody has to remember the dropdown.
  // Staff can still untick it for an exception.
  const [checkedFees, setCheckedFees] = useState<Set<string>>(() => {
    if (rateUnit !== "per_night") return new Set();
    const nowPT = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    }).formatToParts(new Date());
    const h = Number(nowPT.find((p) => p.type === "hour")?.value ?? 0);
    const m = Number(nowPT.find((p) => p.type === "minute")?.value ?? 0);
    if (h * 60 + m < 12 * 60 + 15) return new Set();
    return new Set(
      rules
        .filter((r) => r.rule_type === "flat_fee" && /late\s*check[- ]?out/i.test(r.label))
        .map((r) => r.id)
    );
  });
  // Editable pick-up time (Kath, Aug 30) — defaults to "now" in facility
  // time, and drives the automatic late-checkout fee instead of the fee
  // being frozen to whenever the page happened to load.
  const nowPTHHMM = (() => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    const h = parts.find((p) => p.type === "hour")?.value ?? "12";
    const m = parts.find((p) => p.type === "minute")?.value ?? "00";
    return `${h === "24" ? "00" : h}:${m}`;
  })();
  const [pickupTime, setPickupTime] = useState(nowPTHHMM);

  const autoLateFeeIds = useMemo(
    () =>
      new Set(
        rateUnit === "per_night"
          ? rules.filter((r) => r.rule_type === "flat_fee" && /late\s*check[- ]?out/i.test(r.label)).map((r) => r.id)
          : []
      ),
    [rules, rateUnit]
  );
  // The service booked on this reservation starts ON the ticket, price
  // prefilled from the quote/history — it used to be invisible here, so staff
  // couldn't tell a grooming reservation from a plain daycare one, let alone
  // adjust its price (Kath + Krishan, Aug 30).
  const [groomingRows, setGroomingRows] = useState<{ service: string; price: number }[]>(() => {
    if (!bookedGroomingService) return [];
    const remembered = rememberedPrices.find((p) => p.service_name === bookedGroomingService);
    const item = groomingItems.find((g) => g.name === bookedGroomingService);
    return [{ service: bookedGroomingService, price: remembered?.price ?? item?.min_price ?? 0 }];
  });
  const [retailRows, setRetailRows] = useState<{ itemId: string; qty: number }[]>(initialRetailRows ?? []);
  const [openItems, setOpenItems] = useState<{ type: OpenItemType; description: string; amount: number }[]>([]);
  // Tip-on base (design: TIP ON — Grooming ($67) vs Whole ticket ($427) with
  // 15/18/20/25% quick buttons that show the dollar amount before you tap).
  const [tipBase, setTipBase] = useState<"grooming" | "ticket">("grooming");
  const [openType, setOpenType] = useState<OpenItemType>("Tip");
  const [openDesc, setOpenDesc] = useState("");
  const [openAmount, setOpenAmount] = useState("");
  const [payments, setPayments] = useState<PaymentRow[]>([{ method: "", amount: "" }]);
  const [saveNewCard, setSaveNewCard] = useState(false);

  // Editable stay window. Departure defaults to TODAY for per-night/per-day
  // stays: checkout happens the day the dog leaves, and billing the booked
  // end date instead of the real one silently over- or under-charges.
  const isStayBilling = rateUnit === "per_night" || rateUnit === "per_day";
  // Facility-local dates, not UTC slices — a 5pm PT departure is "tomorrow"
  // in UTC and was showing same-day daycare as Aug 10 → Aug 11.
  const ymdPT = (iso: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date(iso));
  const bookedStartYmd = ymdPT(startDate);
  const bookedEndYmd = ymdPT(endDate);
  const todayYmd = ymdPT(new Date().toISOString());
  const defaultEndYmd = isStayBilling && todayYmd > bookedStartYmd ? todayYmd : bookedEndYmd;
  const [stayStart, setStayStart] = useState(bookedStartYmd);
  const [stayEnd, setStayEnd] = useState(defaultEndYmd);
  const stayUnits = Math.max(
    1,
    Math.ceil((new Date(`${stayEnd}T00:00:00`).getTime() - new Date(`${stayStart}T00:00:00`).getTime()) / 86400000)
  );
  const effUnits = isStayBilling ? stayUnits : units;
  const datesAdjusted = isStayBilling && (stayStart !== bookedStartYmd || stayEnd !== bookedEndYmd);

  // ---- Household dogs on this ticket (one invoice per family). ----
  const lateFeeIdsOf = (dogRules: PricingRule[], unit: string) =>
    unit === "per_night"
      ? dogRules.filter((r) => r.rule_type === "flat_fee" && /late\s*check[- ]?out/i.test(r.label)).map((r) => r.id)
      : [];
  const [extras, setExtras] = useState<Record<string, ExtraDogState>>(() => {
    const init: Record<string, ExtraDogState> = {};
    const [nh, nm] = (() => {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(new Date());
      return [
        Number(parts.find((p) => p.type === "hour")?.value ?? 12) % 24,
        Number(parts.find((p) => p.type === "minute")?.value ?? 0),
      ];
    })();
    const lateNow = nh * 60 + nm >= 12 * 60 + 15;
    for (const d of extraDogs) {
      const dStart = ymdPT(d.startDate);
      const dEnd = ymdPT(d.endDate);
      const dStay = d.rateUnit === "per_night" || d.rateUnit === "per_day";
      const remembered = d.rememberedPrices.find((p) => p.service_name === d.bookedGroomingService);
      init[d.reservationId] = {
        include: true,
        stayStart: dStart,
        stayEnd: dStay && todayYmd > dStart ? todayYmd : dEnd,
        groomingRows: d.bookedGroomingService
          ? [{ service: d.bookedGroomingService, price: remembered?.price ?? 0 }]
          : [],
        retailRows: d.initialRetailRows,
        checkedFees: lateNow ? lateFeeIdsOf(d.rules, d.rateUnit) : [],
      };
    }
    return init;
  });
  function patchExtra(reservationId: string, patch: Partial<ExtraDogState>) {
    setExtras((prev) => ({ ...prev, [reservationId]: { ...prev[reservationId], ...patch } }));
  }
  const extraUnitsOf = (d: ExtraDog, s: ExtraDogState) => {
    if (d.rateUnit === "per_night" || d.rateUnit === "per_day") {
      return Math.max(
        1,
        Math.ceil(
          (new Date(`${s.stayEnd}T00:00:00`).getTime() - new Date(`${s.stayStart}T00:00:00`).getTime()) / 86400000
        )
      );
    }
    return 1;
  };
  const includedExtras = extraDogs.filter((d) => extras[d.reservationId]?.include);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Once checkout has been submitted for the "new card" path, the reservation
  // is already checked out and an (unpaid) invoice exists — this holds that
  // invoice so the card modal below can charge + save against it.
  const [pendingInvoice, setPendingInvoice] = useState<{ id: string; amount: number } | null>(null);
  const router = useRouter();

  // Changing the pick-up time re-decides the late-checkout fee: after
  // 12:15 PM it's on, at/before it's off. Staff can still untick manually.
  function applyPickupTime(t: string) {
    setPickupTime(t);
    const [h, m] = t.split(":").map(Number);
    const isLate = h * 60 + m >= 12 * 60 + 15;
    if (rateUnit === "per_night" && autoLateFeeIds.size > 0) {
      setCheckedFees((prev) => {
        const next = new Set(prev);
        for (const id of autoLateFeeIds) {
          if (isLate) next.add(id);
          else next.delete(id);
        }
        return next;
      });
    }
    // Household dogs picked up at the same time get the same late-fee call.
    setExtras((prev) => {
      const next = { ...prev };
      for (const d of extraDogs) {
        const ids = lateFeeIdsOf(d.rules, d.rateUnit);
        if (ids.length === 0 || !next[d.reservationId]) continue;
        const cur = new Set(next[d.reservationId].checkedFees);
        for (const fid of ids) {
          if (isLate) cur.add(fid);
          else cur.delete(fid);
        }
        next[d.reservationId] = { ...next[d.reservationId], checkedFees: [...cur] };
      }
      return next;
    });
  }
  const pickupIsLate = (() => {
    const [h, m] = pickupTime.split(":").map(Number);
    return h * 60 + m >= 12 * 60 + 15;
  })();

  const multiDayRules = rules.filter((r) => r.rule_type === "multi_day_discount");
  const additionalDogRules = rules
    .filter((r) => r.rule_type === "additional_animal_discount")
    .sort((a, b) => (a.threshold ?? 0) - (b.threshold ?? 0));
  const flatFeeRules = rules.filter((r) => r.rule_type === "flat_fee");

  const bestMultiDayRule = useMemo(() => {
    const eligible = multiDayRules.filter((r) => effUnits >= (r.threshold ?? Infinity));
    if (eligible.length === 0) return null;
    return eligible.reduce((best, r) => ((r.threshold ?? 0) > (best.threshold ?? 0) ? r : best));
  }, [multiDayRules, effUnits]);

  const lineItems: CheckoutLineItem[] = useMemo(() => {
    const lines: CheckoutLineItem[] = [];
    const baseTotal = baseRate * effUnits;
    // A grooming appointment's price is its service line below — its type
    // bills $0/session, and a "$0 × session" row just muddied the ticket.
    const skipBase = Boolean(isGroomingReservation) && baseRate === 0;
    if (!skipBase)
    lines.push({
      // Spell out the exact dates being billed. "6 x night" alone can't be
      // checked against a calendar; "Aug 14 -> Aug 20" can.
      description: `${animalName} — ${effUnits} × ${rateUnit.replace("per_", "")} @ $${baseRate.toFixed(
        2
      )} (${fmtDay(`${stayStart}T12:00:00`)} → ${fmtDay(`${stayEnd}T12:00:00`)})`,
      quantity: effUnits,
      unitPrice: baseRate,
      lineTotal: baseTotal,
      lineKind: "base",
    });

    if (bestMultiDayRule) {
      const discount =
        bestMultiDayRule.method === "percent" ? baseTotal * (bestMultiDayRule.amount / 100) : bestMultiDayRule.amount;
      lines.push({ description: bestMultiDayRule.label, quantity: 1, unitPrice: discount, lineTotal: discount, lineKind: "discount" });
    }

    // Each dog checks out on its own ticket; if THIS dog is the household's
    // 2nd/3rd/4th, apply exactly that tier's discount. Dollar tiers are
    // per-night/per-day amounts (e.g. -$25 turns a $65 night into the $40
    // additional-dog rate), so they scale by the billed units — applying
    // them once flat undercharged every multi-night multi-dog stay (QA-016).
    if (numDogs > 1) {
      const rule = additionalDogRules[Math.min(numDogs - 2, additionalDogRules.length - 1)];
      if (rule) {
        const amt =
          rule.method === "percent" ? baseRate * effUnits * (rule.amount / 100) : rule.amount * effUnits;
        lines.push({
          description: `${rule.label} (${effUnits} × $${Math.abs(rule.amount).toFixed(2)})`,
          quantity: 1,
          unitPrice: amt,
          lineTotal: amt,
          lineKind: "discount",
        });
      }
    }

    for (const rule of flatFeeRules) {
      if (checkedFees.has(rule.id)) {
        lines.push({ description: rule.label, quantity: 1, unitPrice: rule.amount, lineTotal: rule.amount, lineKind: "fee" });
      }
    }

    for (const row of groomingRows) {
      if (row.service) {
        lines.push({
          description: extraDogs.length > 0 ? `${animalName} — ${row.service}` : row.service,
          quantity: 1,
          unitPrice: row.price,
          lineTotal: row.price,
          lineKind: "grooming",
          groomingServiceName: row.service,
          animalId,
        });
      }
    }

    // ---- Each included household dog adds its own section of lines, with
    // the same math its solo ticket would have had (one invoice per family,
    // not per dog — Krishan, Aug 30). ----
    for (const d of extraDogs) {
      const s = extras[d.reservationId];
      if (!s?.include) continue;
      const dUnits = extraUnitsOf(d, s);
      const dBaseTotal = d.baseRate * dUnits;
      if (!(d.isGrooming && d.baseRate === 0)) {
        lines.push({
          description: `${d.animalName} — ${dUnits} × ${d.rateUnit.replace("per_", "")} @ $${d.baseRate.toFixed(
            2
          )} (${fmtDay(`${s.stayStart}T12:00:00`)} → ${fmtDay(`${s.stayEnd}T12:00:00`)})`,
          quantity: dUnits,
          unitPrice: d.baseRate,
          lineTotal: dBaseTotal,
          lineKind: "base",
        });
      }
      const dMulti = d.rules
        .filter((r) => r.rule_type === "multi_day_discount" && dUnits >= (r.threshold ?? Infinity))
        .reduce<PricingRule | null>((best, r) => (!best || (r.threshold ?? 0) > (best.threshold ?? 0) ? r : best), null);
      if (dMulti) {
        const disc = dMulti.method === "percent" ? dBaseTotal * (dMulti.amount / 100) : dMulti.amount;
        lines.push({
          description: `${d.animalName} — ${dMulti.label}`,
          quantity: 1,
          unitPrice: disc,
          lineTotal: disc,
          lineKind: "discount",
        });
      }
      const dTiers = d.rules
        .filter((r) => r.rule_type === "additional_animal_discount")
        .sort((a, b) => (a.threshold ?? 0) - (b.threshold ?? 0));
      if (d.rank > 1 && dTiers.length > 0) {
        const rule = dTiers[Math.min(d.rank - 2, dTiers.length - 1)];
        const amt = rule.method === "percent" ? d.baseRate * dUnits * (rule.amount / 100) : rule.amount * dUnits;
        lines.push({
          description: `${d.animalName} — ${rule.label} (${dUnits} × $${Math.abs(rule.amount).toFixed(2)})`,
          quantity: 1,
          unitPrice: amt,
          lineTotal: amt,
          lineKind: "discount",
        });
      }
      for (const rule of d.rules.filter((r) => r.rule_type === "flat_fee")) {
        if (s.checkedFees.includes(rule.id)) {
          lines.push({
            description: `${d.animalName} — ${rule.label}`,
            quantity: 1,
            unitPrice: rule.amount,
            lineTotal: rule.amount,
            lineKind: "fee",
          });
        }
      }
      for (const row of s.groomingRows) {
        if (row.service) {
          lines.push({
            description: `${d.animalName} — ${row.service}`,
            quantity: 1,
            unitPrice: row.price,
            lineTotal: row.price,
            lineKind: "grooming",
            groomingServiceName: row.service,
            animalId: d.animalId,
          });
        }
      }
      for (const row of s.retailRows) {
        const item = retailItems.find((r) => r.id === row.itemId);
        if (item && row.qty > 0) {
          lines.push({
            description: `${d.animalName} — ${item.name} × ${row.qty}`,
            quantity: row.qty,
            unitPrice: item.price,
            lineTotal: item.price * row.qty,
            lineKind: "retail",
            retailItemId: item.id,
            taxable: item.taxable,
          });
        }
      }
    }

    for (const row of retailRows) {
      const item = retailItems.find((r) => r.id === row.itemId);
      if (item && row.qty > 0) {
        lines.push({
          description: `${item.name} × ${row.qty}`,
          quantity: row.qty,
          unitPrice: item.price,
          lineTotal: item.price * row.qty,
          lineKind: "retail",
          retailItemId: item.id,
          taxable: item.taxable,
        });
      }
    }

    for (const oi of openItems) {
      lines.push({
        description: oi.description ? `${oi.type}: ${oi.description}` : oi.type,
        quantity: 1,
        unitPrice: oi.amount,
        lineTotal: oi.amount,
        lineKind:
          oi.type === "Tip" ? "tip" : oi.type === "Price Adjustment" ? "adjustment" : "other",
      });
    }

    return lines;
  }, [baseRate, effUnits, stayStart, stayEnd, animalName, animalId, rateUnit, bestMultiDayRule, numDogs, additionalDogRules, flatFeeRules, checkedFees, groomingRows, retailRows, retailItems, openItems, isGroomingReservation, extraDogs, extras]);

  function addOpenItem() {
    const amount = Number(openAmount);
    if (!amount || amount <= 0) return;
    setOpenItems((items) => [...items, { type: openType, description: openDesc.trim(), amount }]);
    setOpenDesc("");
    setOpenAmount("");
  }

  // Why no discount showed up (Kathleen's request). Discounts are real but
  // conditional, and a ticket with none looked like the feature was missing.
  // Spell out the unmet condition instead of silently showing nothing.
  const hasDiscountLine = lineItems.some((li) => li.lineKind === "discount");
  const nextMultiDayRule = useMemo(() => {
    const ahead = multiDayRules
      .filter((r) => effUnits < (r.threshold ?? Infinity))
      .sort((a, b) => (a.threshold ?? 0) - (b.threshold ?? 0));
    return ahead[0] ?? null;
  }, [multiDayRules, effUnits]);
  const discountHints: string[] = [];
  if (!hasDiscountLine) {
    if (nextMultiDayRule) {
      const need = (nextMultiDayRule.threshold ?? 0) - effUnits;
      const unit = rateUnit === "per_night" ? "night" : "day";
      discountHints.push(
        `${nextMultiDayRule.label} starts at ${nextMultiDayRule.threshold} ${unit}s — this stay is ${effUnits} (${need} short).`
      );
    }
    if (additionalDogRules.length > 0 && numDogs === 1) {
      discountHints.push(
        autoDetectedDogs
          ? "This is the household's 1st dog on this stay, so it bills at full price — the additional-dog rate lands on their other dogs' tickets."
          : "No other dog from this household overlaps this stay, so no additional-dog rate applies."
      );
    }
  }

  const subtotal = lineItems.reduce((sum, li) => sum + li.lineTotal, 0);
  // Tip bases: grooming services on this ticket, or the whole ticket minus
  // any tips already added (tipping on a tip compounds).
  const groomingTotal = groomingRows.reduce((s, r) => s + (r.service ? r.price : 0), 0);
  const tipsSoFar = openItems.filter((o) => o.type === "Tip").reduce((s, o) => s + o.amount, 0);
  const preTipTicket = Math.round((subtotal - tipsSoFar) * 100) / 100;
  const effTipBase = tipBase === "grooming" && groomingTotal > 0 ? "grooming" : "ticket";
  const tipBaseAmount = effTipBase === "grooming" ? groomingTotal : preTipTicket;
  function addQuickTip(pct: number) {
    if (tipBaseAmount <= 0) return;
    const amount = Math.round(tipBaseAmount * pct) / 100;
    setOpenItems((items) => [
      ...items,
      {
        type: "Tip",
        description: `${pct}% of ${effTipBase === "grooming" ? "grooming" : "ticket"} ($${tipBaseAmount.toFixed(2)})`,
        amount,
      },
    ]);
  }
  const taxableSubtotal = lineItems.filter((li) => li.taxable).reduce((sum, li) => sum + li.lineTotal, 0);
  const taxAmount = Math.round(taxableSubtotal * (taxRate / 100) * 100) / 100;
  const total = subtotal + taxAmount;
  // A blank amount on a single payment line means "the whole ticket".
  const allocated = payments.reduce((sum, p) => {
    if (!p.method) return sum;
    const n = Number(p.amount);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
  const activePayments = payments.filter((p) => p.method);
  const soleFullPayment =
    activePayments.length === 1 && activePayments[0].amount.trim() === "" ? activePayments[0] : null;
  const effectivePayments = soleFullPayment
    ? [{ method: soleFullPayment.method, amount: total }]
    : activePayments.map((p) => ({ method: p.method, amount: Number(p.amount) || 0 }));
  const effectiveAllocated = effectivePayments.reduce((s2, p) => s2 + p.amount, 0);
  const remaining = Math.round((total - effectiveAllocated) * 100) / 100;

  const newCardPayment = effectivePayments.find((p) => p.method === NEW_CARD_VALUE) ?? null;
  const savedCardPayment = effectivePayments.find((p) => String(p.method).startsWith("card:")) ?? null;
  const nonCardTotal = effectivePayments
    .filter((p) => p.method !== NEW_CARD_VALUE && !String(p.method).startsWith("card:"))
    .reduce((s2, p) => s2 + p.amount, 0);
  const usingNewCard = Boolean(newCardPayment);

  function addPaymentRow() {
    setPayments((rows) => [...rows, { method: "", amount: "" }]);
  }
  function updatePaymentRow(idx: number, patch: Partial<PaymentRow>) {
    setPayments((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function addRetailRow() {
    if (retailItems.length === 0) return;
    setRetailRows((rows) => [...rows, { itemId: retailItems[0].id, qty: 1 }]);
  }

  function updateRetailRow(idx: number, patch: Partial<{ itemId: string; qty: number }>) {
    setRetailRows((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function addGroomingRow() {
    setGroomingRows((rows) => [...rows, { service: "", price: 0 }]);
  }

  function updateGroomingRow(idx: number, patch: Partial<{ service: string; price: number }>) {
    setGroomingRows((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function serviceDefaultPrice(service: string) {
    const remembered = rememberedPrices.find((p) => p.service_name === service);
    if (remembered) return remembered.price;
    const item = groomingItems.find((g) => g.name === service);
    return item?.min_price ?? 0;
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const { invoiceId } = await completeCheckout(reservationId, {
          facilityId,
          parentId,
          animalId,
          lineItems,
          taxAmount,
          ...(datesAdjusted ? { adjustedStartDate: stayStart, adjustedEndDate: stayEnd } : {}),
          // One family bill: every included household dog checks out on THIS
          // invoice, with any date corrections applied to its reservation.
          additionalReservations: includedExtras.map((d) => {
            const s = extras[d.reservationId];
            const booked = { start: ymdPT(d.startDate), end: ymdPT(d.endDate) };
            const adjusted = s.stayStart !== booked.start || s.stayEnd !== booked.end;
            return {
              reservationId: d.reservationId,
              animalId: d.animalId,
              ...(adjusted ? { adjustedStartDate: s.stayStart, adjustedEndDate: s.stayEnd } : {}),
            };
          }),
          // Never mark paid up front for a card path — only a real Helcim
          // approval (below, or via chargeSavedCard) should do that.
          // Only settle up front when the whole ticket is covered by
          // non-gateway tenders (cash / credit). Anything touching a card
          // stays open until Helcim actually approves.
          markPaid:
            !usingNewCard &&
            !savedCardPayment &&
            effectiveAllocated > 0 &&
            Math.abs(total - nonCardTotal) < 0.005,
          // Record HOW the money arrived — cash/store-credit/admin-credit
          // rows were previously not written anywhere, so a "paid" invoice
          // had no tender trail to reconcile the cash drawer against.
          tenders: effectivePayments
            .filter((p) => ["cash", "store_credit", "admin_credit"].includes(String(p.method)) && p.amount > 0)
            .map((p) => ({ method: String(p.method), amount: p.amount })),
        });

        if (usingNewCard) {
          // Reservation is checked out and the invoice exists (open/unpaid).
          // Swap to the "enter card" panel instead of navigating away yet.
          setPendingInvoice({ id: invoiceId, amount: newCardPayment?.amount ?? total });
          return;
        }

        if (savedCardPayment) {
          // Invoice starts "open" — this flips it to "paid" only once Helcim
          // actually approves the charge. A decline leaves the invoice open
          // and surfaces the error here instead of silently marking it paid.
          // Charges only this line's share, so a split bills the card the
          // remainder rather than the full ticket.
          await chargeSavedCard(
            String(savedCardPayment.method).replace("card:", ""),
            invoiceId,
            savedCardPayment.amount
          );
        }
        router.push("/reservations");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Checkout failed");
      }
    });
  }

  if (pendingInvoice) {
    return (
      <div className="flex flex-col gap-4">
        {/* Deliberately does NOT say "checked out" — the stay is closed but
            the money hasn't moved yet, and claiming otherwise is what made
            this screen read as broken. */}
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          <div className="font-semibold">
            Step 2 of 2 — payment due: ${pendingInvoice.amount.toFixed(2)}
          </div>
          <div className="mt-0.5">
            {animalName}&apos;s invoice is created and <strong>still unpaid</strong>. Nothing has been
            charged yet.
          </div>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Charging ${pendingInvoice.amount.toFixed(2)}
          {saveNewCard
            ? " — and saving this card to the parent's profile, as you selected."
            : " — this card will not be saved."}{" "}
          The form is Helcim&apos;s secure hosted page; card numbers never touch this app.
        </p>
        {parentId && (
          <HelcimCardModal
            facilityId={facilityId}
            parentId={parentId}
            purpose={saveNewCard ? "charge_and_save" : "charge"}
            invoiceId={pendingInvoice.id}
            amount={pendingInvoice.amount}
            buttonLabel={`Enter Card & Charge $${pendingInvoice.amount.toFixed(2)}`}
            className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 px-5 py-2.5 text-center text-sm font-medium text-white disabled:opacity-50 sm:w-fit dark:bg-slate-100 dark:text-slate-900"
            onSuccess={() => router.push("/reservations")}
          />
        )}
        <button
          type="button"
          onClick={() => router.push("/reservations")}
          className="text-sm text-slate-400 underline hover:text-slate-600 dark:hover:text-slate-200 sm:w-fit"
        >
          Skip — I&apos;ll collect payment another way (invoice stays open)
        </button>
      </div>
    );
  }

  const card =
    "rounded-[14px] border border-[#e3e5ea] bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900";
  const sectionLabel =
    "text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8a91a0] dark:text-slate-500";

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_380px]">
      <div className="flex flex-col gap-4">
      {extraDogs.length > 0 && (
        // One invoice per family (Krishan, Aug 30): every checked-in dog
        // from this household is on THIS ticket. Untick one to leave it
        // checked in with its own bill for later.
        <div className="rounded-[14px] border border-sky-200 bg-sky-50/70 p-4 dark:border-sky-900 dark:bg-sky-950/30">
          <span className={sectionLabel}>One family bill</span>
          <p className="mt-1 text-xs text-sky-800/80 dark:text-sky-300/80">
            {animalName} plus the dogs below check out together on a single invoice. Each dog still gets its own
            rate and its own additional-dog discount on the ticket. Untick a dog to leave it checked in.
          </p>
        </div>
      )}
      {isStayBilling && (
        <div className={card}>
          <div className="flex items-center justify-between">
            <span className={sectionLabel}>Stay billed</span>
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">
              {effUnits} {rateUnit === "per_night" ? "night" : "day"}
              {effUnits === 1 ? "" : "s"}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={stayStart}
              max={stayEnd}
              onChange={(e) => setStayStart(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <span className="text-slate-400">→</span>
            <input
              type="date"
              value={stayEnd}
              min={stayStart}
              onChange={(e) => setStayEnd(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <label className="ml-0 flex items-center gap-2 sm:ml-2">
              <span className="text-xs text-[#8a91a0] dark:text-slate-500">Pick-up time</span>
              <input
                type="time"
                value={pickupTime}
                onChange={(e) => applyPickupTime(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
          </div>
          {rateUnit === "per_night" && autoLateFeeIds.size > 0 && (
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              {pickupIsLate
                ? "Pick-up after 12:15 PM — late check-out fee applied below (untick it if excused)."
                : "Pick-up by 12:15 PM — no late check-out fee."}
            </p>
          )}
          {datesAdjusted && (
            <p className="mt-1 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              Booked {fmtDay(`${bookedStartYmd}T12:00:00`)} → {fmtDay(`${bookedEndYmd}T12:00:00`)} — billing the
              dates above instead. Completing checkout updates the reservation to match (logged in its history).
            </p>
          )}
          {!datesAdjusted && (
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Departure defaults to today so an early or late pickup bills the real stay — adjust if needed.
            </p>
          )}
        </div>
      )}

      {additionalDogRules.length > 0 && (
        <div className={card}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={sectionLabel}>Household position</span>
            {autoDetectedDogs && !dogCountEdited && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                auto — {householdSize} dogs from this household on this stay
              </span>
            )}
            {dogCountEdited && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                edited (auto said #{householdRank ?? 1})
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {Array.from({ length: additionalDogRules.length + 1 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setNumDogs(n)}
                className={`h-9 min-w-[52px] rounded-[10px] border px-3 text-sm font-semibold transition-colors ${
                  numDogs === n
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-500 dark:border-indigo-500 dark:bg-indigo-950/40 dark:text-indigo-300"
                    : "border-[#e3e5ea] bg-white text-[#565d6d] hover:border-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                }`}
              >
                #{n}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-[#8a91a0] dark:text-slate-500">
            #1 = first dog (full price). #2+ applies that dog&apos;s additional-dog rate to this ticket —
            each dog checks out on its own reservation.
            {autoDetectedDogs
              ? " Filled in from the household's overlapping bookings — change it if that's wrong."
              : " No other dog from this household overlaps this stay, so it's set to #1."}
          </p>
        </div>
      )}

      {flatFeeRules.length > 0 && (
        <div className={card}>
          <span className={sectionLabel}>Fees from pricing rules</span>
          <div className="mt-2 flex flex-col gap-2">
            {flatFeeRules.map((rule) => {
              const checked = checkedFees.has(rule.id);
              return (
                <label
                  key={rule.id}
                  className={`flex cursor-pointer items-center justify-between gap-2 rounded-[10px] border px-3 py-2.5 text-sm transition-colors ${
                    checked
                      ? "border-indigo-500 bg-indigo-50/50 ring-1 ring-indigo-500 dark:border-indigo-500 dark:bg-indigo-950/30"
                      : "border-[#e3e5ea] bg-white hover:border-indigo-200 dark:border-slate-700 dark:bg-slate-900"
                  }`}
                >
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setCheckedFees((s) => {
                          const next = new Set(s);
                          if (e.target.checked) next.add(rule.id);
                          else next.delete(rule.id);
                          return next;
                        })
                      }
                    />
                    <span className="font-medium text-[#15181d] dark:text-slate-100">{rule.label}</span>
                    {autoLateFeeIds.has(rule.id) && checked && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                        auto — pickup after 12:15 PM (untick if excused)
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-[#15181d] dark:text-slate-100">
                    +${rule.amount.toFixed(2)}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      <div className={card}>
        <div className="flex items-center justify-between">
          <span className={sectionLabel}>
            {bookedGroomingService ? "Grooming — booked service" : "Grooming services"}
          </span>
          <button
            type="button"
            onClick={addGroomingRow}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
          >
            + Add Service
          </button>
        </div>
        {bookedGroomingService && (
          <p className="mt-1 text-xs text-[#8a91a0] dark:text-slate-500">
            ✂️ <span className="font-medium text-[#565d6d] dark:text-slate-300">{bookedGroomingService}</span> was
            booked on this appointment — the price below prefills from the quote/last visit. Adjust it here; the
            new number is remembered for next time. Extras (de-shed, flea bath, …) go on as added services.
          </p>
        )}
        {!bookedGroomingService && isGroomingReservation && (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
            This is a grooming appointment with no service recorded — add the service performed below so it bills.
          </p>
        )}
        <div className="mt-2 flex flex-col gap-2">
          {groomingRows.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                value={row.service}
                onChange={(e) => {
                  const service = e.target.value;
                  updateGroomingRow(i, { service, price: serviceDefaultPrice(service) });
                }}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="">Select service…</option>
                {/* A booked service that's since left the menu still has to render + bill. */}
                {row.service && !groomingItems.some((g) => g.name === row.service) && (
                  <option value={row.service}>{row.service}</option>
                )}
                {groomingItems.map((g) => (
                  <option key={g.name} value={g.name}>
                    {g.name}
                    {rememberedPrices.some((p) => p.service_name === g.name) ? " (remembered price)" : ""}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.01"
                value={row.price}
                onChange={(e) => updateGroomingRow(i, { price: Number(e.target.value) })}
                className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={() => setGroomingRows((rows) => rows.filter((_, idx) => idx !== i))}
                className="text-xs text-red-500 dark:text-red-400"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      {careNote && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          🍽️ {extraDogs.length > 0 ? `${animalName}: ` : ""}{careNote}
        </p>
      )}

      {/* ---- One card per additional household dog on this family bill. ---- */}
      {extraDogs.map((d) => {
        const s = extras[d.reservationId];
        if (!s) return null;
        const dUnits = extraUnitsOf(d, s);
        const dStay = d.rateUnit === "per_night" || d.rateUnit === "per_day";
        const dFlatFees = d.rules.filter((r) => r.rule_type === "flat_fee");
        return (
          <div
            key={d.reservationId}
            className={`rounded-[14px] border p-4 shadow-sm ${
              s.include
                ? "border-sky-200 bg-white dark:border-sky-900 dark:bg-slate-900"
                : "border-dashed border-[#e3e5ea] bg-[#fafbfc] opacity-70 dark:border-slate-700 dark:bg-slate-950/40"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={s.include}
                  onChange={(e) => patchExtra(d.reservationId, { include: e.target.checked })}
                />
                <span className="text-[15px] font-semibold text-[#15181d] dark:text-slate-100">
                  🐾 {d.animalName}
                </span>
                <span className="text-[12px] text-[#8a91a0] dark:text-slate-500">{d.typeName ?? "—"}</span>
              </label>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                dog #{d.rank}
                {d.rank > 1 ? " — additional-dog rate applies" : " — full price"}
              </span>
            </div>

            {!s.include && (
              <p className="mt-2 text-xs text-[#8a91a0] dark:text-slate-500">
                Not on this bill — stays checked in with its own checkout later.
              </p>
            )}

            {s.include && (
              <>
                {dStay && (
                  <div className="mt-3">
                    <div className="flex items-center gap-2">
                      <span className={sectionLabel}>Stay billed</span>
                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">
                        {dUnits} {d.rateUnit === "per_night" ? "night" : "day"}
                        {dUnits === 1 ? "" : "s"} @ ${d.baseRate.toFixed(2)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <input
                        type="date"
                        value={s.stayStart}
                        max={s.stayEnd}
                        onChange={(e) => patchExtra(d.reservationId, { stayStart: e.target.value })}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                      <span className="text-slate-400">→</span>
                      <input
                        type="date"
                        value={s.stayEnd}
                        min={s.stayStart}
                        onChange={(e) => patchExtra(d.reservationId, { stayEnd: e.target.value })}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                    </div>
                  </div>
                )}

                {dFlatFees.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {dFlatFees.map((rule) => {
                      const on = s.checkedFees.includes(rule.id);
                      return (
                        <label
                          key={rule.id}
                          className={`flex cursor-pointer items-center gap-2 rounded-[10px] border px-2.5 py-1.5 text-[13px] transition-colors ${
                            on
                              ? "border-indigo-500 bg-indigo-50/50 ring-1 ring-indigo-500 dark:border-indigo-500 dark:bg-indigo-950/30"
                              : "border-[#e3e5ea] bg-white dark:border-slate-700 dark:bg-slate-900"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={(e) =>
                              patchExtra(d.reservationId, {
                                checkedFees: e.target.checked
                                  ? [...s.checkedFees, rule.id]
                                  : s.checkedFees.filter((fid) => fid !== rule.id),
                              })
                            }
                          />
                          {rule.label} <span className="font-semibold">+${rule.amount.toFixed(2)}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                <div className="mt-3">
                  <div className="flex items-center justify-between">
                    <span className={sectionLabel}>
                      {d.bookedGroomingService ? "Grooming — booked service" : "Grooming"}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        patchExtra(d.reservationId, { groomingRows: [...s.groomingRows, { service: "", price: 0 }] })
                      }
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                    >
                      + Add Service
                    </button>
                  </div>
                  {s.groomingRows.length > 0 && (
                    <div className="mt-2 flex flex-col gap-2">
                      {s.groomingRows.map((row, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <select
                            value={row.service}
                            onChange={(e) => {
                              const service = e.target.value;
                              const remembered = d.rememberedPrices.find((p) => p.service_name === service);
                              const item = groomingItems.find((g) => g.name === service);
                              const rows = [...s.groomingRows];
                              rows[i] = { service, price: remembered?.price ?? item?.min_price ?? 0 };
                              patchExtra(d.reservationId, { groomingRows: rows });
                            }}
                            className="flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          >
                            <option value="">Select service…</option>
                            {row.service && !groomingItems.some((g) => g.name === row.service) && (
                              <option value={row.service}>{row.service}</option>
                            )}
                            {groomingItems.map((g) => (
                              <option key={g.name} value={g.name}>
                                {g.name}
                                {d.rememberedPrices.some((p) => p.service_name === g.name) ? " (remembered price)" : ""}
                              </option>
                            ))}
                          </select>
                          <input
                            type="number"
                            step="0.01"
                            value={row.price}
                            onChange={(e) => {
                              const rows = [...s.groomingRows];
                              rows[i] = { ...rows[i], price: Number(e.target.value) };
                              patchExtra(d.reservationId, { groomingRows: rows });
                            }}
                            className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              patchExtra(d.reservationId, {
                                groomingRows: s.groomingRows.filter((_, idx) => idx !== i),
                              })
                            }
                            className="text-xs text-red-500 dark:text-red-400"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {d.careNote && (
                  <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                    🍽️ {d.animalName}: {d.careNote}
                  </p>
                )}
                {s.retailRows.length > 0 && (
                  <div className="mt-2 flex flex-col gap-2">
                    {s.retailRows.map((row, i) => {
                      const item = retailItems.find((r) => r.id === row.itemId);
                      return (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <span className="flex-1 truncate text-[13px] text-[#565d6d] dark:text-slate-300">
                            {item?.name ?? "Item"} — ${item?.price.toFixed(2) ?? "0.00"}
                          </span>
                          <input
                            type="number"
                            min={0}
                            value={row.qty}
                            onChange={(e) => {
                              const rows = [...s.retailRows];
                              rows[i] = { ...rows[i], qty: Math.max(0, Number(e.target.value)) };
                              patchExtra(d.reservationId, { retailRows: rows });
                            }}
                            className="w-16 rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              patchExtra(d.reservationId, { retailRows: s.retailRows.filter((_, idx) => idx !== i) })
                            }
                            className="text-xs text-red-500 dark:text-red-400"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
      {retailItems.length === 0 ? (
        <div className="rounded-[14px] border border-dashed border-[#e3e5ea] px-3 py-2.5 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
          <span className="font-medium text-slate-700 dark:text-slate-200">Items for Sale</span> — nothing in the
          catalog yet.{" "}
          <Link href="/retail" className="text-indigo-600 underline dark:text-indigo-400">Add items</Link>{" "}
          and they&apos;ll be sellable here.
        </div>
      ) : (
        <div className={card}>
          <div className="flex items-center justify-between">
            <span className={sectionLabel}>Items for sale</span>
            <button type="button" onClick={addRetailRow} className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400">
              + Add Item
            </button>
          </div>
          <div className="mt-2 flex flex-col gap-2">
            {retailRows.map((row, i) => {
              const item = retailItems.find((r) => r.id === row.itemId);
              return (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={row.itemId}
                    onChange={(e) => updateRetailRow(i, { itemId: e.target.value })}
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    {retailItems.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} — ${r.price.toFixed(2)}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={row.qty}
                    onChange={(e) => updateRetailRow(i, { qty: Math.max(1, Number(e.target.value)) })}
                    className="w-16 rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                  <span className="w-16 shrink-0 text-right text-xs text-slate-400 dark:text-slate-500">
                    ${item ? (item.price * row.qty).toFixed(2) : "0.00"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setRetailRows((rows) => rows.filter((_, idx) => idx !== i))}
                    className="text-xs text-red-500 dark:text-red-400"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Open Line Items — a tip, a manual price adjustment, or any other
          one-off charge that isn't tied to the retail catalog. */}
      <div className={card}>
        <span className={sectionLabel}>Tip / other charges</span>

        {/* TIP ON — pick the base, then a percentage; each button shows the
            dollar amount so nobody does register math out loud. */}
        {(groomingTotal > 0 || preTipTicket > 0) && (
          <div className="mt-2 rounded-[10px] border border-[#edeff3] bg-[#f9fafb] p-3 dark:border-slate-800 dark:bg-slate-950/40">
            <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8a91a0] dark:text-slate-500">
              Tip on
            </div>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {groomingTotal > 0 && (
                <button
                  type="button"
                  onClick={() => setTipBase("grooming")}
                  className={`rounded-[10px] border px-3 py-1.5 text-[13px] font-medium transition-colors ${
                    effTipBase === "grooming"
                      ? "border-indigo-500 bg-white text-indigo-700 ring-1 ring-indigo-500 dark:bg-slate-900 dark:text-indigo-300"
                      : "border-[#e3e5ea] bg-white text-[#565d6d] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  }`}
                >
                  Grooming (${groomingTotal.toFixed(2)})
                </button>
              )}
              <button
                type="button"
                onClick={() => setTipBase("ticket")}
                className={`rounded-[10px] border px-3 py-1.5 text-[13px] font-medium transition-colors ${
                  effTipBase === "ticket"
                    ? "border-indigo-500 bg-white text-indigo-700 ring-1 ring-indigo-500 dark:bg-slate-900 dark:text-indigo-300"
                    : "border-[#e3e5ea] bg-white text-[#565d6d] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                }`}
              >
                Whole ticket (${preTipTicket.toFixed(2)})
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {[15, 18, 20, 25].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => addQuickTip(pct)}
                  className="flex flex-col items-center rounded-[10px] border border-[#e3e5ea] bg-white px-3 py-1.5 transition-colors hover:border-indigo-300 hover:bg-indigo-50/50 dark:border-slate-700 dark:bg-slate-900"
                >
                  <span className="text-[13px] font-semibold text-[#15181d] dark:text-slate-100">{pct}%</span>
                  <span className="text-[10px] tabular-nums text-[#8a91a0] dark:text-slate-500">
                    ${(Math.round(tipBaseAmount * pct) / 100).toFixed(2)}
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-[#8a91a0] dark:text-slate-500">
              Adds a Tip line to the ticket — tap ✕ on it to undo. Custom amounts below.
            </p>
          </div>
        )}

        <div className="mt-2 flex flex-col gap-2">
          {openItems.map((oi, i) => (
            <div key={i} className="flex items-center justify-between rounded-[10px] border border-[#e3e5ea] px-3 py-1.5 text-sm dark:border-slate-800">
              <span className="text-slate-600 dark:text-slate-300">
                {oi.type}
                {oi.description ? `: ${oi.description}` : ""}
              </span>
              <span className="flex items-center gap-2">
                <span>${oi.amount.toFixed(2)}</span>
                <button
                  type="button"
                  onClick={() => setOpenItems((items) => items.filter((_, idx) => idx !== i))}
                  className="text-xs text-red-500 dark:text-red-400"
                >
                  ✕
                </button>
              </span>
            </div>
          ))}
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs">
              <span className="block text-slate-500 dark:text-slate-400">Type</span>
              <select
                value={openType}
                onChange={(e) => setOpenType(e.target.value as OpenItemType)}
                className="mt-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                {OPEN_ITEM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex-1 text-xs">
              <span className="block text-slate-500 dark:text-slate-400">Description</span>
              <input
                value={openDesc}
                onChange={(e) => setOpenDesc(e.target.value)}
                placeholder="Optional"
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="text-xs">
              <span className="block text-slate-500 dark:text-slate-400">Amount</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={openAmount}
                onChange={(e) => setOpenAmount(e.target.value)}
                className="mt-1 w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <button
              type="button"
              onClick={addOpenItem}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:border-slate-500 dark:border-slate-700 dark:hover:border-slate-500"
            >
              + Add
            </button>
          </div>
        </div>
      </div>

      </div>

      {/* Right rail: the live TICKET + PAYMENT (sticky on desktop; on mobile
          it renders below the builder cards, total always in view). */}
      <aside className="flex flex-col gap-4 lg:sticky lg:top-20">
      <div className={`${card} text-sm`}>
        <div className={sectionLabel}>Ticket</div>
        <div className="mt-2">
        {lineItems.map((li, i) => (
          <div key={i} className="flex justify-between gap-3 py-1">
            <span className="text-[13px] text-[#565d6d] dark:text-slate-400">{li.description}</span>
            <span
              className={`shrink-0 tabular-nums ${
                li.lineTotal < 0
                  ? "font-medium text-emerald-600 dark:text-emerald-400"
                  : "text-[#15181d] dark:text-slate-100"
              }`}
            >
              {li.lineTotal < 0 ? "−" : ""}${Math.abs(li.lineTotal).toFixed(2)}
            </span>
          </div>
        ))}
        {taxAmount > 0 && (
          <div className="flex justify-between gap-3 py-1">
            <span className="text-[13px] text-[#565d6d] dark:text-slate-400">
              Sales tax {taxRate}% on ${taxableSubtotal.toFixed(2)} retail
            </span>
            <span className="tabular-nums text-[#15181d] dark:text-slate-100">${taxAmount.toFixed(2)}</span>
          </div>
        )}
        <div className="mt-2 flex items-baseline justify-between border-t border-[#edeff3] pt-2.5 dark:border-slate-800">
          <span className="font-semibold text-[#15181d] dark:text-slate-100">Total</span>
          <span className="text-[22px] font-semibold tabular-nums text-[#15181d] dark:text-slate-50">
            ${total.toFixed(2)}
          </span>
        </div>
        {discountHints.length > 0 && (
          <div className="mt-2 border-t border-[#edeff3] pt-2 dark:border-slate-800">
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">No discount on this ticket:</p>
            <ul className="mt-0.5 list-disc pl-4 text-[11px] text-slate-400 dark:text-slate-500">
              {discountHints.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </div>
        )}
        </div>
      </div>

      {/* Payment Method — supports splitting one ticket across several
          tender types (e.g. $15 cash, remainder on card). Card lines settle
          through Helcim; cash / store credit / admin credit are recorded
          against the invoice without touching the gateway. */}
      <div className={card}>
        <div className="flex items-baseline justify-between">
          <span className={sectionLabel}>Payment</span>
          <button
            type="button"
            onClick={addPaymentRow}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
          >
            + Split payment
          </button>
        </div>

        <div className="mt-1.5 flex flex-col gap-2">
          {payments.map((p, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select
                value={p.method}
                onChange={(e) => updatePaymentRow(i, { method: e.target.value as PaymentMethodKey })}
                className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="">Don&apos;t collect payment now</option>
                {savedCards.map((c) => (
                  <option key={c.id} value={`card:${c.id}`}>
                    {c.card_brand ?? "Card"} •••• {c.last4 ?? "----"}
                  </option>
                ))}
                {parentId && <option value={NEW_CARD_VALUE}>+ Add a new card…</option>}
                <option value="cash">Cash</option>
                <option value="store_credit">Store Credit</option>
                <option value="admin_credit">Admin Credit (comp / adjustment)</option>
              </select>
              <input
                type="number"
                step="0.01"
                min="0"
                value={p.amount}
                onChange={(e) => updatePaymentRow(i, { amount: e.target.value })}
                placeholder={remaining.toFixed(2)}
                className="w-28 rounded-lg border border-slate-300 px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              {payments.length > 1 && (
                <button
                  type="button"
                  onClick={() => setPayments((rows) => rows.filter((_, idx) => idx !== i))}
                  className="text-xs text-red-500 dark:text-red-400"
                  aria-label="Remove payment line"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Running reconciliation so a split can't silently under/over-collect. */}
        <div className="mt-1.5 text-xs">
          {allocated > 0 && (
            <span className="text-slate-500 dark:text-slate-400">
              Allocated ${allocated.toFixed(2)} of ${total.toFixed(2)}
              {" · "}
              <span
                className={
                  Math.abs(remaining) < 0.005
                    ? "font-medium text-emerald-600 dark:text-emerald-400"
                    : remaining > 0
                      ? "font-medium text-amber-600 dark:text-amber-400"
                      : "font-medium text-red-600 dark:text-red-400"
                }
              >
                {Math.abs(remaining) < 0.005
                  ? "balanced"
                  : remaining > 0
                    ? `$${remaining.toFixed(2)} still due`
                    : `$${Math.abs(remaining).toFixed(2)} over`}
              </span>
            </span>
          )}
          {allocated === 0 && (
            <span className="text-slate-400 dark:text-slate-500">
              Nothing collected now — the invoice stays open and payable later.
            </span>
          )}
        </div>

        {usingNewCard && parentId && (
          // Saving a card is a decision about someone else's payment
          // instrument, so it's opt-in rather than a side effect.
          <label className="mt-2 flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={saveNewCard}
              onChange={(e) => setSaveNewCard(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Save this card to the parent&apos;s profile for future checkouts.{" "}
              <span className="text-slate-400 dark:text-slate-500">
                Leave unchecked to charge it once without storing it.
              </span>
            </span>
          </label>
        )}
        <p className="mt-3 text-[11px] text-[#8a91a0] dark:text-slate-500">
          Card charges settle through Helcim. Cash and credit are recorded against the invoice.
        </p>

        {error && (
          <div className="mt-2 rounded-[10px] bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
            {error}
          </div>
        )}

        <button
          onClick={submit}
          disabled={isPending}
          className="mt-3 w-full rounded-[10px] bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
        >
          {isPending
            ? "Working…"
            : usingNewCard
              ? `Continue to card — $${(newCardPayment?.amount ?? total).toFixed(2)}`
              : savedCardPayment
                ? `Charge $${savedCardPayment.amount.toFixed(2)} & check out${
                    includedExtras.length > 0 ? ` ${1 + includedExtras.length} dogs` : ""
                  }`
                : includedExtras.length > 0
                  ? `Check out ${1 + includedExtras.length} dogs — $${total.toFixed(2)}`
                  : `Check out — $${total.toFixed(2)}`}
        </button>
      </div>
      </aside>
    </div>
  );
}
