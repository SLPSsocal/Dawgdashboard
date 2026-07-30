"use client";

import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { submitPrecheckin } from "@/app/precheckin/actions";

function PhotoUpload({ label, folder, onUploaded }: { label: string; folder: string; onUploaded: (url: string) => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    setPreview(URL.createObjectURL(file));
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${folder}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("precheckin-photos")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("precheckin-photos").getPublicUrl(path);
      onUploaded(data.publicUrl);
      setPreview(data.publicUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xl">📷</div>
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
          {uploading ? "Uploading…" : preview ? `Replace ${label}` : `Add ${label}`}
        </button>
        {error && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{error}</p>}
      </div>
    </div>
  );
}

export default function PrecheckinForm({
  token,
  animalName,
  currentFeedingInstructions,
  currentMedications,
  currentGroomingNotes,
  currentBelongings,
}: {
  token: string;
  animalName: string;
  currentFeedingInstructions: string | null;
  currentMedications: string | null;
  currentGroomingNotes: string | null;
  currentBelongings: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const groomingPhotoUrl = useRef<string>("");
  const belongingsPhotoUrl = useRef<string>("");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    if (groomingPhotoUrl.current) formData.set("grooming_photo_url", groomingPhotoUrl.current);
    if (belongingsPhotoUrl.current) formData.set("belongings_photo_url", belongingsPhotoUrl.current);
    startTransition(async () => {
      try {
        await submitPrecheckin(token, formData);
        setSubmitted(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong — please try again.");
      }
    });
  }

  if (submitted) {
    return (
      <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-400">
        Thanks! {animalName}&apos;s pre-check-in info has been submitted.
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 flex flex-col gap-5 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
    >
      <label className="block">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Your name</span>
        <input
          name="submitted_by"
          required
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        />
      </label>

      <fieldset>
        <legend className="text-sm font-semibold text-slate-700 dark:text-slate-200">🍽️ Eating Notes</legend>
        {currentFeedingInstructions && (
          <p className="mt-1 whitespace-pre-wrap text-xs text-slate-400 dark:text-slate-500">On file: {currentFeedingInstructions}</p>
        )}
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <label className="block">
            <span className="text-xs text-slate-500 dark:text-slate-400">AM</span>
            <textarea name="eating_am" rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500 dark:text-slate-400">Lunch</span>
            <textarea name="eating_lunch" rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500 dark:text-slate-400">PM</span>
            <textarea name="eating_pm" rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
          </label>
        </div>
      </fieldset>

      <label className="block">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">🚑 Medication Notes</span>
        {currentMedications && (
          <p className="mt-1 whitespace-pre-wrap text-xs text-slate-400 dark:text-slate-500">On file: {currentMedications}</p>
        )}
        <textarea
          name="medications"
          rows={3}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        />
      </label>

      <div>
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">🧳 Belongings</span>
        {currentBelongings && (
          <p className="mt-1 whitespace-pre-wrap text-xs text-slate-400 dark:text-slate-500">On file: {currentBelongings}</p>
        )}
        <textarea
          name="belongings"
          rows={2}
          placeholder="e.g. blue leash, food bag, favorite toy"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        />
        <div className="mt-2">
          <PhotoUpload label="Belongings Photo" folder="belongings" onUploaded={(url) => (belongingsPhotoUrl.current = url)} />
        </div>
      </div>

      <div>
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">✂️ Grooming Notes</span>
        {currentGroomingNotes && (
          <p className="mt-1 whitespace-pre-wrap text-xs text-slate-400 dark:text-slate-500">On file: {currentGroomingNotes}</p>
        )}
        <textarea
          name="grooming_notes"
          rows={2}
          placeholder="Haircut requests, style notes…"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        />
        <div className="mt-2">
          <PhotoUpload label="Style Photo" folder="grooming" onUploaded={(url) => (groomingPhotoUrl.current = url)} />
        </div>
      </div>

      {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 sm:w-fit dark:bg-slate-100 dark:text-slate-900"
      >
        {isPending ? "Submitting…" : "Submit"}
      </button>
    </form>
  );
}
