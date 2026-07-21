import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import PageQuickActions from "@/components/PageQuickActions";
import { createWaiver, retireWaiver, reactivateWaiver } from "./actions";

export default async function WaiversPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { error } = await searchParams;

  const supabase = createClient();
  const { data: waivers } = await supabase
    .from("waivers")
    .select("id, title, active, created_at")
    .eq("facility_id", session!.facilityId)
    .order("created_at", { ascending: false });

  const active = (waivers ?? []).filter((w) => w.active);
  const retired = (waivers ?? []).filter((w) => !w.active);
  const createWithFacility = createWaiver.bind(null, session!.facilityId);

  const quoConfigured = Boolean(process.env[`QUO_API_KEY_${session!.facilitySlug.toUpperCase()}`]);

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="text-xl font-semibold">Waivers — {session!.facilityName}</h1>
        <p className="text-sm text-slate-400 dark:text-slate-500">
          Text a signing link to a parent from a dog&apos;s profile or the Waivers section on their account page. Each
          facility keeps its own waiver text.
        </p>

        <div className="mt-3">
          <PageQuickActions session={session!} />
        </div>

        <div
          className={`mt-4 rounded-md px-3 py-2 text-sm ${
            quoConfigured
              ? "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400"
              : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
          }`}
        >
          {quoConfigured
            ? "Texting is connected for this facility — signing links send automatically."
            : "Texting (Quo) isn't connected for this facility yet — signing links still get created, but you'll need to copy and send them yourself until an API key is added."}
        </div>

        {error && (
          <div className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
            {error === "missing" ? "Title and waiver text are required." : error}
          </div>
        )}

        <div className="mt-6 rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <h2 className="px-4 pt-4 text-sm font-semibold text-slate-700 dark:text-slate-200 sm:px-6">Active Waivers</h2>
          {active.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-400 dark:text-slate-500 sm:px-6">None yet — add one below.</p>
          ) : (
            <div className="flex flex-col gap-2 p-4 sm:p-6">
              {active.map((w) => (
                <div key={w.id} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                  <span className="font-medium">{w.title}</span>
                  <form action={retireWaiver.bind(null, w.id)}>
                    <button type="submit" className="text-xs text-red-500 underline dark:text-red-400">
                      Retire
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}

          {retired.length > 0 && (
            <details className="border-t border-slate-200 px-4 py-3 dark:border-slate-800 sm:px-6">
              <summary className="cursor-pointer text-xs font-medium text-slate-400 dark:text-slate-500">
                Retired ({retired.length})
              </summary>
              <div className="mt-2 flex flex-col gap-1">
                {retired.map((w) => (
                  <div key={w.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-400 dark:text-slate-500">{w.title}</span>
                    <form action={reactivateWaiver.bind(null, w.id)}>
                      <button type="submit" className="text-xs text-indigo-600 underline dark:text-indigo-400">
                        Reactivate
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>

        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Add Waiver</h2>
          <form action={createWithFacility} className="mt-2 flex flex-col gap-3">
            <label className="block">
              <span className="text-xs text-slate-500 dark:text-slate-400">Title</span>
              <input name="title" required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Waiver Text (HTML — paste straight from Word/Google Docs, formatting carries over)
              </span>
              <textarea
                name="body_html"
                required
                rows={10}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
            <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 sm:w-fit dark:bg-slate-100 dark:text-slate-900">
              Add Waiver
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
