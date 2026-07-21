"use client";

import { useMemo, useState } from "react";

export type ParentOption = { id: string; name: string; phone: string | null; email: string | null };

// Same typeahead pattern as AnimalPicker, but for the walk-in sale form's
// customer field — includes an explicit "no account" escape hatch since a
// parent can walk in and buy something without ever being in the system.
export default function ParentPicker({
  parents,
  onSelect,
}: {
  parents: ParentOption[];
  onSelect: (p: ParentOption | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ParentOption | null>(null);
  const [openList, setOpenList] = useState(false);
  const [walkIn, setWalkIn] = useState(false);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? parents.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.phone ?? "").includes(q) ||
            (p.email ?? "").toLowerCase().includes(q)
        )
      : parents;
    return base.slice(0, 8);
  }, [parents, query]);

  function choose(p: ParentOption | null) {
    setSelected(p);
    onSelect(p);
  }

  if (walkIn) {
    return (
      <div>
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Customer</span>
        <div className="mt-1 flex items-center justify-between rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
          <span className="text-slate-500 dark:text-slate-400">Walk-in — no account</span>
          <button
            type="button"
            onClick={() => {
              setWalkIn(false);
              choose(null);
            }}
            className="text-xs text-indigo-600 underline dark:text-indigo-400"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Customer</span>
        <button
          type="button"
          onClick={() => {
            setWalkIn(true);
            setQuery("");
            choose(null);
          }}
          className="text-xs text-slate-400 underline dark:text-slate-500"
        >
          Walk-in (no account)
        </button>
      </div>
      <input
        value={selected ? selected.name : query}
        onChange={(e) => {
          choose(null);
          setQuery(e.target.value);
          setOpenList(true);
        }}
        onFocus={() => setOpenList(true)}
        onBlur={() => setTimeout(() => setOpenList(false), 150)}
        placeholder="Type a parent name, phone, or email…"
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      />
      {openList && (
        <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {results.length === 0 && (
            <p className="px-3 py-3 text-sm text-slate-400 dark:text-slate-500">No matches — try Walk-in instead.</p>
          )}
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={() => {
                choose(p);
                setQuery("");
                setOpenList(false);
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <span className="font-medium">{p.name}</span>
              <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">{p.phone ?? p.email ?? ""}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
