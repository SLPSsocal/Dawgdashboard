import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import SearchableAnimalsList from "@/components/SearchableAnimalsList";

type Animal = {
  id: string;
  name: string;
  breed: string | null;
  size: string | null;
  photo_url: string | null;
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
    .select("id, name, breed, size, photo_url, parents ( first_name, last_name )")
    .eq("active", true)
    .order("name");

  const animals = (data as unknown as Animal[]) ?? [];

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Animals</h1>
            <p className="text-sm text-neutral-400 dark:text-neutral-500">Shared across all facilities</p>
          </div>
          <a
            href="/animals/new"
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
          >
            + New Animal
          </a>
        </div>

        {animals.length === 0 ? (
          <p className="mt-8 text-sm text-neutral-400 dark:text-neutral-500">No animals yet.</p>
        ) : (
          <SearchableAnimalsList animals={animals} />
        )}
      </div>
    </main>
  );
}
