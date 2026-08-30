"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { updateLeadStatus, updateLeadNotes } from "@/app/leads/actions";

export type LeadRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  petNames: string | null;
  petBreed: string | null;
  source: string | null;
  status: string;
  notes: string | null;
  returningClient: boolean | null;
  servicesInterested: string[] | null;
  convertedParentId: string | null;
  createdAt: string;
};

const STATUSES = ["new", "contacted", "converted", "closed"] as const;

const statusTone: Record<string, string> = {
  new: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
  contacted: "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-400",
  converted: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
  closed: "bg-[#f1f3f6] text-[#8a91a0] dark:bg-slate-800 dark:text-slate-400",
};

// Inbox for website inquiries (Kath, Aug 30) — every message submitted on the
// marketing site lands here as a lead instead of dying in someone's email.
export default function LeadsBoard({ leads }: { leads: LeadRow[] }) {
  const [filter, setFilter] = useState<string>("open");
  const [rows, setRows] = useState(leads);
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();

  const filtered = rows.filter((l) =>
    filter === "all" ? true : filter === "open" ? l.status === "new" || l.status === "contacted" : l.status === filter
  );

  function setStatus(id: string, status: string) {
    setRows((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
    startTransition(() => {
      updateLeadStatus(id, status).catch(() => setRows(leads));
    });
  }

  function saveNote(id: string) {
    const notes = noteDraft[id] ?? "";
    setRows((prev) => prev.map((l) => (l.id === id ? { ...l, notes } : l)));
    startTransition(() => {
      updateLeadNotes(id, notes).catch(() => {});
    });
  }

  const counts = {
    open: rows.filter((l) => l.status === "new" || l.status === "contacted").length,
    converted: rows.filter((l) => l.status === "converted").length,
    closed: rows.filter((l) => l.status === "closed").length,
    all: rows.length,
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {(
          [
            ["open", `Open ${counts.open}`],
            ["converted", `Converted ${counts.converted}`],
            ["closed", `Closed ${counts.closed}`],
            ["all", `All ${counts.all}`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`inline-flex h-9 items-center rounded-full px-3.5 text-[13px] font-medium transition-colors ${
              filter === key
                ? "bg-[#15181d] text-white dark:bg-slate-100 dark:text-slate-900"
                : "border border-[#e3e5ea] bg-white text-[#565d6d] hover:border-[#c4c9d4] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="mt-4 rounded-[14px] border border-dashed border-[#e3e5ea] bg-white px-4 py-8 text-center text-sm text-[#8a91a0] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500">
          {rows.length === 0
            ? "No leads yet. When the website's contact form is connected, every submission will show up here."
            : "Nothing in this view."}
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2.5">
        {filtered.map((l) => {
          const name = [l.firstName, l.lastName].filter(Boolean).join(" ") || "No name given";
          return (
            <div
              key={l.id}
              className="rounded-[14px] border border-[#e3e5ea] bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-semibold text-[#15181d] dark:text-slate-100">{name}</span>
                    <span
                      className={`inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold ${
                        statusTone[l.status] ?? statusTone.closed
                      }`}
                    >
                      {l.status}
                    </span>
                    {l.returningClient && (
                      <span className="inline-flex h-5 items-center rounded-full bg-indigo-50 px-2 text-[11px] font-semibold text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">
                        returning client
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] text-[#8a91a0] dark:text-slate-500">
                    {l.phone && <a href={`tel:${l.phone}`} className="hover:text-indigo-600">📞 {l.phone}</a>}
                    {l.email && <a href={`mailto:${l.email}`} className="hover:text-indigo-600">✉️ {l.email}</a>}
                    <span>
                      {new Date(l.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })} ·{" "}
                      {l.source ?? "website"}
                    </span>
                  </div>
                </div>
                <select
                  value={l.status}
                  onChange={(e) => setStatus(l.id, e.target.value)}
                  className="h-9 rounded-[10px] border border-[#e3e5ea] bg-white px-2 text-[13px] text-[#565d6d] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      Mark {s}
                    </option>
                  ))}
                </select>
              </div>

              {(l.petNames || l.petBreed || (l.servicesInterested?.length ?? 0) > 0) && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12.5px]">
                  {l.petNames && (
                    <span className="rounded-md bg-[#f5f6f8] px-2 py-0.5 dark:bg-slate-800">
                      🐶 {l.petNames}
                      {l.petBreed ? ` · ${l.petBreed}` : ""}
                    </span>
                  )}
                  {(l.servicesInterested ?? []).map((s) => (
                    <span key={s} className="rounded-md bg-[#f5f6f8] px-2 py-0.5 text-[#565d6d] dark:bg-slate-800 dark:text-slate-300">
                      {s}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  value={noteDraft[l.id] ?? l.notes ?? ""}
                  onChange={(e) => setNoteDraft((d) => ({ ...d, [l.id]: e.target.value }))}
                  onBlur={() => {
                    if ((noteDraft[l.id] ?? l.notes ?? "") !== (l.notes ?? "")) saveNote(l.id);
                  }}
                  placeholder="Follow-up notes… (saves when you click away)"
                  className="h-9 min-w-0 flex-1 rounded-[10px] border border-[#e3e5ea] bg-white px-3 text-[13px] placeholder:text-[#c4c9d4] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
                {l.status !== "converted" && (
                  <Link
                    href="/parents/new"
                    className="inline-flex h-9 items-center rounded-[10px] bg-indigo-600 px-3 text-[13px] font-semibold text-white hover:bg-indigo-700"
                  >
                    + Create parent
                  </Link>
                )}
                {l.convertedParentId && (
                  <Link
                    href={`/parents/${l.convertedParentId}`}
                    className="inline-flex h-9 items-center rounded-[10px] border border-emerald-300 bg-white px-3 text-[13px] font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-transparent dark:text-emerald-400"
                  >
                    View parent →
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
