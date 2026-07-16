import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import ParentForm from "@/components/ParentForm";
import { updateParent } from "../actions";

export default async function ParentDetailPage({
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
  const { data: parent } = await supabase.from("parents").select("*").eq("id", id).maybeSingle();
  if (!parent) notFound();

  const { data: animals } = await supabase
    .from("animals")
    .select("id, name, breed, active")
    .eq("parent_id", id)
    .order("name");

  const updateWithId = updateParent.bind(null, id);

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        <a href="/parents" className="text-sm text-neutral-400 underline dark:text-neutral-500">
          ← Parents
        </a>
        <h1 className="mt-2 text-xl font-semibold">
          {parent.first_name} {parent.last_name}
        </h1>

        <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-4 sm:p-5 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Animals</h2>
            <a
              href={`/animals/new?parent_id=${id}`}
              className="text-sm font-medium text-neutral-900 underline dark:text-neutral-100"
            >
              + Add Animal
            </a>
          </div>
          {(!animals || animals.length === 0) && (
            <p className="mt-2 text-sm text-neutral-400 dark:text-neutral-500">No animals linked yet.</p>
          )}
          <div className="mt-3 flex flex-col gap-2">
            {(animals ?? []).map((a) => (
              <a
                key={a.id}
                href={`/animals/${a.id}`}
                className="rounded-md border border-neutral-200 px-3 py-2 text-sm hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600"
              >
                <span className="font-medium">{a.name}</span>{" "}
                <span className="text-neutral-400 dark:text-neutral-500">{a.breed ?? ""}</span>
              </a>
            ))}
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-4 sm:p-6 dark:border-neutral-800 dark:bg-neutral-900">
          <ParentForm action={updateWithId} defaults={parent} submitLabel="Save Changes" error={error} />
        </div>
      </div>
    </main>
  );
}
