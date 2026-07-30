import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PrecheckinForm from "@/components/PrecheckinForm";

export default async function PrecheckinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createClient();

  const { data: req } = await supabase
    .from("precheckin_requests")
    .select(
      "id, status, submitted_at, animals ( name, feeding_instructions, medications, grooming_notes ), reservations ( belongings )"
    )
    .eq("token", token)
    .maybeSingle();

  if (!req) notFound();

  const animal = req.animals as unknown as {
    name: string;
    feeding_instructions: string | null;
    medications: string | null;
    grooming_notes: string | null;
  } | null;
  const reservation = req.reservations as unknown as { belongings: string | null } | null;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-xl font-semibold">Pre-Check-In — {animal?.name ?? "Your Dog"}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Let us know about feeding, medications, belongings, and grooming before your visit.
        </p>

        {req.status === "submitted" ? (
          <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-400">
            Submitted on {req.submitted_at ? new Date(req.submitted_at).toLocaleString() : ""}. Thanks — you&apos;re all
            set. Contact the facility if you need to make changes.
          </div>
        ) : (
          <PrecheckinForm
            token={token}
            animalName={animal?.name ?? "Your Dog"}
            currentFeedingInstructions={animal?.feeding_instructions ?? null}
            currentMedications={animal?.medications ?? null}
            currentGroomingNotes={animal?.grooming_notes ?? null}
            currentBelongings={reservation?.belongings ?? null}
          />
        )}
      </div>
    </main>
  );
}
