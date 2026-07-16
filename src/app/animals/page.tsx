import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";

type Animal = {
  id: string;
  name: string;
  breed: string | null;
  size: string | null;
  parents: { first_name: string; last_name: string } | null;
};

export default async function AnimalsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Shared table — deliberately NOT filtered by facility_id. Any dog, any
  // location, one profile. (Which reservations exist for it is what's
  // facility-scoped, not the animal record itself.)
  const supabase = createClient();
  const { data } = await supabase
    .from("animals")
    .select("id, name, breed, size, parents ( first_name, last_name )")
    .eq("active", true)
    .order("name");

  const animals = (data as unknown as Animal[]) ?? [];

  return (
    <main className="min-h-screen bg-neutral-50">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-xl font-semibold">Animals</h1>
        <p className="text-sm text-neutral-400">Shared across all facilities</p>

        {animals.length === 0 && (
          <p className="mt-8 text-sm text-neutral-400">No animals yet.</p>
        )}

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {animals.map((a) => (
            <div key={a.id} className="rounded-lg border border-neutral-200 bg-white p-4">
              <div className="font-medium">{a.name}</div>
              <div className="text-sm text-neutral-500">{a.breed ?? "—"} · {a.size ?? "—"}</div>
              <div className="mt-1 text-xs text-neutral-400">
                {a.parents ? `${a.parents.first_name} ${a.parents.last_name}` : "No parent linked"}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
