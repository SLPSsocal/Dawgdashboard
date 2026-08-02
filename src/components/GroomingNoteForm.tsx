"use client";

import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { addGroomingNote } from "@/app/grooming-notes/actions";

export default function GroomingNoteForm({
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
        setTimeout(() => setSaved(false), 2000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save — try again.");
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
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
            {uploading ? "Uploading…" : preview ? "Replace Photo" : "📷 Add Photo"}
          </button>
          {error && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{error}</p>}
        </div>
      </div>

      <textarea
        name="notes"
        rows={3}
        placeholder="What was done, style notes, anything for next time…"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
      />

      <input
        name="groomer_name"
        defaultValue={staffName ?? ""}
        placeholder="Groomer name"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 sm:w-48"
      />

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
