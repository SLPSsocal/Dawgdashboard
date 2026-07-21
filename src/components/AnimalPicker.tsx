"use client";

import { useMemo, useState } from "react";

export type AnimalOption = {
  id: string;
  name: string;
  breed: string | null;
  parentName: string | null;
};

// Typeahead picker for the New Booking form. Keeps the same "type to
// filter, click to pick" pattern as the Quick Check-in popup so front
// desk staff find dogs fast even with a long shared animal list.
export default function AnimalPicker({
  animals,
  onSelect,
}: {
  animals: AnimalOption[];
  onSelect?: (a: AnimalOption | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AnimalOption | null>(null);
  const [openList, setOpenList] = useState(false);

  function choose(a: AnimalOption | null) {
    setSelected(a);
    onSelect?.(a);
  }

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? animals.filter(
          (a) =>
            a.name.toLowerCase().includes(q) ||
            (a.parentName ?? "").toLowerCase().includes(q)
        )
      : animals;
    return base.slice(0, 8);
  }, [animals, query]);

  return (
    <div className="relative">
      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
        Dog<span className="text-red-500"> *</span>
      </span>
      <input type="hidden" name="animal_id" value={selected?.id ?? ""} />
      <input
        value={selected ? `${selected.name}${selected.parentName ? " · " + selected.parentName : ""}` : query}
        onChange={(e) => {
          choose(null);
          setQuery(e.target.value);
          setOpenList(true);
        }}
        onFocus={() => setOpenList(true)}
        onBlur={() => setTimeout(() => setOpenList(false), 150)}
        placeholder="Type a dog or parent name…"
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      />
      {openList && (
        <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {results.length === 0 && (
            <p className="px-3 py-3 text-sm text-slate-400 dark:text-slate-500">
              No dogs found.{" "}
              <a href="/animals/new" className="text-indigo-600 underline dark:text-indigo-400">
                Add a new animal
              </a>
            </p>
          )}
          {results.map((a) => (
            <button
              key={a.id}
              type="button"
              onMouseDown={() => {
                choose(a);
                setQuery("");
                setOpenList(false);
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <span className="font-medium">{a.name}</span>
              <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
                {a.parentName ?? ""} {a.breed ? `· ${a.breed}` : ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
