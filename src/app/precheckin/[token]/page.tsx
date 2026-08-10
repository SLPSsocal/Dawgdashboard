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
      `id, status, submitted_at, facility_id,
       animals ( name, feeding_instructions, medications, grooming_notes ),
       reservations ( belongings, start_date, reservation_types ( category ) ),
       parents ( emergency_contact_name, emergency_contact_phone )`
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
  const reservation = req.reservations as unknown as {
    belongings: string | null;
    start_date: string;
    reservation_types: { category: string } | null;
  } | null;
  const parent = req.parents as unknown as {
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
  } | null;

  const rawCategory = reservation?.reservation_types?.category ?? "boarding";
  const category = (["boarding", "daycare", "grooming"].includes(rawCategory) ? rawCategory : "boarding") as
    | "boarding"
    | "daycare"
    | "grooming";

  // Grooming visits offer the facility's menu as request-able add-ons.
  const { data: menu } =
    category === "grooming"
      ? await supabase
          .from("grooming_menu_items")
          .select("name")
          .eq("facility_id", req.facility_id)
          .eq("active", true)
          .order("name")
      : { data: [] };

  // Booked arrival time prefills the drop-off field.
  const start = reservation?.start_date ? new Date(reservation.start_date) : null;
  const defaultDropoff = start
    ? `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`
    : null;

  const blurb =
    category === "grooming"
      ? "Tell us the style you want, add a current photo, and pick any add-ons before your appointment."
      : "Review feeding, medications, belongings, emergency contact, and your drop-off time before your visit.";

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-xl font-semibold">Pre-Check-In — {animal?.name ?? "Your Dog"}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{blurb}</p>

        {req.status === "submitted" ? (
          <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-400">
            Submitted on {req.submitted_at ? new Date(req.submitted_at).toLocaleString() : ""}. Thanks — you&apos;re all
            set. Contact the facility if you need to make changes.
          </div>
        ) : (
          <PrecheckinForm
            token={token}
            animalName={animal?.name ?? "Your Dog"}
            category={category}
            currentFeedingInstructions={animal?.feeding_instructions ?? null}
            currentMedications={animal?.medications ?? null}
            currentGroomingNotes={animal?.grooming_notes ?? null}
            currentBelongings={reservation?.belongings ?? null}
            currentEmergencyContactName={parent?.emergency_contact_name ?? null}
            currentEmergencyContactPhone={parent?.emergency_contact_phone ?? null}
            defaultDropoffTime={defaultDropoff}
            groomingAddOns={(menu ?? []).map((m) => m.name)}
          />
        )}
      </div>
    </main>
  );
}
