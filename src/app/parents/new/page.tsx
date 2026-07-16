import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import FacilityHeader from "@/components/FacilityHeader";
import ParentForm from "@/components/ParentForm";
import { createParent } from "../actions";

export default async function NewParentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { error } = await searchParams;

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        <a href="/parents" className="text-sm text-neutral-400 underline dark:text-neutral-500">
          ← Parents
        </a>
        <h1 className="mt-2 text-xl font-semibold">New Parent</h1>
        <p className="text-sm text-neutral-400 dark:text-neutral-500">Shared across all facilities</p>

        <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-4 sm:p-6 dark:border-neutral-800 dark:bg-neutral-900">
          <ParentForm action={createParent} submitLabel="Create Parent" error={error} />
        </div>
      </div>
    </main>
  );
}
