"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ParentPicker, { type ParentOption } from "@/components/ParentPicker";
import { createWalkInSale, getSavedCardsForParent, type SaleLineItem } from "@/app/sale/actions";
import { chargeSavedCard } from "@/app/billing/helcim-actions";
import HelcimCardModal from "@/components/HelcimCardModal";

type RetailItem = { id: string; name: string; price: number; taxable: boolean };
type SavedCard = { id: string; card_brand: string | null; last4: string | null };

const NEW_CARD_VALUE = "__new__";

export default function WalkInSaleForm({
  facilityId,
  retailItems,
  taxRate,
  parents,
}: {
  facilityId: string;
  retailItems: RetailItem[];
  taxRate: number;
  parents: ParentOption[];
}) {
  const [selectedParent, setSelectedParent] = useState<ParentOption | null>(null);
  const [rows, setRows] = useState<{ itemId: string; qty: number }[]>(
    retailItems.length > 0 ? [{ itemId: retailItems[0].id, qty: 1 }] : []
  );
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [cardId, setCardId] = useState("");
  const [markPaid, setMarkPaid] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pendingInvoice, setPendingInvoice] = useState<{ id: string; amount: number } | null>(null);
  const router = useRouter();

  useEffect(() => {
    setCardId("");
    if (!selectedParent) {
      setCards([]);
      return;
    }
    getSavedCardsForParent(facilityId, selectedParent.id).then(setCards);
  }, [selectedParent, facilityId]);

  const lineItems: SaleLineItem[] = useMemo(() => {
    return rows
      .map((row) => {
        const item = retailItems.find((r) => r.id === row.itemId);
        if (!item || row.qty <= 0) return null;
        return {
          retailItemId: item.id,
          description: `${item.name} × ${row.qty}`,
          quantity: row.qty,
          unitPrice: item.price,
          lineTotal: item.price * row.qty,
          taxable: item.taxable,
        };
      })
      .filter((li): li is SaleLineItem => li !== null);
  }, [rows, retailItems]);

  const subtotal = lineItems.reduce((sum, li) => sum + li.lineTotal, 0);
  const taxableSubtotal = lineItems.filter((li) => li.taxable).reduce((sum, li) => sum + li.lineTotal, 0);
  const taxAmount = Math.round(taxableSubtotal * (taxRate / 100) * 100) / 100;
  const total = subtotal + taxAmount;
  const usingNewCard = cardId === NEW_CARD_VALUE;

  function addRow() {
    if (retailItems.length === 0) return;
    setRows((r) => [...r, { itemId: retailItems[0].id, qty: 1 }]);
  }

  function updateRow(idx: number, patch: Partial<{ itemId: string; qty: number }>) {
    setRows((r) => r.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  }

  function submit() {
    setError(null);
    if (lineItems.length === 0) {
      setError("Add at least one item.");
      return;
    }
    startTransition(async () => {
      try {
        const { invoiceId } = await createWalkInSale({
          facilityId,
          parentId: selectedParent?.id ?? null,
          lineItems,
          taxAmount,
          markPaid: usingNewCard ? false : markPaid,
        });

        if (usingNewCard) {
          setPendingInvoice({ id: invoiceId, amount: total });
          return;
        }

        if (cardId) {
          await chargeSavedCard(cardId, invoiceId, total);
        }
        router.push(`/invoices/${invoiceId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Sale failed");
      }
    });
  }

  if (pendingInvoice) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-400">
          Sale created. Total: ${pendingInvoice.amount.toFixed(2)}.
        </div>
        {selectedParent ? (
          <HelcimCardModal
            facilityId={facilityId}
            parentId={selectedParent.id}
            purpose="charge_and_save"
            invoiceId={pendingInvoice.id}
            amount={pendingInvoice.amount}
            buttonLabel={`Enter Card & Charge $${pendingInvoice.amount.toFixed(2)}`}
            className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 px-5 py-2.5 text-center text-sm font-medium text-white disabled:opacity-50 sm:w-fit dark:bg-slate-100 dark:text-slate-900"
            onSuccess={() => router.push(`/invoices/${pendingInvoice.id}`)}
          />
        ) : (
          <p className="text-sm text-slate-400 dark:text-slate-500">
            No account on file for this sale, so a card can&apos;t be saved — collect payment another way.
          </p>
        )}
        <button
          type="button"
          onClick={() => router.push(`/invoices/${pendingInvoice.id}`)}
          className="text-sm text-slate-400 underline hover:text-slate-600 dark:hover:text-slate-200 sm:w-fit"
        >
          Skip — I&apos;ll collect payment another way (invoice stays open)
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ParentPicker parents={parents} onSelect={setSelectedParent} />

      <div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Items</span>
          <button type="button" onClick={addRow} className="text-xs font-medium text-slate-500 underline dark:text-slate-400">
            + Add Item
          </button>
        </div>
        <div className="mt-2 flex flex-col gap-2">
          {rows.length === 0 && (
            <p className="text-xs text-slate-400 dark:text-slate-500">
              No items in the catalog yet — <a href="/retail" className="underline">add one first</a>.
            </p>
          )}
          {rows.map((row, i) => {
            const item = retailItems.find((r) => r.id === row.itemId);
            return (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={row.itemId}
                  onChange={(e) => updateRow(i, { itemId: e.target.value })}
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
                  onChange={(e) => updateRow(i, { qty: Math.max(1, Number(e.target.value)) })}
                  className="w-16 rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
                <span className="w-16 shrink-0 text-right text-xs text-slate-400 dark:text-slate-500">
                  ${item ? (item.price * row.qty).toFixed(2) : "0.00"}
                </span>
                <button type="button" onClick={() => setRows((r) => r.filter((_, idx) => idx !== i))} className="text-xs text-red-500 dark:text-red-400">
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-950/40">
        {lineItems.map((li, i) => (
          <div key={i} className="flex justify-between py-0.5">
            <span className="text-slate-500 dark:text-slate-400">{li.description}</span>
            <span>${li.lineTotal.toFixed(2)}</span>
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

      <label className="block">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Card Payment</span>
        <select
          value={cardId}
          onChange={(e) => setCardId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          <option value="">Don&apos;t charge a card here</option>
          {cards.map((c) => (
            <option key={c.id} value={c.id}>
              {c.card_brand ?? "Card"} •••• {c.last4 ?? "----"}
            </option>
          ))}
          {selectedParent && <option value={NEW_CARD_VALUE}>+ Add a new card…</option>}
        </select>
        {!selectedParent && (
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            No customer selected — pick one above to charge or save a card, or just mark it paid below.
          </p>
        )}
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={markPaid} disabled={Boolean(cardId)} onChange={(e) => setMarkPaid(e.target.checked)} />
        Payment collected now (cash / external)
      </label>

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">{error}</div>}

      <button
        onClick={submit}
        disabled={isPending}
        className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50 sm:w-fit dark:bg-slate-100 dark:text-slate-900"
      >
        {isPending ? "Ringing Up…" : "Complete Sale"}
      </button>
    </div>
  );
}
