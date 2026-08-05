"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { addCareLog } from "@/app/care-logs/actions";

const TYPE_LABEL: Record<string, string> = {
  feeding: "🍽️ Feeding",
  medication: "💊 Medication",
  note: "📝 Note",
};

export default function CareLogForm({
  reservationId,
  animalId,
  facilityId,
  staffName,
}: {
  reservationId: string;
  animalId: string;
  facilityId: string;
  staffName?: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await addCareLog(reservationId, animalId, facilityId, formData);
        setSaved(true);
        formRef.current?.reset();
        // revalidatePath alone marks the server cache stale but doesn't
        // re-render the route the user is already sitting on — without this
        // the new entry only shows up after a manual reload.
        router.refresh();
        setTimeout(() => setSaved(false), 2000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save — try again.");
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          name="log_type"
          defaultValue="feeding"
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        >
          {Object.entries(TYPE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          name="logged_by"
          defaultValue={staffName ?? ""}
          placeholder="Logged by"
          className="w-32 rounded-lg border border-slate-300 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        />
      </div>

      <textarea
        name="notes"
        required
        rows={2}
        placeholder="Ate breakfast + dinner, no issues… or: gave 1 tab Rimadyl with dinner…"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
      />

      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
      {saved && <p className="text-xs text-green-600 dark:text-green-400">Logged.</p>}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50 sm:w-fit dark:bg-slate-100 dark:text-slate-900"
      >
        {isPending ? "Saving…" : "+ Add Log Entry"}
      </button>
    </form>
  );
}
