"use client";

import { useMemo, useState, useTransition } from "react";
import {
  assignToAccountCode,
  unassignFromAccountCode,
  type ItemType,
} from "@/app/admin/account-codes/actions";

export type AssignableItem = {
  itemType: ItemType;
  itemId: string;
  name: string;
  /** Which group it appears under on the left. */
  group: string;
  accountCodeId: string | null;
};

export type AccountCode = { id: string; name: string };

const GROUP_ORDER = ["Reservation Types", "Grooming Services", "Retail Items"];

export default function AccountCodeBoard({
  items,
  codes,
}: {
  items: AssignableItem[];
  codes: AccountCode[];
}) {
  const [query, setQuery] = useState("");
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [dragging, setDragging] = useState<AssignableItem | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  // Tap-to-select is the accessible/touch path — HTML5 drag events don't
  // exist on touch devices and can't be synthesised by most automation.
  const [selected, setSelected] = useState<AssignableItem | null>(null);
  const [isPending, startTransition] = useTransition();
  const [openCode, setOpenCode] = useState<string | null>(codes[0]?.id ?? null);

  const key = (i: AssignableItem) => `${i.itemType}:${i.itemId}`;

  const left = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (unassignedOnly && i.accountCodeId) return false;
      if (q && !i.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, query, unassignedOnly]);

  const byGroup = useMemo(() => {
    const m = new Map<string, AssignableItem[]>();
    for (const i of left) {
      const arr = m.get(i.group) ?? [];
      arr.push(i);
      m.set(i.group, arr);
    }
    return m;
  }, [left]);

  const byCode = useMemo(() => {
    const m = new Map<string, AssignableItem[]>();
    for (const i of items) {
      if (!i.accountCodeId) continue;
      const arr = m.get(i.accountCodeId) ?? [];
      arr.push(i);
      m.set(i.accountCodeId, arr);
    }
    return m;
  }, [items]);

  function commitAssign(item: AssignableItem, codeId: string) {
    startTransition(async () => {
      await assignToAccountCode(item.itemType, item.itemId, codeId);
      setSelected(null);
    });
  }

  function commitUnassign(item: AssignableItem) {
    startTransition(async () => {
      await unassignFromAccountCode(item.itemType, item.itemId);
    });
  }

  return (
    <div className={`grid grid-cols-1 gap-4 lg:grid-cols-2 ${isPending ? "opacity-70" : ""}`}>
      {/* ── Left: assignable items ─────────────────────────────────────── */}
      <section>
        <h2 className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">Assignable Items</h2>
        <p className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">
          Drag an item onto a code — or tap it, then tap the code.
        </p>

        <div className="mt-2 flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search items…"
            className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-[14px] dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
          />
          <label className="flex shrink-0 items-center gap-1.5 text-[12px] text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={unassignedOnly}
              onChange={(e) => setUnassignedOnly(e.target.checked)}
            />
            Unassigned only
          </label>
        </div>

        {selected && (
          <div className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-[12px] text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-300">
            <strong>{selected.name}</strong> selected — now tap an account code on the right.{" "}
            <button type="button" onClick={() => setSelected(null)} className="underline">
              cancel
            </button>
          </div>
        )}

        <div className="mt-2 flex flex-col gap-3">
          {GROUP_ORDER.filter((g) => (byGroup.get(g) ?? []).length > 0).map((g) => (
            <div key={g} className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
                {g}
                <span className="ml-1.5 font-normal text-slate-400">{(byGroup.get(g) ?? []).length}</span>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {(byGroup.get(g) ?? []).map((i) => {
                  const isSel = selected && key(selected) === key(i);
                  return (
                    <div
                      key={key(i)}
                      draggable
                      onDragStart={() => setDragging(i)}
                      onDragEnd={() => setDragging(null)}
                      onClick={() => setSelected(isSel ? null : i)}
                      className={`flex cursor-pointer items-center justify-between gap-2 border-b border-slate-50 px-3 py-1.5 text-[13px] last:border-b-0 dark:border-slate-800/60 ${
                        isSel
                          ? "bg-indigo-50 dark:bg-indigo-950/30"
                          : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">{i.name}</span>
                      {i.accountCodeId ? (
                        <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">
                          {codes.find((c) => c.id === i.accountCodeId)?.name ?? "—"}
                        </span>
                      ) : (
                        <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                          unassigned
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {left.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-[13px] text-slate-400 dark:border-slate-700 dark:text-slate-500">
              Nothing matches.
            </p>
          )}
        </div>
      </section>

      {/* ── Right: account codes ───────────────────────────────────────── */}
      <section>
        <h2 className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">Account Codes</h2>
        <p className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">
          Revenue buckets. Reports roll up by these.
        </p>

        <div className="mt-2 flex flex-col gap-2">
          {codes.map((c) => {
            const contents = byCode.get(c.id) ?? [];
            const isOpen = openCode === c.id;
            const isTarget = dropTarget === c.id;
            return (
              <div
                key={c.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropTarget(c.id);
                }}
                onDragLeave={() => setDropTarget((t) => (t === c.id ? null : t))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDropTarget(null);
                  if (dragging) commitAssign(dragging, c.id);
                  setDragging(null);
                }}
                onClick={() => {
                  if (selected) commitAssign(selected, c.id);
                  else setOpenCode(isOpen ? null : c.id);
                }}
                className={`cursor-pointer overflow-hidden rounded-xl border transition-colors ${
                  isTarget || (selected && "ring-2")
                    ? "border-indigo-400 bg-indigo-50/60 dark:border-indigo-600 dark:bg-indigo-950/20"
                    : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                }`}
              >
                <div className="flex items-center justify-between gap-2 px-4 py-2.5">
                  <span className="text-[14px] font-semibold">{c.name}</span>
                  <span className="text-[12px] text-slate-400 dark:text-slate-500">
                    {contents.length} {contents.length === 1 ? "item" : "items"}
                    <span className="ml-2">{isOpen ? "▴" : "▾"}</span>
                  </span>
                </div>

                {isOpen && contents.length > 0 && (
                  <div className="border-t border-slate-100 dark:border-slate-800">
                    {GROUP_ORDER.filter((g) => contents.some((i) => i.group === g)).map((g) => (
                      <div key={g}>
                        <div className="bg-slate-50 px-4 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:bg-slate-950/40 dark:text-slate-500">
                          {g}
                        </div>
                        {contents
                          .filter((i) => i.group === g)
                          .map((i) => (
                            <div
                              key={key(i)}
                              className="group flex items-center justify-between gap-2 px-4 py-1 text-[13px] text-slate-600 dark:text-slate-300"
                            >
                              <span className="min-w-0 flex-1 truncate">{i.name}</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  commitUnassign(i);
                                }}
                                title="Unassign"
                                className="shrink-0 text-[11px] text-slate-300 opacity-0 hover:text-red-500 group-hover:opacity-100 dark:text-slate-600"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                      </div>
                    ))}
                  </div>
                )}
                {isOpen && contents.length === 0 && (
                  <div className="border-t border-slate-100 px-4 py-3 text-[12px] text-slate-400 dark:border-slate-800 dark:text-slate-500">
                    Empty — drop an item here.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
