import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import AnimalForm from "@/components/AnimalForm";
import { updateAnimal } from "../actions";

export default async function AnimalDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;
  const { error } = await searchParams;

  const supabase = createClient();
  const { data: animal } = await supabase
    .from("animals")
    .select("*, parents ( id, first_name, last_name )")
    .eq("id", id)
    .maybeSingle();
  if (!animal) notFound();

  const parent = animal.parents as unknown as { id: string; first_name: string; last_name: string } | null;
  const updateWithId = updateAnimal.bind(null, id);

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        <a href="/animals" className="text-sm text-neutral-400 underline dark:text-neutral-500">
          ← Animals
        </a>
        <h1 className="mt-2 text-xl font-semibold">{animal.name}</h1>
        {parent && (
          <p className="text-sm text-neutral-400 dark:text-neutral-500">
            Owner:{" "}
            <a href={`/parents/${parent.id}`} className="underline">
              {parent.first_name} {parent.last_name}
            </a>
          </p>
        )}

        <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-4 sm:p-6 dark:border-neutral-800 dark:bg-neutral-900">
          <AnimalForm
            action={updateWithId}
            defaults={animal}
            submitLabel="Save Changes"
            error={error}
            showActiveToggle
          />
        </div>
      </div>
    </main>
  );
}
