import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import Link from "next/link";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_STYLE: Record<string, string> = {
  checked_in: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300",
  booked: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  checked_out: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

// Full cross-facility reservation history for this parent, across every dog
// they own — not scoped to the staff member's current facility, since a
// parent (and their history) can span more than one location.
export default async function ParentReservationHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;

  const supabase = createClient();
  const { data: parent } = await supabase.from("parents").select("id, first_name, last_name").eq("id", id).maybeSingle();
  if (!parent) notFound();

  const { data: animals } = await supabase.from("animals").select("id").eq("parent_id", id);
  const animalIds = (animals ?? []).map((a) => a.id);

  const { data: resData } = await supabase
    .from("reservations")
    .select(
      `id, status, start_date, end_date,
       animals ( id, name ),
       reservation_types ( name, category ),
       facilities ( name )`
    )
    .in("animal_id", animalIds.length ? animalIds : ["00000000-0000-0000-0000-000000000000"])
    .order("start_date", { ascending: false });

  type Row = {
    id: string;
    status: string;
    start_date: string;
    end_date: string;
    animals: { id: string; name: string } | null;
    reservation_types: { name: string; category: string | null } | null;
    facilities: { name: string } | null;
  };
  const reservations = (resData as unknown as Row[]) ?? [];

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <Link href={`/parents/${id}`} className="text-sm text-slate-400 underline dark:text-slate-500">
          ← {parent.first_name} {parent.last_name}
        </Link>
        <h1 className="mt-2 text-xl font-semibold">
          Reservation History — {parent.first_name} {parent.last_name}
        </h1>
        <p className="text-sm text-slate-400 dark:text-slate-500">Every reservation across all of their dogs, all facilities.</p>

        <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-500">
                <th className="px-3 py-2">Dog</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Facility</th>
                <th className="px-3 py-2">Start</th>
                <th className="px-3 py-2">End</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {reservations.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                  <td className="px-3 py-2">
                    {r.animals ? (
                      <Link href={`/animals/${r.animals.id}`} className="font-medium underline">
                        {r.animals.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{r.reservation_types?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{r.facilities?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{fmtDate(r.start_date)}</td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{fmtDate(r.end_date)}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[r.status] ?? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
                      {r.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {/* Alan S (Sep 3): no way to open/edit a booking from here. */}
                    <Link
                      href={`/reservations/${r.id}`}
                      className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      Edit booking
                    </Link>
                  </td>
                </tr>
              ))}
              {reservations.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-400 dark:text-slate-500">
                    No reservations yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
