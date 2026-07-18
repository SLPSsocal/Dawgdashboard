import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import AnimalForm from "@/components/AnimalForm";
import { createAnimal } from "../actions";

export default async function NewAnimalPage({
  searchParams,
}: {
  searchParams: Promise<{ parent_id?: string; error?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { parent_id, error } = await searchParams;

  const supabase = createClient();
  const { data: parents } = await supabase
    .from("parents")
    .select("id, first_name, last_name")
    .order("last_name");

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        <a
          href={parent_id ? `/parents/${parent_id}` : "/animals"}
          className="text-sm text-neutral-400 underline dark:text-neutral-500"
        >
          ← Back
        </a>
        <h1 className="mt-2 text-xl font-semibold">New Animal</h1>
        <p className="text-sm text-neutral-400 dark:text-neutral-500">Shared across all facilities</p>

        <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-4 sm:p-6 dark:border-neutral-800 dark:bg-neutral-900">
          <AnimalForm
            action={createAnimal}
            submitLabel="Create Animal"
            error={error}
            parents={parents ?? []}
            selectedParentId={parent_id}
            showParentPicker
          />
        </div>
      </div>
    </main>
  );
}
