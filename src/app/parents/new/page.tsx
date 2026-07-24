import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import PageQuickActions from "@/components/PageQuickActions";
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

  const supabase = createClient();
  const { data: referralSources } = await supabase
    .from("referral_sources")
    .select("id, name")
    .eq("facility_id", session!.facilityId)
    .eq("active", true)
    .order("name");

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <a href="/parents" className="text-sm text-slate-400 underline dark:text-slate-500">
          ← Parents
        </a>
        <h1 className="mt-2 text-xl font-semibold">New Parent</h1>
        <p className="text-sm text-slate-400 dark:text-slate-500">Shared across all facilities</p>

        <div className="mt-3">
          <PageQuickActions session={session!} />
        </div>

        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
          <ParentForm
            action={createParent}
            submitLabel="Create Parent"
            error={error}
            referralSources={referralSources ?? []}
          />
        </div>
      </div>
    </main>
  );
}
