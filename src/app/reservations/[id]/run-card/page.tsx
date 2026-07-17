import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "@/components/PrintButton";

export default async function RunCardPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;

  const supabase = createClient();
  const { data: reservation } = await supabase
    .from("reservations")
    .select(
      `*, animals ( name, breed, size, medical_notes, medications, behavioral_notes, feeding_instructions, parents ( first_name, last_name, phone, emergency_contact_name, emergency_contact_phone ) ),
       lodging_areas ( name ), reservation_types ( name )`
    )
    .eq("id", id)
    .maybeSingle();
  if (!reservation) notFound();

  const animal = reservation.animals as unknown as {
    name: string;
    breed: string | null;
    size: string | null;
    medical_notes: string | null;
    medications: string | null;
    behavioral_notes: string | null;
    feeding_instructions: string | null;
    parents: { first_name: string; last_name: string; phone: string | null; emergency_contact_name: string | null; emergency_contact_phone: string | null } | null;
  } | null;
  const lodging = reservation.lodging_areas as unknown as { name: string } | null;
  const type = reservation.reservation_types as unknown as { name: string } | null;

  return (
    <main className="min-h-screen bg-white p-8 text-neutral-900 print:p-0">
      <div className="mx-auto max-w-xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">🐾 {animal?.name ?? "Unknown"}</h1>
          <PrintButton />
        </div>
        <p className="text-neutral-500">{animal?.breed ?? "—"} · {animal?.size ?? "—"}</p>

        <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs uppercase text-neutral-400">Reservation Type</div>
            <div className="font-medium">{type?.name ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-neutral-400">Lodging</div>
            <div className="font-medium">{lodging?.name ?? "Unassigned"}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-neutral-400">Arrival</div>
            <div className="font-medium">{new Date(reservation.start_date).toLocaleString()}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-neutral-400">Departure</div>
            <div className="font-medium">{new Date(reservation.end_date).toLocaleString()}</div>
          </div>
        </div>

        <div className="mt-6 border-t border-neutral-200 pt-4">
          <div className="text-xs uppercase text-neutral-400">Parent</div>
          <div className="font-medium">
            {animal?.parents ? `${animal.parents.first_name} ${animal.parents.last_name}` : "—"} · {animal?.parents?.phone ?? "—"}
          </div>
          <div className="mt-1 text-xs uppercase text-neutral-400">Emergency Contact</div>
          <div className="font-medium">
            {animal?.parents?.emergency_contact_name ?? "—"} · {animal?.parents?.emergency_contact_phone ?? "—"}
          </div>
        </div>

        {reservation.belongings && (
          <div className="mt-6 border-t border-neutral-200 pt-4">
            <div className="text-xs uppercase text-neutral-400">Belongings</div>
            <div>{reservation.belongings}</div>
          </div>
        )}

        <div className="mt-6 border-t border-neutral-200 pt-4">
          <div className="text-xs uppercase text-neutral-400">Feeding Instructions</div>
          <div>{animal?.feeding_instructions ?? "—"}</div>
        </div>
        <div className="mt-4">
          <div className="text-xs uppercase text-neutral-400">Medications</div>
          <div>{animal?.medications ?? "—"}</div>
        </div>
        <div className="mt-4">
          <div className="text-xs uppercase text-neutral-400">Medical Notes / Allergies</div>
          <div>{animal?.medical_notes ?? "—"}</div>
        </div>
        <div className="mt-4">
          <div className="text-xs uppercase text-neutral-400">Behavioral Notes</div>
          <div>{animal?.behavioral_notes ?? "—"}</div>
        </div>

        {reservation.notes && (
          <div className="mt-6 border-t border-neutral-200 pt-4">
            <div className="text-xs uppercase text-neutral-400">Reservation Notes</div>
            <div>{reservation.notes}</div>
          </div>
        )}
      </div>
    </main>
  );
}
