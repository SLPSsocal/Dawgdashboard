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

// Splits stored feeding text back into AM/Lunch/PM fields. Lines we can't
// attribute to a meal go into the "other" bucket rather than being dropped
// or mislabelled.
function parseFeeding(text: string | null) {
  const out = { am: "", lunch: "", pm: "", other: "" };
  if (!text) return out;
  const leftovers: string[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (/^am[:\s]/i.test(t)) out.am = t.replace(/^am[:\s]+/i, "");
    else if (/^lunch[:\s]/i.test(t)) out.lunch = t.replace(/^lunch[:\s]+/i, "");
    else if (/^pm[:\s]/i.test(t)) out.pm = t.replace(/^pm[:\s]+/i, "");
    else leftovers.push(t);
  }
  out.other = leftovers.join("\n");
  return out;
}

const inputCls =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

export default function PrecheckinForm({
  token,
  animalName,
  category,
  currentFeedingInstructions,
  currentMedications,
  currentGroomingNotes,
  currentBelongings,
  currentEmergencyContactName,
  currentEmergencyContactPhone,
  defaultDropoffTime,
  groomingAddOns,
}: {
  token: string;
  animalName: string;
  /** Reservation category — decides which sections appear. */
  category: "boarding" | "daycare" | "grooming" | "other";
  currentFeedingInstructions: string | null;
  currentMedications: string | null;
  currentGroomingNotes: string | null;
  currentBelongings: string | null;
  currentEmergencyContactName: string | null;
  currentEmergencyContactPhone: string | null;
  /** HH:MM from the booked arrival, prefills the drop-off field. */
  defaultDropoffTime: string | null;
  /** Facility's grooming menu, offered as request-able add-ons. */
  groomingAddOns: string[];
}) {
  const [isPending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const groomingPhotoUrl = useRef<string>("");
  const belongingsPhotoUrl = useRef<string>("");
  const animalPhotoUrl = useRef<string>("");

  const isGrooming = category === "grooming";
  const isStay = category === "boarding" || category === "daycare";
  const feeding = parseFeeding(currentFeedingInstructions);
  // Strip the "N items — " prefix this form itself may have written last time.
  const belongingsDefault = (currentBelongings ?? "").replace(/^\d+\s+items?\s+—\s+/i, "");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    if (groomingPhotoUrl.current) formData.set("grooming_photo_url", groomingPhotoUrl.current);
    if (belongingsPhotoUrl.current) formData.set("belongings_photo_url", belongingsPhotoUrl.current);
    if (animalPhotoUrl.current) formData.set("animal_photo_url", animalPhotoUrl.current);
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
      <p className="rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:bg-sky-950/30 dark:text-sky-300">
        We&apos;ve pre-filled what we have on file from {animalName}&apos;s previous visits — just review and
        update anything that&apos;s changed.
      </p>

      <label className="block">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Your name</span>
        <input name="submitted_by" required className={inputCls} />
      </label>

      {isStay && (
        <>
          <fieldset>
            <legend className="text-sm font-semibold text-slate-700 dark:text-slate-200">🍽️ Eating Notes</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <label className="block">
                <span className="text-xs text-slate-500 dark:text-slate-400">AM</span>
                <textarea name="eating_am" rows={2} defaultValue={feeding.am} className={inputCls} />
              </label>
              <label className="block">
                <span className="text-xs text-slate-500 dark:text-slate-400">Lunch</span>
                <textarea name="eating_lunch" rows={2} defaultValue={feeding.lunch} className={inputCls} />
              </label>
              <label className="block">
                <span className="text-xs text-slate-500 dark:text-slate-400">PM</span>
                <textarea name="eating_pm" rows={2} defaultValue={feeding.pm} className={inputCls} />
              </label>
            </div>
            {feeding.other && (
              <label className="mt-2 block">
                <span className="text-xs text-slate-500 dark:text-slate-400">Other feeding notes</span>
                <textarea name="eating_other" rows={3} defaultValue={feeding.other} className={inputCls} />
              </label>
            )}
          </fieldset>

          <label className="block">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">🚑 Medication Notes</span>
            <textarea name="medications" rows={3} defaultValue={currentMedications ?? ""} className={inputCls} />
          </label>

          <div>
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">🧳 Belongings</span>
            <div className="mt-1 flex gap-2">
              <label className="block w-28 shrink-0">
                <span className="text-xs text-slate-500 dark:text-slate-400">How many?</span>
                <input name="belongings_count" type="number" min={0} className={inputCls} />
              </label>
              <label className="block min-w-0 flex-1">
                <span className="text-xs text-slate-500 dark:text-slate-400">What are they?</span>
                <textarea
                  name="belongings"
                  rows={2}
                  defaultValue={belongingsDefault}
                  placeholder="e.g. blue leash, food bag, favorite toy"
                  className={inputCls}
                />
              </label>
            </div>
            <div className="mt-2">
              <PhotoUpload label="Belongings Photo" folder="belongings" onUploaded={(url) => (belongingsPhotoUrl.current = url)} />
            </div>
          </div>

          <fieldset>
            <legend className="text-sm font-semibold text-slate-700 dark:text-slate-200">📞 Emergency Contact</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs text-slate-500 dark:text-slate-400">Name</span>
                <input name="emergency_contact_name" defaultValue={currentEmergencyContactName ?? ""} className={inputCls} />
              </label>
              <label className="block">
                <span className="text-xs text-slate-500 dark:text-slate-400">Phone</span>
                <input name="emergency_contact_phone" type="tel" defaultValue={currentEmergencyContactPhone ?? ""} className={inputCls} />
              </label>
            </div>
          </fieldset>

          <label className="block">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">🕐 Drop-off time</span>
            <input name="dropoff_time" type="time" defaultValue={defaultDropoffTime ?? ""} className={`${inputCls} w-40`} />
            <span className="mt-1 block text-xs text-slate-400 dark:text-slate-500">
              When you expect to arrive — helps us have {animalName}&apos;s spot ready.
            </span>
          </label>
        </>
      )}

      {isGrooming && (
        <>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">✂️ Desired Haircut / Style</span>
            <textarea
              name="grooming_notes"
              rows={3}
              defaultValue={currentGroomingNotes ?? ""}
              placeholder="e.g. 1/2 inch all over, blend the head, tidy ears and tail…"
              className={inputCls}
            />
            <div className="mt-2">
              <PhotoUpload label="Style Photo" folder="grooming" onUploaded={(url) => (groomingPhotoUrl.current = url)} />
            </div>
          </label>

          <div>
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">📷 Current photo of {animalName}</span>
            <span className="mt-0.5 block text-xs text-slate-400 dark:text-slate-500">
              Helps the groomer see current coat condition before you arrive.
            </span>
            <div className="mt-2">
              <PhotoUpload label="Current Photo" folder="animal" onUploaded={(url) => (animalPhotoUrl.current = url)} />
            </div>
          </div>

          {groomingAddOns.length > 0 && (
            <fieldset>
              <legend className="text-sm font-semibold text-slate-700 dark:text-slate-200">✨ Requested Add-ons</legend>
              <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {groomingAddOns.map((name) => (
                  <label key={name} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <input type="checkbox" name="addons" value={name} />
                    {name}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </>
      )}

      {/* Grooming-only visits still get a light belongings line. */}
      {isGrooming && (
        <label className="block">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">🧳 Bringing anything?</span>
          <textarea name="belongings" rows={1} defaultValue={belongingsDefault} placeholder="Leash, harness…" className={inputCls} />
        </label>
      )}

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
