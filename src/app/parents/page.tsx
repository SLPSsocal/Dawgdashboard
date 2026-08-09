import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import PageQuickActions from "@/components/PageQuickActions";
import SearchableParentsList from "@/components/SearchableParentsList";
import { getProfileTagsBulk } from "@/lib/profileTags";
import Link from "next/link";

export default async function ParentsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Shared table — same reasoning as Animals.
  const supabase = createClient();
  const { data: parents } = await supabase
    .from("parents")
    .select("id, first_name, last_name, phone, email, created_at, animals ( name )")
    .order("last_name");

  const tagsByParent = Object.fromEntries(
    await getProfileTagsBulk(
      "parent",
      (parents ?? []).map((p) => p.id)
    )
  );

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Parents</h1>
            <p className="text-sm text-slate-400 dark:text-slate-500">Shared across all facilities</p>
          </div>
          <Link
            href="/parents/new"
            className="rounded-lg bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"
          >
            + New Parent
          </Link>
        </div>

        <div className="mt-3">
          <PageQuickActions session={session!} />
        </div>

        {!parents || parents.length === 0 ? (
          <p className="mt-8 text-sm text-slate-400 dark:text-slate-500">No parents yet.</p>
        ) : (
          <SearchableParentsList parents={parents} tagsByParent={tagsByParent} />
        )}
      </div>
    </main>
  );
}
