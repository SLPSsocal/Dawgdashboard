"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  formatRequestId,
  sodaWarningLabels,
  type CreatedPurchaseRequest,
  type PurchaseRequestItemInput,
} from "@/lib/purchaseRequests";

type Facility = { id: string; name: string; slug: string };

type DraftItem = {
  key: string;
  item: string;
  brand: string;
  quantity: string;
  urgent: boolean;
};

function newItem(): DraftItem {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    item: "",
    brand: "",
    quantity: "1",
    urgent: false,
  };
}

const fieldCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-[15px] text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-indigo-500 dark:focus:ring-indigo-950";

export default function PurchaseRequestForm({
  facilities,
  defaultFacilityId,
  defaultRequestedBy,
}: {
  facilities: Facility[];
  defaultFacilityId?: string;
  defaultRequestedBy?: string;
}) {
  const [facilityId, setFacilityId] = useState(defaultFacilityId ?? facilities[0]?.id ?? "");
  const [requestedBy, setRequestedBy] = useState(defaultRequestedBy ?? "");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<DraftItem[]>([newItem()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedPurchaseRequest | null>(null);

  const payloadItems: PurchaseRequestItemInput[] = items.map((row) => ({
    item: row.item,
    brand: row.brand,
    quantity: Number(row.quantity),
    urgent: row.urgent,
  }));
  const sodaLabels = useMemo(() => sodaWarningLabels(payloadItems), [items]);

  function updateItem(key: string, patch: Partial<DraftItem>) {
    setItems((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setItems((rows) => [...rows, newItem()]);
  }

  function removeRow(key: string) {
    setItems((rows) => (rows.length <= 1 ? rows : rows.filter((row) => row.key !== key)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!facilityId) {
      setError("Pick a facility.");
      return;
    }
    if (!requestedBy.trim()) {
      setError("Requested by is required.");
      return;
    }
    if (items.some((row) => !row.item.trim())) {
      setError("Every row needs an item name.");
      return;
    }
    if (items.some((row) => !(Number(row.quantity) > 0))) {
      setError("Quantity must be greater than 0.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/purchase-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facilityId,
          requestedBy: requestedBy.trim(),
          notes: notes.trim() || undefined,
          items: items.map((row) => ({
            item: row.item.trim(),
            brand: row.brand.trim() || undefined,
            quantity: Number(row.quantity),
            urgent: row.urgent,
          })),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        id?: string;
        requestNumber?: number;
        status?: string;
      };
      if (!res.ok || !data.id) {
        throw new Error(data.error ?? "Could not submit. Try again.");
      }
      setCreated({
        id: data.id,
        requestNumber: data.requestNumber ?? 0,
        status: "new",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(
        /fetch failed|Failed to fetch|NetworkError/i.test(message)
          ? "Could not reach the server. Try again."
          : message || "Could not submit. Try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    const pretty = formatRequestId(created.id, created.requestNumber);
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-6 text-center dark:border-emerald-900 dark:bg-emerald-950/30">
        <p className="text-[15px] font-semibold text-emerald-800 dark:text-emerald-300">
          Request {pretty} submitted
        </p>
        <p className="mt-1 text-[13px] text-emerald-700 dark:text-emerald-400">
          Status is <span className="font-semibold">new</span>. Purchasing can pick this up from
          the new-requests list.
        </p>
        <p className="mt-3 break-all font-mono text-[12px] text-emerald-800/80 dark:text-emerald-300/80">
          {created.id}
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => {
              setCreated(null);
              setItems([newItem()]);
              setNotes("");
              setError(null);
            }}
            className="inline-flex h-11 items-center justify-center rounded-[10px] bg-indigo-600 px-4 text-[14px] font-semibold text-white hover:bg-indigo-700"
          >
            Submit another
          </button>
          <Link
            href="/purchase-requests"
            className="inline-flex h-11 items-center justify-center rounded-[10px] border border-slate-300 px-4 text-[14px] font-medium text-slate-700 hover:border-slate-400 dark:border-slate-600 dark:text-slate-200"
          >
            View new requests
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300">
            Facility <span className="text-red-500">*</span>
          </span>
          <select
            required
            value={facilityId}
            onChange={(e) => setFacilityId(e.target.value)}
            className={`mt-1 ${fieldCls}`}
          >
            <option value="">Select facility…</option>
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300">
            Requested by <span className="text-red-500">*</span>
          </span>
          <input
            required
            value={requestedBy}
            onChange={(e) => setRequestedBy(e.target.value)}
            placeholder="Your name"
            autoComplete="name"
            className={`mt-1 ${fieldCls}`}
          />
        </label>
      </div>

      <label className="block">
        <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300">Notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Optional — vendor, where to put it, why it’s needed…"
          className={`mt-1 ${fieldCls}`}
        />
      </label>

      <section>
        <div className="mb-2 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-[14px] font-semibold text-slate-800 dark:text-slate-100">Items</h2>
            <p className="text-[12px] text-slate-500 dark:text-slate-400">
              Add every supply on this request. Quantity must be greater than 0.
            </p>
          </div>
          <button
            type="button"
            onClick={addRow}
            className="hidden h-9 shrink-0 rounded-lg border border-slate-300 px-3 text-[13px] font-medium text-slate-700 hover:border-slate-500 sm:inline-flex sm:items-center dark:border-slate-600 dark:text-slate-200"
          >
            + Add row
          </button>
        </div>

        {/* Desktop spreadsheet grid */}
        <div className="hidden overflow-hidden rounded-xl border border-slate-200 sm:block dark:border-slate-800">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2 font-semibold">Item</th>
                <th className="w-[22%] px-3 py-2 font-semibold">Brand</th>
                <th className="w-24 px-3 py-2 font-semibold">Qty</th>
                <th className="w-20 px-3 py-2 text-center font-semibold">Urgent</th>
                <th className="w-12 px-2 py-2">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((row, index) => (
                <tr key={row.key} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-2 py-1.5">
                    <input
                      value={row.item}
                      onChange={(e) => updateItem(row.key, { item: e.target.value })}
                      placeholder="e.g. Paper towels"
                      required
                      className="w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 outline-none focus:border-indigo-300 focus:bg-white dark:focus:bg-slate-950"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      value={row.brand}
                      onChange={(e) => updateItem(row.key, { brand: e.target.value })}
                      placeholder="Optional"
                      className="w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 outline-none focus:border-indigo-300 focus:bg-white dark:focus:bg-slate-950"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0.01"
                      step="any"
                      required
                      value={row.quantity}
                      onChange={(e) => updateItem(row.key, { quantity: e.target.value })}
                      className="w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 outline-none focus:border-indigo-300 focus:bg-white dark:focus:bg-slate-950"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={row.urgent}
                      onChange={(e) => updateItem(row.key, { urgent: e.target.checked })}
                      aria-label={`Urgent, row ${index + 1}`}
                      className="h-4 w-4 accent-indigo-600"
                    />
                  </td>
                  <td className="px-1 py-1.5 text-center">
                    <button
                      type="button"
                      onClick={() => removeRow(row.key)}
                      disabled={items.length <= 1}
                      aria-label={`Remove row ${index + 1}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Phone: stacked cards, still one page / many rows */}
        <div className="flex flex-col gap-3 sm:hidden">
          {items.map((row, index) => (
            <div
              key={row.key}
              className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">
                  Item {index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeRow(row.key)}
                  disabled={items.length <= 1}
                  className="text-[13px] text-slate-400 disabled:opacity-30"
                >
                  Remove
                </button>
              </div>
              <label className="block">
                <span className="text-[12px] font-medium text-slate-600 dark:text-slate-300">Item</span>
                <input
                  value={row.item}
                  onChange={(e) => updateItem(row.key, { item: e.target.value })}
                  placeholder="e.g. Paper towels"
                  required
                  className={`mt-1 ${fieldCls}`}
                />
              </label>
              <label className="mt-2 block">
                <span className="text-[12px] font-medium text-slate-600 dark:text-slate-300">Brand</span>
                <input
                  value={row.brand}
                  onChange={(e) => updateItem(row.key, { brand: e.target.value })}
                  placeholder="Optional"
                  className={`mt-1 ${fieldCls}`}
                />
              </label>
              <div className="mt-2 flex items-center gap-3">
                <label className="min-w-0 flex-1">
                  <span className="text-[12px] font-medium text-slate-600 dark:text-slate-300">
                    Quantity
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="any"
                    required
                    value={row.quantity}
                    onChange={(e) => updateItem(row.key, { quantity: e.target.value })}
                    className={`mt-1 ${fieldCls}`}
                  />
                </label>
                <label className="mt-5 inline-flex h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 text-[13px] font-medium dark:border-slate-700">
                  <input
                    type="checkbox"
                    checked={row.urgent}
                    onChange={(e) => updateItem(row.key, { urgent: e.target.checked })}
                    className="h-4 w-4 accent-indigo-600"
                  />
                  Urgent
                </label>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addRow}
          className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-lg border border-dashed border-slate-300 text-[14px] font-medium text-slate-600 hover:border-indigo-400 hover:text-indigo-600 sm:hidden dark:border-slate-700 dark:text-slate-300"
        >
          + Add another item
        </button>
      </section>

      {sodaLabels.length > 0 && (
        <div
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
        >
          These look like soda / sports drinks (Coke, Pepsi, Sprite, liquid Gatorade):{" "}
          <span className="font-semibold">{sodaLabels.join(", ")}</span>. You can still submit if
          that&apos;s what you need.
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex h-12 items-center justify-center rounded-[10px] bg-indigo-600 text-[15px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 dark:bg-indigo-500"
      >
        {submitting ? "Submitting…" : "Submit request"}
      </button>
    </form>
  );
}
