import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import PageQuickActions from "@/components/PageQuickActions";
import Toggle from "@/components/ui/Toggle";
import { Badge, Card, PageHeader, PageShell, SettingsList, SettingsRow } from "@/components/ui/Page";
import { addReferralSource, renameReferralSource, setReferralSourceActive } from "./actions";
import Link from "next/link";

export default async function ReferralSourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { edit } = await searchParams;

  const supabase = createClient();
  const { data: sources } = await supabase
    .from("referral_sources")
    .select("id, name, active")
    .eq("facility_id", session!.facilityId)
    .order("name");

  const all = sources ?? [];
  const active = all.filter((s) => s.active);
  const disabled = all.filter((s) => !s.active);
  // Enabled first, disabled grouped underneath — the disabled ones are
  // reference material, not part of the working list.
  const ordered = [...active, ...disabled];

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <FacilityHeader session={session!} />
      <PageShell>
        <PageQuickActions session={session!} />

        <div className="mt-5">
          <PageHeader
            title="Referral Sources"
            description={`Options in the Referral Source dropdown on the New Parent form. Disabling one removes it going forward; existing parent records keep theirs.`}
          />
        </div>

        <Card
          title={`${session!.facilityName} sources`}
          meta={
            <>
              <Badge tone="positive">{active.length} enabled</Badge>
              {disabled.length > 0 && <Badge tone="muted">{disabled.length} disabled</Badge>}
            </>
          }
        >
          <SettingsList>
            {ordered.map((s) => {
              const isEditing = edit === s.id;
              return (
                <SettingsRow
                  key={s.id}
                  control={
                    // The toggle is its own submit button in its own fixed
                    // column, so it can never overlap the label beside it.
                    <form action={setReferralSourceActive.bind(null, s.id, !s.active)} className="flex">
                      <button
                        type="submit"
                        className="flex items-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
                      >
                        <Toggle checked={s.active} label={`${s.active ? "Disable" : "Enable"} ${s.name}`} />
                      </button>
                    </form>
                  }
                  actions={
                    isEditing ? undefined : (
                      <Link
                        href={`/referral-sources?edit=${s.id}`}
                        title={`Rename ${s.name}`}
                        aria-label={`Rename ${s.name}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[13px] text-slate-400 opacity-0 transition hover:bg-slate-200 hover:text-slate-700 focus:opacity-100 group-hover:opacity-100 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                      >
                        ✏️
                      </Link>
                    )
                  }
                >
                  {isEditing ? (
                    <form action={renameReferralSource.bind(null, s.id)} className="flex items-center gap-2">
                      <input
                        name="name"
                        defaultValue={s.name}
                        autoFocus
                        className="h-8 min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 text-[14px] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                      <button
                        type="submit"
                        className="inline-flex h-8 shrink-0 items-center rounded-lg bg-emerald-600 px-3 text-[13px] font-medium text-white hover:bg-emerald-700"
                      >
                        Save
                      </button>
                      <Link
                        href="/referral-sources"
                        className="inline-flex h-8 shrink-0 items-center rounded-lg px-2.5 text-[13px] text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                      >
                        Cancel
                      </Link>
                    </form>
                  ) : (
                    <span
                      className={`text-[14px] ${
                        s.active
                          ? "text-slate-800 dark:text-slate-100"
                          : "text-slate-400 dark:text-slate-500"
                      }`}
                    >
                      {s.name}
                    </span>
                  )}
                </SettingsRow>
              );
            })}

            {all.length === 0 && (
              <p className="px-4 py-10 text-center text-[13px] text-slate-400 dark:text-slate-500">
                No referral sources yet — add the first one below.
              </p>
            )}
          </SettingsList>

          <form
            action={addReferralSource}
            className="flex items-center gap-2 border-t border-slate-200 bg-slate-50/60 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/30"
          >
            <input type="hidden" name="facility_id" value={session!.facilityId} />
            <input
              name="name"
              required
              placeholder="Add a source…"
              className="h-9 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-[14px] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <button
              type="submit"
              className="inline-flex h-9 shrink-0 items-center rounded-lg bg-emerald-600 px-3.5 text-[13px] font-medium text-white hover:bg-emerald-700"
            >
              Add
            </button>
          </form>
        </Card>
      </PageShell>
    </main>
  );
}
