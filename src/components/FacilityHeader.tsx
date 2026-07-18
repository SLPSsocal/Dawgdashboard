import { logout } from "@/app/logout/actions";
import type { Session } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import ThemeToggle from "@/components/ThemeToggle";
import QuickActionBar, { type CheckInCandidate } from "@/components/QuickActionBar";

type CandidateRow = {
  id: string;
  start_date: string;
  animals: { name: string; parents: { first_name: string; last_name: string } | null } | null;
  reservation_types: { name: string } | null;
};

export default async function FacilityHeader({ session }: { session: Session }) {
  // Fetched here (not in QuickActionBar, a client component) so the popup's
  // typeahead has data instantly on open with no extra round-trip.
  const supabase = createClient();
  const { data } = await supabase
    .from("reservations")
    .select(
      `id, start_date,
       animals ( name, parents ( first_name, last_name ) ),
       reservation_types ( name )`
    )
    .eq("facility_id", session.facilityId)
    .eq("status", "booked")
    .order("start_date", { ascending: true })
    .limit(150);

  const rows = (data as unknown as CandidateRow[]) ?? [];
  const candidates: CheckInCandidate[] = rows.map((r) => ({
    id: r.id,
    animalName: r.animals?.name ?? "Unknown",
    parentName: r.animals?.parents ? `${r.animals.parents.first_name} ${r.animals.parents.last_name}` : null,
    typeName: r.reservation_types?.name ?? null,
    startDate: r.start_date,
  }));

  return (
    <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-2 sm:px-6">
        <div className="grid grid-cols-3 items-center gap-3">
          <div />
          <a
            href="/"
            className="justify-self-center text-sm font-semibold uppercase tracking-wide text-slate-700 hover:text-indigo-600 dark:text-slate-200 dark:hover:text-indigo-400"
          >
            {session.facilityName}
          </a>
          <div className="flex items-center justify-self-end gap-3 text-sm text-slate-500 dark:text-slate-400">
            <span className="hidden sm:inline">{session.staffName}</span>
            <ThemeToggle />
            <form action={logout}>
              <button className="underline">Log out</button>
            </form>
          </div>
        </div>
        <QuickActionBar candidates={candidates} />
      </div>
    </header>
  );
}
