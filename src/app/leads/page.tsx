import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import LeadsBoard, { type LeadRow } from "@/components/LeadsBoard";

// Website inquiries land here (Kath's request, Aug 30) — one inbox for
// every "I'm interested" message, with a simple new → contacted →
// converted/closed pipeline. Leads with no facility yet show everywhere.
export default async function LeadsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = createClient();
  const { data } = await supabase
    .from("leads")
    .select(
      "id, first_name, last_name, email, phone, pet_names, pet_name, pet_breed, source, status, notes, returning_client, services_interested, converted_parent_id, facility_id, created_at"
    )
    .or(`facility_id.eq.${session!.facilityId},facility_id.is.null`)
    .order("created_at", { ascending: false })
    .limit(300);

  const leads: LeadRow[] = (data ?? []).map((l) => ({
    id: l.id,
    firstName: l.first_name,
    lastName: l.last_name,
    email: l.email,
    phone: l.phone,
    petNames: l.pet_names ?? l.pet_name,
    petBreed: l.pet_breed,
    source: l.source,
    status: l.status ?? "new",
    notes: l.notes,
    returningClient: l.returning_client,
    servicesInterested: l.services_interested,
    convertedParentId: l.converted_parent_id,
    createdAt: l.created_at,
  }));

  return (
    <main className="min-h-screen bg-[#f5f6f8] dark:bg-slate-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-[#15181d] dark:text-slate-50">
          Leads
        </h1>
        <p className="mt-1 text-[13px] text-[#8a91a0] dark:text-slate-500">
          Messages and booking inquiries from the website. Work them left to right: contact, then convert to a
          parent or close.
        </p>
        <div className="mt-4">
          <LeadsBoard leads={leads} />
        </div>
      </div>
    </main>
  );
}
