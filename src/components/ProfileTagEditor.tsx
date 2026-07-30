"use client";

import { useState, useTransition } from "react";
import { assignProfileTag, removeProfileTagAssignment } from "@/app/profile-tags/actions";

type Catalog = { id: string; icon: string; name: string; description: string | null };
type Assigned = { assignmentId: string; tagId: string; icon: string; name: string; note: string | null };

export default function ProfileTagEditor({
  targetType,
  targetId,
  catalog,
  assigned,
  staffName,
}: {
  targetType: "animal" | "parent";
  targetId: string;
  catalog: Catalog[];
  assigned: Assigned[];
  staffName?: string | null;
}) {
  const [tagId, setTagId] = useState(catalog[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  // Offer only tags not already attached — no point letting staff add the
  // same "Dog Aggressive" icon twice.
  const available = catalog.filter((c) => !assigned.some((a) => a.tagId === c.id));

  function add() {
    if (!tagId) return;
    const fd = new FormData();
    fd.set("tag_id", tagId);
    fd.set("note", note);
    if (staffName) fd.set("created_by", staffName);
    startTransition(async () => {
      await assignProfileTag(targetType, targetId, fd);
      setNote("");
    });
  }

  function remove(assignmentId: string) {
    startTransition(async () => {
      await removeProfileTagAssignment(targetType, targetId, assignmentId);
    });
  }

  return (
    <div>
      {assigned.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {assigned.map((a) => (
            <span
              key={a.assignmentId}
              title={a.note ?? a.name}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
            >
              <span>{a.icon}</span>
              <span>{a.name}</span>
              {a.note && <span className="text-slate-400 dark:text-slate-500">— {a.note}</span>}
              <button
                type="button"
                disabled={isPending}
                onClick={() => remove(a.assignmentId)}
                className="ml-1 text-slate-400 hover:text-red-500"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {available.length > 0 && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="text-xs">
            <span className="block text-slate-500 dark:text-slate-400">Tag</span>
            <select
              value={tagId}
              onChange={(e) => setTagId(e.target.value)}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              {available.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex-1 text-xs">
            <span className="block text-slate-500 dark:text-slate-400">Note (optional)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Details for this dog/parent…"
              className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
          <button
            type="button"
            disabled={isPending}
            onClick={add}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:border-slate-500 disabled:opacity-50 dark:border-slate-700 dark:hover:border-slate-500"
          >
            + Add Tag
          </button>
        </div>
      )}
      {catalog.length === 0 && (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          No tags set up yet — <a href="/profile-tags" className="underline">add some</a>.
        </p>
      )}
    </div>
  );
}
