import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import PageQuickActions from "@/components/PageQuickActions";
import { updateSupportTicketStatus } from "./actions";

const STATUS_LABEL: Record<string, string> = {
  open: "🟡 Open",
  in_progress: "🔵 In Progress",
  resolved: "✅ Resolved",
};

export default async function SupportTicketsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = createClient();
  const { data: tickets } = await supabase
    .from("support_tickets")
    .select("id, staff_name, message, screenshot_url, attachment_url, page_url, status, created_at")
    .eq("facility_id", session!.facilityId)
    .order("created_at", { ascending: false });

  const rows = tickets ?? [];
  const open = rows.filter((t) => t.status !== "resolved");
  const resolved = rows.filter((t) => t.status === "resolved");

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="text-xl font-semibold">Reported Issues — {session!.facilityName}</h1>
        <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">
          Submitted via the 💬 button in the corner of every page. Nothing routes anywhere automatically yet — this
          list is the whole pipeline for now until it's wired up to a Slack channel.
        </p>

        <div className="mt-3">
          <PageQuickActions session={session!} />
        </div>

        <div className="mt-6 flex flex-col gap-3">
          {[...open, ...resolved].map((t) => (
            <div
              key={t.id}
              className="rounded-xl border border-slate-300 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {t.staff_name} · {new Date(t.created_at).toLocaleString()}
                </div>
                <form action={updateSupportTicketStatus.bind(null, t.id, t.status === "resolved" ? "open" : "resolved")}>
                  <button
                    type="submit"
                    className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium hover:border-slate-500 dark:border-slate-700 dark:hover:border-slate-500"
                  >
                    {STATUS_LABEL[t.status] ?? t.status} — mark {t.status === "resolved" ? "open" : "resolved"}
                  </button>
                </form>
              </div>

              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{t.message}</p>

              {t.page_url && (
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Page: {t.page_url}</p>
              )}

              <div className="mt-2 flex flex-wrap gap-3">
                {t.screenshot_url && (
                  <a href={t.screenshot_url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={t.screenshot_url}
                      alt="Reported screenshot"
                      className="h-24 rounded-lg border border-slate-200 object-cover dark:border-slate-700"
                    />
                  </a>
                )}
                {t.attachment_url && (
                  <a
                    href={t.attachment_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center rounded-lg border border-slate-200 px-3 py-2 text-xs text-indigo-600 underline dark:border-slate-700 dark:text-indigo-400"
                  >
                    📄 Attached file
                  </a>
                )}
              </div>
            </div>
          ))}

          {rows.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">
              No issues reported yet — that's a good thing.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
