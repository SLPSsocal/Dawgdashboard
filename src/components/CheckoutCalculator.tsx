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
}) {
  const [numDogs, setNumDogs] = useState(1);
  const [checkedFees, setCheckedFees] = useState<Set<string>>(new Set());
  const [groomingRows, setGroomingRows] = useState<{ service: string; price: number }[]>([]);
  const [retailRows, setRetailRows] = useState<{ itemId: string; qty: number }[]>(initialRetailRows ?? []);
  const [openItems, setOpenItems] = useState<{ type: OpenItemType; description: string; amount: number }[]>([]);
  const [openType, setOpenType] = useState<OpenItemType>("Tip");
  const [openDesc, setOpenDesc] = useState("");
  const [openAmount, setOpenAmount] = useState("");
  const [payments, setPayments] = useState<PaymentRow[]>([{ method: "", amount: "" }]);
  const [saveNewCard, setSaveNewCard] = useState(false);

  // Editable stay window. Departure defaults to TODAY for per-night/per-day
  // stays: checkout happens the day the dog leaves, and billing the booked
  // end date instead of the real one silently over- or under-charges.
  const isStayBilling = rateUnit === "per_night" || rateUnit === "per_day";
  const bookedStartYmd = startDate.slice(0, 10);
  const bookedEndYmd = endDate.slice(0, 10);
  const todayYmd = new Date().toISOString().slice(0, 10);
  const defaultEndYmd = isStayBilling && todayYmd > bookedStartYmd ? todayYmd : bookedEndYmd;
  const [stayStart, setStayStart] = useState(bookedStartYmd);
  const [stayEnd, setStayEnd] = useState(defaultEndYmd);
  const stayUnits = Math.max(
    1,
    Math.ceil((new Date(`${stayEnd}T00:00:00`).getTime() - new Date(`${stayStart}T00:00:00`).getTime()) / 86400000)
  );
  const effUnits = isStayBilling ? stayUnits : units;
  const datesAdjusted = isStayBilling && (stayStart !== bookedStartYmd || stayEnd !== bookedEndYmd);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Once checkout has been submitted for the "new card" path, the reservation
  // is already checked out and an (unpaid) invoice exists — this holds that
  // invoice so the card modal below can charge + save against it.
  const [pendingInvoice, setPendingInvoice] = useState<{ id: string; amount: number } | null>(null);
  const router = useRouter();

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
          description: row.service,
          quantity: 1,
          unitPrice: row.price,
          lineTotal: row.price,
          lineKind: "grooming",
          groomingServiceName: row.service,
        });
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
  }, [baseRate, effUnits, stayStart, stayEnd, animalName, rateUnit, bestMultiDayRule, numDogs, additionalDogRules, flatFeeRules, checkedFees, groomingRows, retailRows, retailItems, openItems]);

  function addOpenItem() {
    const amount = Number(openAmount);
    if (!amount || amount <= 0) return;
    setOpenItems((items) => [...items, { type: openType, description: openDesc.trim(), amount }]);
    setOpenDesc("");
    setOpenAmount("");
  }

  const subtotal = lineItems.reduce((sum, li) => sum + li.lineTotal, 0);
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

  return (
    <div className="flex flex-col gap-4">
      {isStayBilling && (
        <div>
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">🗓️ Stay Dates (billed)</span>
          <div className="mt-1 flex flex-wrap items-center gap-2">
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
            <span className="text-sm font-semibold tabular-nums">
              {effUnits} {rateUnit === "per_night" ? "night" : "day"}
              {effUnits === 1 ? "" : "s"}
            </span>
          </div>
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
        <label className="block">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            This dog is # ___ of the household&apos;s dogs here today
          </span>
          <input
            type="number"
            min={1}
            max={additionalDogRules.length + 1}
            value={numDogs}
            onChange={(e) => setNumDogs(Math.max(1, Number(e.target.value)))}
            className="mt-1 w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            1 = first dog (full price). 2+ applies that dog&apos;s additional-dog rate to this ticket —
            each dog checks out on its own reservation.
          </p>
        </label>
      )}

      {flatFeeRules.length > 0 && (
        <div>
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Fees</span>
          <div className="mt-1 flex flex-col gap-1">
            {flatFeeRules.map((rule) => (
              <label key={rule.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={checkedFees.has(rule.id)}
                  onChange={(e) =>
                    setCheckedFees((s) => {
                      const next = new Set(s);
                      if (e.target.checked) next.add(rule.id);
                      else next.delete(rule.id);
                      return next;
                    })
                  }
                />
                {rule.label} (+${rule.amount.toFixed(2)})
              </label>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Grooming Add-ons</span>
          <button
            type="button"
            onClick={addGroomingRow}
            className="text-xs font-medium text-slate-500 underline dark:text-slate-400"
          >
            + Add Service
          </button>
        </div>
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
          🍽️ {careNote}
        </p>
      )}
      {retailItems.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
          <span className="font-medium text-slate-700 dark:text-slate-200">Items for Sale</span> — nothing in the
          catalog yet.{" "}
          <Link href="/retail" className="text-indigo-600 underline dark:text-indigo-400">Add items</Link>{" "}
          and they&apos;ll be sellable here.
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Items for Sale</span>
            <button type="button" onClick={addRetailRow} className="text-xs font-medium text-slate-500 underline dark:text-slate-400">
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
      <div>
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Tip / Other Charges</span>
        <div className="mt-2 flex flex-col gap-2">
          {openItems.map((oi, i) => (
            <div key={i} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-800">
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

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-950/40">
        {lineItems.map((li, i) => (
          <div key={i} className="flex justify-between py-0.5">
            <span className="text-slate-500 dark:text-slate-400">{li.description}</span>
            <span className={li.lineTotal < 0 ? "text-green-600 dark:text-green-400" : ""}>
              {li.lineTotal < 0 ? "-" : ""}${Math.abs(li.lineTotal).toFixed(2)}
            </span>
          </div>
        ))}
        {taxAmount > 0 && (
          <div className="flex justify-between py-0.5">
            <span className="text-slate-500 dark:text-slate-400">Sales Tax ({taxRate}%)</span>
            <span>${taxAmount.toFixed(2)}</span>
          </div>
        )}
        <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 font-semibold dark:border-slate-800">
          <span>Total</span>
          <span>${total.toFixed(2)}</span>
        </div>
      </div>

      {/* Payment Method — supports splitting one ticket across several
          tender types (e.g. $15 cash, remainder on card). Card lines settle
          through Helcim; cash / store credit / admin credit are recorded
          against the invoice without touching the gateway. */}
      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Payment Method</span>
          <button
            type="button"
            onClick={addPaymentRow}
            className="text-xs font-medium text-slate-500 underline dark:text-slate-400"
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
      </div>

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">{error}</div>}

      <button
        onClick={submit}
        disabled={isPending}
        className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50 sm:w-fit dark:bg-slate-100 dark:text-slate-900"
      >
        {isPending
          ? "Working…"
          : usingNewCard
            ? `Continue to Card — $${(newCardPayment?.amount ?? total).toFixed(2)}`
            : savedCardPayment
              ? `Charge $${savedCardPayment.amount.toFixed(2)} & Check Out`
              : "Check Out"}
      </button>
    </div>
  );
}
