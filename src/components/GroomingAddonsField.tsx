"use client";

import { useState } from "react";
import { parseGroomingAddons, type GroomingAddon } from "@/lib/groomingAddons";

type MenuItem = { name: string; minPrice?: number | null };

/**
 * Add-on services for a grooming booking (Daisy + Kathleen): tick extras
 * from the grooming menu — de-shed, flea bath, teeth, special shampoo — each
 * with its own price. Works two ways:
 *   - controlled (`value` + `onChange`) inside the client BookingForm
 *   - uncontrolled inside a server-action <form>, posting a hidden
 *     `grooming_addons` JSON field (the edit form on /reservations/[id]).
 */
export default function GroomingAddonsField({
  menu,
  mainService,
  value,
  onChange,
  defaultValue,
  name = "grooming_addons",
}: {
  menu: MenuItem[];
  /** The primary service — excluded from the add-on list. */
  mainService?: string | null;
  value?: GroomingAddon[];
  onChange?: (next: GroomingAddon[]) => void;
  defaultValue?: unknown;
  name?: string;
}) {
  const [inner, setInner] = useState<GroomingAddon[]>(() => parseGroomingAddons(defaultValue ?? []));
  const addons = value ?? inner;
  const update = (next: GroomingAddon[]) => {
    if (onChange) onChange(next);
    else setInner(next);
  };

  const options = menu.filter((m) => m.name !== mainService);
  // Add-ons that were booked under a menu item since renamed/retired still
  // have to show (and bill) — keep them at the top.
  const orphans = addons.filter((a) => !options.some((o) => o.name === a.name));
  const [open, setOpen] = useState(addons.length > 0);

  function toggle(item: MenuItem) {
    const has = addons.some((a) => a.name === item.name);
    update(
      has
        ? addons.filter((a) => a.name !== item.name)
        : [...addons, { name: item.name, price: item.minPrice != null ? Number(item.minPrice) : 0 }]
    );
  }
  function setPrice(nameOf: string, raw: string) {
    const n = Number(raw);
    update(addons.map((a) => (a.name === nameOf ? { ...a, price: Number.isFinite(n) && n >= 0 ? n : 0 } : a)));
  }

  const total = addons.reduce((s, a) => s + (a.price || 0), 0);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-900/40">
      {!onChange && <input type="hidden" name={name} value={JSON.stringify(addons)} />}
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-left">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Add-on services
          {addons.length > 0 && (
            <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">
              {addons.length} · ${total.toFixed(2)}
            </span>
          )}
        </span>
        <span className="text-xs text-slate-400">{open ? "Hide" : addons.length > 0 ? "Edit" : "+ Add"}</span>
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-1.5">
          {options.length === 0 && orphans.length === 0 && (
            <p className="text-xs text-slate-400">No other services on the grooming menu yet.</p>
          )}
          {[...orphans.map((a) => ({ name: a.name, minPrice: a.price })), ...options].map((item) => {
            const picked = addons.find((a) => a.name === item.name);
            return (
              <div key={item.name} className="flex items-center gap-2">
                <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input type="checkbox" checked={Boolean(picked)} onChange={() => toggle(item)} />
                  {item.name}
                </label>
                {picked && (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-slate-400">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={picked.price}
                      onChange={(e) => setPrice(item.name, e.target.value)}
                      className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                )}
              </div>
            );
          })}
          <p className="pt-1 text-[11px] text-slate-400 dark:text-slate-500">
            Each add-on bills as its own grooming line at checkout. Prices prefill from the menu — adjust per dog.
          </p>
        </div>
      )}
    </div>
  );
}
