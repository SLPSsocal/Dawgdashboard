import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";

export default async function LodgingPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Facility-scoped table — only this facility's kennels/suites/runs.
  const supabase = createClient();
  const { data: areas } = await supabase
    .from("lodging_areas")
    .select("id, name, area_type, capacity, active")
    .eq("facility_id", session!.facilityId)
    .order("name");

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="text-xl font-semibold">Lodging — {session!.facilityName}</h1>

        {(!areas || areas.length === 0) && (
          <p className="mt-8 text-sm text-neutral-400 dark:text-neutral-500">
            No lodging areas set up yet for {session!.facilityName}.
          </p>
        )}

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {(areas ?? []).map((a) => (
            <div key={a.id} className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <div className="font-medium">{a.name}</div>
              <div className="text-sm text-neutral-500 dark:text-neutral-400">{a.area_type} · capacity {a.capacity}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
