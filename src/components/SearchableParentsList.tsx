"use client";

import { useMemo, useState } from "react";

type Parent = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  created_at: string;
};

type SortKey = "name_asc" | "name_desc" | "newest" | "oldest";

export default function SearchableParentsList({ parents }: { parents: Parent[] }) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name_asc");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = !q
      ? parents
      : parents.filter((p) => {
          const fullName = `${p.first_name} ${p.last_name}`;
          return [fullName, p.phone, p.email]
            .filter((v): v is string => Boolean(v))
            .some((v) => v.toLowerCase().includes(q));
        });

    const sorted = [...base];
    sorted.sort((a, b) => {
      switch (sortKey) {
        case "name_asc":
          return `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`);
        case "name_desc":
          return `${b.last_name} ${b.first_name}`.localeCompare(`${a.last_name} ${a.first_name}`);
        case "newest":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "oldest":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
    });
    return sorted;
  }, [parents, query, sortKey]);

  return (
    <div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, phone, or email…"
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
        {filtered.map((p) => (
          <a
            key={p.id}
            href={`/parents/${p.id}`}
            className="rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600"
          >
            <div className="font-medium">{p.first_name} {p.last_name}</div>
            <div className="text-sm text-slate-500 dark:text-slate-400">{p.phone ?? "—"} · {p.email ?? "—"}</div>
          </a>
        ))}
      </div>
    </div>
  );
}
