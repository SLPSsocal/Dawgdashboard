"use client";

import { useMemo, useState } from "react";

type Parent = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  created_at: string;
  animals: { name: string }[] | null;
};

type SortKey = "first_name" | "last_name" | "created_at" | "email" | "phone" | "animals";

function animalNames(p: Parent) {
  return (p.animals ?? []).map((a) => a.name).join(", ");
}

function Th({
  label,
  field,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  field: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (field: SortKey) => void;
}) {
  const active = sortKey === field;
  return (
    <th
      onClick={() => onSort(field)}
      className="cursor-pointer select-none whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
    >
      {label} {active ? (sortDir === "asc" ? "▲" : "▼") : ""}
    </th>
  );
}

export default function SearchableParentsList({ parents }: { parents: Parent[] }) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("last_name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function toggleSort(field: SortKey) {
    if (field === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(field);
      setSortDir("asc");
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = !q
      ? parents
      : parents.filter((p) => {
          const fullName = `${p.first_name} ${p.last_name}`;
          return [fullName, p.phone, p.email, animalNames(p)]
            .filter((v): v is string => Boolean(v))
            .some((v) => v.toLowerCase().includes(q));
        });

    const sorted = [...base];
    const dir = sortDir === "asc" ? 1 : -1;
    sorted.sort((a, b) => {
      switch (sortKey) {
        case "first_name":
          return dir * a.first_name.localeCompare(b.first_name);
        case "last_name":
          return dir * a.last_name.localeCompare(b.last_name);
        case "created_at":
          return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        case "email":
          return dir * (a.email ?? "").localeCompare(b.email ?? "");
        case "phone":
          return dir * (a.phone ?? "").localeCompare(b.phone ?? "");
        case "animals":
          return dir * animalNames(a).localeCompare(animalNames(b));
      }
    });
    return sorted;
  }, [parents, query, sortKey, sortDir]);

  return (
    <div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name, phone, email, or animal…"
        className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      />

      {filtered.length === 0 && (
        <p className="mt-8 text-sm text-slate-400 dark:text-slate-500">No matches.</p>
      )}

      {/* Desktop: sortable table — click a header to sort by it. */}
      <div className="mt-4 hidden overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 md:block">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
            <tr>
              <Th label="First Name" field="first_name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <Th label="Last Name" field="last_name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <Th label="Email" field="email" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <Th label="Phone" field="phone" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <Th label="Animal(s)" field="animals" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <Th label="Date Created" field="created_at" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40">
                <td className="px-3 py-2">
                  <a href={`/parents/${p.id}`} className="font-medium hover:underline">
                    {p.first_name}
                  </a>
                </td>
                <td className="px-3 py-2">
                  <a href={`/parents/${p.id}`} className="font-medium hover:underline">
                    {p.last_name}
                  </a>
                </td>
                <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{p.email ?? "—"}</td>
                <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{p.phone ?? "—"}</td>
                <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{animalNames(p) || "—"}</td>
                <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
                  {new Date(p.created_at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: cards. */}
      <div className="mt-4 grid grid-cols-1 gap-2 md:hidden">
        {filtered.map((p) => (
          <a
            key={p.id}
            href={`/parents/${p.id}`}
            className="rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600"
          >
            <div className="font-medium">{p.first_name} {p.last_name}</div>
            <div className="text-sm text-slate-500 dark:text-slate-400">{p.phone ?? "—"} · {p.email ?? "—"}</div>
            {animalNames(p) && (
              <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">🐾 {animalNames(p)}</div>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}
