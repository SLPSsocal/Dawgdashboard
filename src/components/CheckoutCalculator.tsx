"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeCheckout, type CheckoutLineItem } from "@/app/reservations/checkout-actions";
import { chargeSavedCard } from "@/app/billing/helcim-actions";

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

export default function CheckoutCalculator({
  reservationId,
  facilityId,
  animalId,
  parentId,
  animalName,
  baseRate,
  rateUnit,
  units,
  rules,
  groomingItems,
  rememberedPrices,
  savedCards,
}: {
  reservationId: string;
  facilityId: string;
  animalId: string;
  parentId: string | null;
  animalName: string;
  baseRate: number;
  rateUnit: string;
  units: number;
  rules: PricingRule[];
  groomingItems: GroomingItem[];
  rememberedPrices: RememberedPrice[];
  savedCards: SavedCard[];
}) {
  const [numDogs, setNumDogs] = useState(1);
  const [checkedFees, setCheckedFees] = useState<Set<string>>(new Set());
  const [groomingRows, setGroomingRows] = useState<{ service: string; price: number }[]>([]);
  const [markPaid, setMarkPaid] = useState(false);
  const [cardId, setCardId] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const multiDayRules = rules.filter((r) => r.rule_type === "multi_day_discount");
  const additionalDogRules = rules
    .filter((r) => r.rule_type === "additional_animal_discount")
    .sort((a, b) => (a.threshold ?? 0) - (b.threshold ?? 0));
  const flatFeeRules = rules.filter((r) => r.rule_type === "flat_fee");

  const bestMultiDayRule = useMemo(() => {
    const eligible = multiDayRules.filter((r) => units >= (r.threshold ?? Infinity));
    if (eligible.length === 0) return null;
    return eligible.reduce((best, r) => ((r.threshold ?? 0) > (best.threshold ?? 0) ? r : best));
  }, [multiDayRules, units]);

  const lineItems: CheckoutLineItem[] = useMemo(() => {
    const lines: CheckoutLineItem[] = [];
    const baseTotal = baseRate * units;
    lines.push({
      description: `${animalName} — ${units} × ${rateUnit.replace("per_", "")} @ $${baseRate.toFixed(2)}`,
      quantity: units,
      unitPrice: baseRate,
      lineTotal: baseTotal,
    });

    if (bestMultiDayRule) {
      const discount =
        bestMultiDayRule.method === "percent" ? baseTotal * (bestMultiDayRule.amount / 100) : bestMultiDayRule.amount;
      lines.push({ description: bestMultiDayRule.label, quantity: 1, unitPrice: discount, lineTotal: discount });
    }

    // Each additional dog beyond the first gets its own discount tier.
    for (let i = 0; i < Math.min(numDogs - 1, additionalDogRules.length); i++) {
      const rule = additionalDogRules[i];
      const amt = rule.method === "percent" ? baseRate * units * (rule.amount / 100) : rule.amount;
      lines.push({ description: rule.label, quantity: 1, unitPrice: amt, lineTotal: amt });
    }

    for (const rule of flatFeeRules) {
      if (checkedFees.has(rule.id)) {
        lines.push({ description: rule.label, quantity: 1, unitPrice: rule.amount, lineTotal: rule.amount });
      }
    }

    for (const row of groomingRows) {
      if (row.service) {
        lines.push({
          description: row.service,
          quantity: 1,
          unitPrice: row.price,
          lineTotal: row.price,
          groomingServiceName: row.service,
        });
      }
    }

    return lines;
  }, [baseRate, units, animalName, rateUnit, bestMultiDayRule, numDogs, additionalDogRules, flatFeeRules, checkedFees, groomingRows]);

  const total = lineItems.reduce((sum, li) => sum + li.lineTotal, 0);

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
          markPaid,
        });
        if (cardId) {
          // Invoice starts "open" — this flips it to "paid" only once Helcim
          // actually approves the charge. A decline leaves the invoice open
          // and surfaces the error here instead of silently marking it paid.
          await chargeSavedCard(cardId, invoiceId, total);
        }
        router.push("/reservations");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Checkout failed");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {additionalDogRules.length > 0 && (
        <label className="block">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Total dogs in this booking (same household)
          </span>
          <input
            type="number"
            min={1}
            value={numDogs}
            onChange={(e) => setNumDogs(Math.max(1, Number(e.target.value)))}
            className="mt-1 w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
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

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-950/40">
        {lineItems.map((li, i) => (
          <div key={i} className="flex justify-between py-0.5">
            <span className="text-slate-500 dark:text-slate-400">{li.description}</span>
            <span className={li.lineTotal < 0 ? "text-green-600 dark:text-green-400" : ""}>
              {li.lineTotal < 0 ? "-" : ""}${Math.abs(li.lineTotal).toFixed(2)}
            </span>
          </div>
        ))}
        <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 font-semibold dark:border-slate-800">
          <span>Total</span>
          <span>${total.toFixed(2)}</span>
        </div>
      </div>

      {savedCards.length > 0 && (
        <label className="block">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Charge Card on File</span>
          <select
            value={cardId}
            onChange={(e) => setCardId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="">Don&apos;t charge a saved card</option>
            {savedCards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.card_brand ?? "Card"} •••• {c.last4 ?? "----"}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Charges ${total.toFixed(2)} on Complete Checkout and marks the invoice paid automatically.
          </p>
        </label>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={markPaid}
          disabled={Boolean(cardId)}
          onChange={(e) => setMarkPaid(e.target.checked)}
        />
        Payment collected now (cash / external)
      </label>

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">{error}</div>}

      <button
        onClick={submit}
        disabled={isPending}
        className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50 sm:w-fit dark:bg-slate-100 dark:text-slate-900"
      >
        {isPending ? "Checking Out…" : "Complete Checkout"}
      </button>
    </div>
  );
}
