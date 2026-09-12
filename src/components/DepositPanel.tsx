"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import HelcimCardModal from "@/components/HelcimCardModal";
import {
  collectDeposit,
  discardOpenDeposit,
  noteCardDepositPaid,
  type DepositTender,
  type PaidDeposit,
} from "@/app/reservations/deposit-actions";

// Advance payment on a reservation (Gelica, Sep 4). Suggested = 50% of the
// booking estimate, editable. Tender: cash, store credit, card on file, or a
// new card via HelcimPay. See deposit-actions.ts for what happens at
// checkout / cancellation.
export default function DepositPanel({
  reservationId,
  facilityId,
  parentId,
  animalName,
  staffName,
  suggestedAmount,
  estimateTotal,
  deposits,
  savedCards,
  storeCreditBalance,
  quickAmounts = [],
  title = "💵 Deposit / advance payment",
  className = "mt-4",
}: {
  reservationId: string;
  facilityId: string;
  parentId: string;
  animalName: string;
  staffName: string | null;
  suggestedAmount: number | null;
  estimateTotal: number | null;
  deposits: PaidDeposit[];
  savedCards: { id: string; card_brand: string | null; last4: string | null }[];
  storeCreditBalance: number;
  /** One-tap amounts (Mark, Sep 10 — "apply toward the full balance or a specific portion"). */
  quickAmounts?: { label: string; amount: number }[];
  title?: string;
  className?: string;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(suggestedAmount != null ? suggestedAmount.toFixed(2) : "");
  const [tender, setTender] = useState<DepositTender>(savedCards[0] ? `card:${savedCards[0].id}` : "cash");
  const [saveNewCard, setSaveNewCard] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [cardInvoice, setCardInvoice] = useState<{ id: string; amount: number } | null>(null);

  const paidTotal = deposits.reduce((s, d) => s + d.amount, 0);
  const amt = Math.round((Number(amount) || 0) * 100) / 100;

  function submit() {
    setError(null);
    if (!(amt > 0)) {
      setError("Enter an amount greater than $0.");
      return;
    }
    startTransition(async () => {
      try {
        const r = await collectDeposit({
          reservationId,
          facilityId,
          parentId,
          animalName,
          amount: amt,
          tender,
          staffName,
        });
        if (r.paid) {
          router.refresh();
        } else {
          setCardInvoice({ id: r.invoiceId, amount: amt });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not take the deposit.");
      }
    });
  }

  const input =
    "rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

  return (
    <div className={`${className} rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h2>
        {paidTotal > 0 && (
          <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            ${paidTotal.toFixed(2)} prepaid
          </span>
        )}
      </div>

      {deposits.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 text-[13px] text-slate-600 dark:text-slate-300">
          {deposits.map((d) => (
            <li key={d.invoiceId} className="flex justify-between gap-3">
              <span>
                {new Date(d.paidAt ?? d.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })} ·{" "}
                {d.method === "store_credit" ? "store credit" : d.method}
              </span>
              <span className="tabular-nums">${d.amount.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
        Applied automatically at checkout; anything left over becomes store credit. If the stay is cancelled the
        deposit moves to store credit.
      </p>

      {cardInvoice ? (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Charging ${cardInvoice.amount.toFixed(2)} to a new card
            {saveNewCard ? " (and saving it to the parent's profile)" : ""}.
          </p>
          <HelcimCardModal
            facilityId={facilityId}
            parentId={parentId}
            purpose={saveNewCard ? "charge_and_save" : "charge"}
            invoiceId={cardInvoice.id}
            amount={cardInvoice.amount}
            buttonLabel={`Enter Card & Charge $${cardInvoice.amount.toFixed(2)}`}
            className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-medium text-white sm:w-fit dark:bg-slate-100 dark:text-slate-900"
            onSuccess={() => {
              noteCardDepositPaid(reservationId, cardInvoice.id, staffName).finally(() => {
                setCardInvoice(null);
                router.refresh();
              });
            }}
          />
          <button
            type="button"
            className="text-xs text-slate-400 underline hover:text-slate-600 dark:hover:text-slate-200 sm:w-fit"
            onClick={() => {
              discardOpenDeposit(reservationId).finally(() => setCardInvoice(null));
            }}
          >
            Cancel — no card entered
          </button>
        </div>
      ) : (
        <>
        {quickAmounts.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {quickAmounts
              .filter((q) => q.amount > 0)
              .map((q) => {
                const on = Math.abs(amt - Math.round(q.amount * 100) / 100) < 0.005;
                return (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => setAmount(q.amount.toFixed(2))}
                    className={`rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors ${
                      on
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-500 dark:bg-indigo-950/40 dark:text-indigo-300"
                        : "border-slate-200 bg-white text-slate-600 hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    }`}
                  >
                    {q.label} · ${q.amount.toFixed(2)}
                  </button>
                );
              })}
          </div>
        )}
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="block">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Amount{" "}
              {suggestedAmount != null && (
                <span className="font-normal text-slate-400">
                  {quickAmounts.length > 0 ? `(est. $${estimateTotal?.toFixed(2)} total)` : `(50% of $${estimateTotal?.toFixed(2)} est.)`}
                </span>
              )}
            </span>
            <div className="mt-1 flex items-center gap-1">
              <span className="text-sm text-slate-500">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={`${input} w-28`}
              />
            </div>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Paid with</span>
            <select value={tender} onChange={(e) => setTender(e.target.value as DepositTender)} className={`${input} mt-1 block`}>
              {savedCards.map((c) => (
                <option key={c.id} value={`card:${c.id}`}>
                  {c.card_brand ?? "Card"} •••• {c.last4 ?? "????"}
                </option>
              ))}
              <option value="new_card">+ New card…</option>
              <option value="cash">Cash</option>
              <option value="store_credit" disabled={storeCreditBalance <= 0}>
                Store credit (${storeCreditBalance.toFixed(2)} available)
              </option>
            </select>
          </label>
          {tender === "new_card" && (
            <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <input type="checkbox" checked={saveNewCard} onChange={(e) => setSaveNewCard(e.target.checked)} />
              Save card on file
            </label>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="rounded-lg bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            {pending ? "Working…" : tender === "new_card" ? "Continue to card" : `Apply $${amt > 0 ? amt.toFixed(2) : "0.00"}`}
          </button>
        </div>
        </>
      )}
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
