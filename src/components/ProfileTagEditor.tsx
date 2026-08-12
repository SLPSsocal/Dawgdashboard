"use client";

import { useState, useTransition } from "react";
import { assignProfileTag, removeProfileTagAssignment, updateProfileTagNote } from "@/app/profile-tags/actions";
import Toggle from "@/components/ui/Toggle";
import Link from "next/link";

type Catalog = { id: string; icon: string; name: string; description: string | null };
type Assigned = { assignmentId: string; tagId: string; icon: string; name: string; note: string | null };

// Checkbox grid, not a one-at-a-time dropdown — a dog can be Not Groupable
// AND a Poop Eater AND Dog Aggressive at once, and a dropdown made that look
// like a single-choice field. Checking a box assigns the tag immediately;
// unchecking removes it. An optional note field appears under a checked tag
// (e.g. "Not Friends With: Rex") without blocking the checkbox itself.
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
  const [isPending, startTransition] = useTransition();
  const [notes, setNotes] = useState<Record<string, string>>(
    Object.fromEntries(assigned.map((a) => [a.tagId, a.note ?? ""]))
  );

  function toggle(tag: Catalog, checked: boolean) {
    const existing = assigned.find((a) => a.tagId === tag.id);
    if (checked) {
      const fd = new FormData();
      fd.set("tag_id", tag.id);
      fd.set("note", notes[tag.id] ?? "");
      if (staffName) fd.set("created_by", staffName);
      startTransition(async () => {
        await assignProfileTag(targetType, targetId, fd);
      });
    } else if (existing) {
      startTransition(async () => {
        await removeProfileTagAssignment(targetType, targetId, existing.assignmentId);
      });
    }
  }

  function saveNote(tag: Catalog) {
    const existing = assigned.find((a) => a.tagId === tag.id);
    if (!existing) return;
    const value = notes[tag.id] ?? "";
    if (value === (existing.note ?? "")) return;
    startTransition(async () => {
      await updateProfileTagNote(targetType, targetId, existing.assignmentId, value);
    });
  }

  if (catalog.length === 0) {
    return (
      <p className="text-xs text-slate-400 dark:text-slate-500">
        No tags set up yet — <Link href="/profile-tags" className="underline">add some</Link>.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {catalog.map((tag) => {
        const existing = assigned.find((a) => a.tagId === tag.id);
        const checked = Boolean(existing);
        return (
          <div
            key={tag.id}
            className={`rounded-lg border px-3 py-2 text-sm ${
              checked
                ? "border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-slate-800"
                : "border-slate-200 dark:border-slate-800"
            }`}
          >
            {/* Toggle instead of checkbox (Kathleen's request) — same
                multi-select behavior, just a clearer on/off control. */}
            <button
              type="button"
              disabled={isPending}
              onClick={() => toggle(tag, !checked)}
              className="flex w-full cursor-pointer items-center gap-2 text-left disabled:opacity-60"
            >
              <Toggle checked={checked} label={`${checked ? "Remove" : "Add"} ${tag.name}`} />
              <span>
                {tag.icon} {tag.name}
              </span>
            </button>
            {checked && (
              <input
                value={notes[tag.id] ?? ""}
                onChange={(e) => setNotes((n) => ({ ...n, [tag.id]: e.target.value }))}
                onBlur={() => saveNote(tag)}
                placeholder="Note (optional)…"
                className="mt-1.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
