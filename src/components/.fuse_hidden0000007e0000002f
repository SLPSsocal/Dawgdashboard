"use client";

import { useMemo, useState } from "react";

type Animal = {
  id: string;
  name: string;
  breed: string | null;
  size: string | null;
  photo_url: string | null;
  parents: { first_name: string; last_name: string } | null;
};

export default function SearchableAnimalsList({ animals }: { animals: Animal[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return animals;
    return animals.filter((a) => {
      const ownerName = a.parents ? `${a.parents.first_name} ${a.parents.last_name}` : "";
      return [a.name, a.breed, a.size, ownerName]
        .filter((v): v is string => Boolean(v))
        .some((v) => v.toLowerCase().includes(q));
    });
  }, [animals, query]);

  return (
    <div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by animal, breed, or owner…"
        className="mt-4 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
      />

      {filtered.length === 0 && (
        <p className="mt-8 text-sm text-neutral-400 dark:text-neutral-500">No matches.</p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {filtered.map((a) => (
          <a
            key={a.id}
            href={`/animals/${a.id}`}
            className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-4 hover:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-600"
          >
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800">
              {a.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.photo_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-lg">🐾</div>
              )}
            </div>
            <div>
              <div className="font-medium">{a.name}</div>
              <div className="text-sm text-neutral-500 dark:text-neutral-400">{a.breed ?? "—"} · {a.size ?? "—"}</div>
              <div className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
                {a.parents ? `${a.parents.first_name} ${a.parents.last_name}` : "No parent linked"}
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
