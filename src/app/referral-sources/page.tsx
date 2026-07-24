import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import PageQuickActions from "@/components/PageQuickActions";
import { addReferralSource, renameReferralSource, setReferralSourceActive } from "./actions";

export default async function ReferralSourcesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = createClient();
  const { data: sources } = await supabase
    .from("referral_sources")
    .select("id, name, active")
    .eq("facility_id", session!.facilityId)
    .order("name");

  const active = (sources ?? []).filter((s) => s.active);
  const disabled = (sources ?? []).filter((s) => !s.active);

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="text-xl font-semibold">Referral Sources — {session!.facilityName}</h1>
        <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">
          Manages the options shown in the Referral Source dropdown on the New Parent form for{" "}
          {session!.facilityName} — each facility keeps its own list. Disabling a source removes it from that
          dropdown going forward; existing parent records that already used it are untouched.
        </p>

        <div className="mt-3">
          <PageQuickActions session={session!} />
        </div>

        <div className="mt-6 rounded-xl border border-slate-300 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-slate-500 dark:text-slate-400">
              {active.length} enabled · {disabled.length} disabled
            </span>
          </div>

          <div className="mt-3 flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
            {[...active, ...disabled].map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 py-2">
                <form action={setReferralSourceActive.bind(null, s.id, !s.active)}>
                  <button
                    type="submit"
                    aria-label={s.active ? "Disable" : "Enable"}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                      s.active ? "bg-green-500" : "bg-slate-300 dark:bg-slate-700"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        s.active ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </form>

                <details className="group flex-1">
                  <summary className={`cursor-pointer select-none list-none text-sm ${s.active ? "" : "text-slate-400 line-through dark:text-slate-600"}`}>
                    {s.name}
                    <span className="ml-2 text-xs text-slate-400 group-open:hidden dark:text-slate-500">✎</span>
                  </summary>
                  <form action={renameReferralSource.bind(null, s.id)} className="mt-2 flex items-center gap-2">
                    <input
                      name="name"
                      defaultValue={s.name}
                      className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                    <button type="submit" className="rounded-md bg-indigo-600 hover:bg-indigo-700 px-2 py-1 text-xs font-medium text-white dark:bg-slate-100 dark:text-slate-900">
                      Save
                    </button>
                  </form>
                </details>
              </div>
            ))}
            {(sources ?? []).length === 0 && (
              <p className="py-4 text-sm text-slate-400 dark:text-slate-500">No referral sources yet.</p>
            )}
          </div>

          <form action={addReferralSource} className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
            <input type="hidden" name="facility_id" value={session!.facilityId} />
            <input
              name="name"
              required
              placeholder="Add a new source…"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <button type="submit" className="rounded-lg bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900">
              + Add
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
