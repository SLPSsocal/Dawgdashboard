"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { addGroomingNote } from "@/app/grooming-notes/actions";

// The grooming-notes entry form, modeled on the old Airtable form the salon
// used daily — trimmed to the questions the system can't answer on its own.
// Services performed, blade/handling notes, time needed next visit, a note
// for the parent, preferred groomer, and an after photo.
export default function GroomingNoteForm({
  reservationId,
  animalId,
  facilityId,
  staffName,
  serviceOptions = [],
  groomerOptions = [],
  preferredGroomer = null,
}: {
  reservationId: string;
  animalId: string;
  facilityId: string;
  staffName?: string | null;
  /** Grooming menu names for the "what did you do" checkboxes. */
  serviceOptions?: string[];
  /** Specialist names for groomer + preferred-groomer selects. */
  groomerOptions?: string[];
  preferredGroomer?: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const photoUrlRef = useRef<string>("");
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    setPreview(URL.createObjectURL(file));
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "jpg";
      const path = `grooming-notes/${reservationId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("animal-photos")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("animal-photos").getPublicUrl(path);
      photoUrlRef.current = data.publicUrl;
      setPreview(data.publicUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    if (photoUrlRef.current) formData.set("photo_url", photoUrlRef.current);
    startTransition(async () => {
      try {
        await addGroomingNote(reservationId, animalId, facilityId, formData);
        setSaved(true);
        formRef.current?.reset();
        setPreview(null);
        photoUrlRef.current = "";
        router.refresh();
        setTimeout(() => setSaved(false), 2000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save — try again.");
      }
    });
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-3">
      {serviceOptions.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Services performed
          </p>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5">
            {serviceOptions.map((s) => (
              <label key={s} className="inline-flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200">
                <input type="checkbox" name="services" value={s} className="h-4 w-4 accent-emerald-600" />
                {s}
              </label>
            ))}
          </div>
        </div>
      )}

      <textarea
        name="notes"
        rows={3}
        placeholder="Grooming notes — blade/clip lengths, handling, behavior… e.g. “1/4” a/o, 3/8” muzzle. Doesn't like dryer, kennel dry rest of way.”"
        className={inputCls}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Time needed next visit
          </label>
          <input name="time_needed" placeholder="e.g. 1.25 hr" className={`mt-1 ${inputCls}`} />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Groomer
          </label>
          {groomerOptions.length > 0 ? (
            <select name="groomer_name" defaultValue={staffName && groomerOptions.includes(staffName) ? staffName : ""} className={`mt-1 ${inputCls}`}>
              <option value="">Select…</option>
              {groomerOptions.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          ) : (
            <input name="groomer_name" defaultValue={staffName ?? ""} placeholder="Groomer name" className={`mt-1 ${inputCls}`} />
          )}
        </div>
      </div>

      <textarea
        name="parent_notes"
        rows={2}
        placeholder="Note for the parent (optional) — e.g. “Matted behind ears, brushed out. Recommend groom every 6 weeks.”"
        className={inputCls}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Preferred groomer (saved to the animal)
          </label>
          {groomerOptions.length > 0 ? (
            <select name="preferred_groomer" defaultValue={preferredGroomer ?? ""} className={`mt-1 ${inputCls}`}>
              <option value="">No preference</option>
              {groomerOptions.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          ) : (
            <input
              name="preferred_groomer"
              defaultValue={preferredGroomer ?? ""}
              placeholder="No preference"
              className={`mt-1 ${inputCls}`}
            />
          )}
        </div>
        <div className="flex items-end gap-3">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xl">✂️</div>
            )}
          </div>
          <div>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:border-slate-500 disabled:opacity-50 dark:border-slate-700 dark:hover:border-slate-500"
            >
              {uploading ? "Uploading…" : preview ? "Replace Photo" : "📷 After Photo"}
            </button>
          </div>
        </div>
      </div>

      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
      {saved && <p className="text-xs text-green-600 dark:text-green-400">Saved.</p>}

      <button
        type="submit"
        disabled={isPending || uploading}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50 sm:w-fit dark:bg-slate-100 dark:text-slate-900"
      >
        {isPending ? "Saving…" : "Add Grooming Note"}
      </button>
    </form>
  );
}
