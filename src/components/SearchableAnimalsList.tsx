"use client";

import { useMemo, useState } from "react";
import { overallVaccineStatus, vaccineShield } from "@/lib/vaccines";
import ProfileTagBadges from "@/components/ProfileTagBadges";

type Animal = {
  id: string;
  name: string;
  breed: string | null;
  size: string | null;
  photo_url: string | null;
  created_at: string;
  rabies_expiration?: string | null;
  distemper_expiration?: string | null;
  bordetella_expiration?: string | null;
  parents: { first_name: string; last_name: string } | null;
};

type SortKey = "name_asc" | "name_desc" | "newest" | "oldest";

export default function SearchableAnimalsList({
  animals,
  tagsByAnimal,
}: {
  animals: Animal[];
  tagsByAnimal?: Record<string, { icon: string; name: string; note?: string | null }[]>;
}) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name_asc");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = !q
      ? animals
      : animals.filter((a) => {
          const ownerName = a.parents ? `${a.parents.first_name} ${a.parents.last_name}` : "";
          return [a.name, a.breed, a.size, ownerName]
            .filter((v): v is string => Boolean(v))
            .some((v) => v.toLowerCase().includes(q));
        });

    const sorted = [...base];
    sorted.sort((a, b) => {
      switch (sortKey) {
        case "name_asc":
          return a.name.localeCompare(b.name);
        case "name_desc":
          return b.name.localeCompare(a.name);
        case "newest":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "oldest":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
    });
    return sorted;
  }, [animals, query, sortKey]);

  return (
    <div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by animal, breed, or owner…"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          <option value="name_asc">Name (A–Z)</option>
          <option value="name_desc">Name (Z–A)</option>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>

      {filtered.length === 0 && (
        <p className="mt-8 text-sm text-slate-400 dark:text-slate-500">No matches.</p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {filtered.map((a) => (
          <a
            key={a.id}
            href={`/animals/${a.id}`}
            className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600"
          >
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
              {a.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.photo_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-lg">🐾</div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-medium">{a.name}</span>
                {(() => {
                  const status = overallVaccineStatus({
                    rabies_expiration: a.rabies_expiration,
                    distemper_expiration: a.distemper_expiration,
                    bordetella_expiration: a.bordetella_expiration,
                  });
                  if (status === "expired" || status === "expiring_soon") {
                    const shield = vaccineShield(status);
                    return (
                      <span title={shield.label}>
                        {shield.icon}
                      </span>
                    );
                  }
                  return null;
                })()}
                <ProfileTagBadges tags={tagsByAnimal?.[a.id] ?? []} />
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">{a.breed ?? "—"} · {a.size ?? "—"}</div>
              <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                {a.parents ? `${a.parents.first_name} ${a.parents.last_name}` : "No parent linked"}
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
