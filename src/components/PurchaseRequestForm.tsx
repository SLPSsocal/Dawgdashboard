"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  formatRequestId,
  sodaWarningLabels,
  type CreatedPurchaseRequest,
  type PurchaseRequestItemInput,
} from "@/lib/purchaseRequests";
import {
  formatCatalogCategory,
  formatLastRequestLine,
  groupCatalogByCategory,
  isExactPreferred,
  matchesCatalogSearch,
  packHint,
  parseCatalogHistory,
  type CatalogHistoryMap,
  type PurchaseCatalogItem,
} from "@/lib/purchaseCatalog";

type Facility = { id: string; name: string; slug: string };

type LineState = { quantity: string; urgent: boolean };

type CustomDraft = {
  key: string;
  item: string;
  brand: string;
  quantity: string;
  urgent: boolean;
};

function newCustom(): CustomDraft {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    item: "",
    brand: "",
    quantity: "",
    urgent: false,
  };
}

const fieldCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-[15px] text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-indigo-500 dark:focus:ring-indigo-950";

const qtyCls =
  "w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-center text-[15px] tabular-nums text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-indigo-500 dark:focus:ring-indigo-950";

export default function PurchaseRequestForm({
  facilities,
  catalog,
  defaultFacilityId,
  defaultRequestedBy,
  showQueueLink = false,
  hasAppHeader = false,
}: {
  facilities: Facility[];
  catalog: PurchaseCatalogItem[];
  defaultFacilityId?: string;
  defaultRequestedBy?: string;
  showQueueLink?: boolean;
  hasAppHeader?: boolean;
}) {
  const [facilityId, setFacilityId] = useState(defaultFacilityId ?? "");
  const [requestedBy, setRequestedBy] = useState(defaultRequestedBy ?? "");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<Record<string, LineState>>({});
  const [customRows, setCustomRows] = useState<CustomDraft[]>([]);
  const [history, setHistory] = useState<CatalogHistoryMap>({});
  const [historyReady, setHistoryReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedPurchaseRequest | null>(null);

  useEffect(() => {
    if (!facilityId) {
      setHistory({});
      setHistoryReady(false);
      return;
    }
    const ac = new AbortController();
    setHistoryReady(false);
    fetch(`/api/purchase-catalog/history?facilityId=${encodeURIComponent(facilityId)}`, {
      signal: ac.signal,
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { history?: unknown };
        if (ac.signal.aborted) return;
        setHistory(parseCatalogHistory(data.history));
      })
      .catch(() => {
        if (ac.signal.aborted) return;
        setHistory({});
      })
      .finally(() => {
        if (!ac.signal.aborted) setHistoryReady(true);
      });
    return () => ac.abort();
  }, [facilityId]);

  const visibleCatalog = useMemo(
    () => catalog.filter((item) => matchesCatalogSearch(item, search)),
    [catalog, search]
  );
  const grouped = useMemo(() => groupCatalogByCategory(visibleCatalog), [visibleCatalog]);

  const selectedItems: PurchaseRequestItemInput[] = useMemo(() => {
    const fromCatalog: PurchaseRequestItemInput[] = [];
    for (const item of catalog) {
      const qty = Number(lines[item.id]?.quantity);
      if (!(qty > 0)) continue;
      fromCatalog.push({
        catalogItemId: item.id,
        item: item.name,
        brand: item.brand,
        quantity: qty,
        urgent: Boolean(lines[item.id]?.urgent),
      });
    }
    const fromCustom: PurchaseRequestItemInput[] = customRows
      .filter((row) => row.item.trim() && Number(row.quantity) > 0)
      .map((row) => ({
        item: row.item.trim(),
        brand: row.brand.trim() || undefined,
        quantity: Number(row.quantity),
        urgent: row.urgent,
      }));
    return [...fromCatalog, ...fromCustom];
  }, [catalog, lines, customRows]);

  const sodaLabels = useMemo(() => sodaWarningLabels(selectedItems), [selectedItems]);
  const selectedCount = selectedItems.length;

  function setLine(id: string, patch: Partial<LineState>) {
    setLines((prev) => {
      const current = prev[id] ?? { quantity: "", urgent: false };
      return { ...prev, [id]: { ...current, ...patch } };
    });
  }

  function updateCustom(key: string, patch: Partial<CustomDraft>) {
    setCustomRows((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
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
    const incompleteCustom = customRows.filter(
      (row) => row.item.trim() && !(Number(row.quantity) > 0)
    );
    if (incompleteCustom.length > 0) {
      setError("Custom items need a quantity greater than 0, or clear the name to skip.");
      return;
    }
    const namedQtyMissingName = customRows.filter(
      (row) => !row.item.trim() && Number(row.quantity) > 0
    );
    if (namedQtyMissingName.length > 0) {
      setError("Custom items need a name.");
      return;
    }
    if (selectedItems.length < 1) {
      setError("Enter a quantity on at least one catalog item (or add a custom line).");
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
          items: selectedItems,
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
              setLines({});
              setCustomRows([]);
              setNotes("");
              setSearch("");
              setError(null);
            }}
            className="inline-flex h-11 items-center justify-center rounded-[10px] bg-indigo-600 px-4 text-[14px] font-semibold text-white hover:bg-indigo-700"
          >
            Submit another
          </button>
          {showQueueLink ? (
            <Link
              href="/purchase-requests"
              className="inline-flex h-11 items-center justify-center rounded-[10px] border border-slate-300 px-4 text-[14px] font-medium text-slate-700 hover:border-slate-400 dark:border-slate-600 dark:text-slate-200"
            >
              View new requests
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 pb-24 sm:pb-4">
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

      <div
        className={`sticky z-20 -mx-4 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 sm:-mx-5 sm:px-5 ${
          hasAppHeader ? "top-14" : "top-0"
        }`}
      >
        <label className="block">
          <span className="sr-only">Search catalog</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search supplies…"
            className={fieldCls}
          />
        </label>
        <p className="mt-1.5 text-[12px] text-slate-500 dark:text-slate-400">
          Leave quantity blank (or 0) to skip. Only filled rows are submitted.
          {selectedCount > 0 ? (
            <span className="font-medium text-indigo-700 dark:text-indigo-300">
              {" "}
              {selectedCount} selected
            </span>
          ) : null}
        </p>
      </div>

      {catalog.length === 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          Catalog is empty. Apply{" "}
          <code className="font-mono text-[12px]">
            supabase/migrations/20260908180000_purchase_catalog.sql
          </code>{" "}
          in the Supabase SQL editor, then refresh. You can still add a custom line below.
        </p>
      ) : grouped.length === 0 ? (
        <p className="px-1 py-6 text-center text-[13px] text-slate-500 dark:text-slate-400">
          No catalog items match “{search.trim()}”.
        </p>
      ) : (
        grouped.map((group) => (
          <section key={group.category}>
            <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {formatCatalogCategory(group.category)}
            </h2>
            <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="hidden grid-cols-[minmax(0,1fr)_minmax(9rem,auto)_5.5rem_4.75rem] gap-2 border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:grid dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                <span>Item</span>
                <span>Last request</span>
                <span className="text-center">Qty</span>
                <span className="text-center">Urgent</span>
              </div>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {group.items.map((item) => {
                  const line = lines[item.id] ?? { quantity: "", urgent: false };
                  const selected = Number(line.quantity) > 0;
                  const lastText = formatLastRequestLine(
                    history[item.id],
                    Boolean(facilityId),
                    historyReady
                  );
                  const hint = packHint(item);
                  const locked = isExactPreferred(item);
                  return (
                    <li
                      key={item.id}
                      className={`px-3 py-3 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(9rem,auto)_5.5rem_4.75rem] sm:items-center sm:gap-2 sm:py-2 ${
                        selected ? "bg-indigo-50/70 dark:bg-indigo-950/20" : "bg-white dark:bg-slate-900"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-[14px] font-medium leading-snug text-slate-900 dark:text-slate-50">
                          {item.name}
                        </p>
                        <p className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">
                          {item.brand}
                          {hint ? ` · ${hint}` : ""}
                        </p>
                        {item.notes ? (
                          <p
                            className={`mt-1 text-[11px] ${
                              locked
                                ? "font-medium text-amber-800 dark:text-amber-300"
                                : "text-slate-400 dark:text-slate-500"
                            }`}
                          >
                            {item.notes}
                          </p>
                        ) : null}
                      </div>
                      <p className="mt-2 text-[12px] text-slate-400 sm:mt-0 dark:text-slate-500">{lastText}</p>
                      <label className="mt-2 block sm:mt-0">
                        <span className="sr-only">Quantity for {item.name}</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="any"
                          value={line.quantity}
                          placeholder="0"
                          onChange={(e) => setLine(item.id, { quantity: e.target.value })}
                          className={qtyCls}
                        />
                      </label>
                      <label className="mt-2 flex h-10 items-center justify-start gap-2 text-[13px] font-medium text-slate-600 sm:mt-0 sm:h-auto sm:justify-center dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={line.urgent}
                          onChange={(e) => setLine(item.id, { urgent: e.target.checked })}
                          aria-label={`Urgent: ${item.name}`}
                          className="h-4 w-4 accent-indigo-600"
                        />
                        <span className="sm:hidden">Urgent</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        ))
      )}

      <section className="rounded-xl border border-dashed border-slate-300 p-3 dark:border-slate-700">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[14px] font-semibold text-slate-800 dark:text-slate-100">
              Custom / other
            </h2>
            <p className="text-[12px] text-slate-500 dark:text-slate-400">
              Not on the list? Add a free-text line. Leave it blank if you don&apos;t need it.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCustomRows((rows) => [...rows, newCustom()])}
            className="inline-flex h-9 shrink-0 items-center rounded-lg border border-slate-300 px-3 text-[13px] font-medium text-slate-700 hover:border-slate-500 dark:border-slate-600 dark:text-slate-200"
          >
            + Add
          </button>
        </div>
        {customRows.length > 0 && (
          <ul className="mt-3 flex flex-col gap-3">
            {customRows.map((row, index) => (
              <li
                key={row.key}
                className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">
                    Custom {index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCustomRows((rows) => rows.filter((r) => r.key !== row.key))}
                    className="text-[13px] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    Remove
                  </button>
                </div>
                <label className="block">
                  <span className="text-[12px] font-medium text-slate-600 dark:text-slate-300">Item</span>
                  <input
                    value={row.item}
                    onChange={(e) => updateCustom(row.key, { item: e.target.value })}
                    placeholder="e.g. Replacement faucet"
                    className={`mt-1 ${fieldCls}`}
                  />
                </label>
                <div className="mt-2 grid grid-cols-[1fr_5.5rem] gap-2 sm:grid-cols-[1fr_5.5rem_auto]">
                  <label className="block">
                    <span className="text-[12px] font-medium text-slate-600 dark:text-slate-300">
                      Brand
                    </span>
                    <input
                      value={row.brand}
                      onChange={(e) => updateCustom(row.key, { brand: e.target.value })}
                      placeholder="Optional"
                      className={`mt-1 ${fieldCls}`}
                    />
                  </label>
                  <label className="block">
                    <span className="text-[12px] font-medium text-slate-600 dark:text-slate-300">
                      Qty
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      value={row.quantity}
                      placeholder="0"
                      onChange={(e) => updateCustom(row.key, { quantity: e.target.value })}
                      className={`mt-1 ${qtyCls}`}
                    />
                  </label>
                  <label className="col-span-2 mt-1 inline-flex h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 text-[13px] font-medium sm:col-span-1 sm:mt-6 dark:border-slate-700">
                    <input
                      type="checkbox"
                      checked={row.urgent}
                      onChange={(e) => updateCustom(row.key, { urgent: e.target.checked })}
                      className="h-4 w-4 accent-indigo-600"
                    />
                    Urgent
                  </label>
                </div>
              </li>
            ))}
          </ul>
        )}
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

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none dark:border-slate-800 dark:bg-slate-900/95 sm:dark:bg-transparent">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-12 w-full items-center justify-center rounded-[10px] bg-indigo-600 text-[15px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 dark:bg-indigo-500"
        >
          {submitting
            ? "Submitting…"
            : selectedCount > 0
              ? `Submit request (${selectedCount})`
              : "Submit request"}
        </button>
      </div>
    </form>
  );
}
