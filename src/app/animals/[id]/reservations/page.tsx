import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_STYLE: Record<string, string> = {
  checked_in: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300",
  booked: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  checked_out: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
};

// Full cross-facility visit history for this single dog — every reservation
// ever booked against this animal_id, at any facility, including cancelled
// ones (so staff can see the full picture, not just what's currently active).
export default async function AnimalReservationHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;

  const supabase = createClient();
  const { data: animal } = await supabase.from("animals").select("id, name").eq("id", id).maybeSingle();
  if (!animal) notFound();

  const { data: resData } = await supabase
    .from("reservations")
    .select(
      `id, status, start_date, end_date, cancelled_reason,
       reservation_types ( name, category ),
       facilities ( name )`
    )
    .eq("animal_id", id)
    .order("start_date", { ascending: false });

  type Row = {
    id: string;
    status: string;
    start_date: string;
    end_date: string;
    cancelled_reason: string | null;
    reservation_types: { name: string; category: string | null } | null;
    facilities: { name: string } | null;
  };
  const reservations = (resData as unknown as Row[]) ?? [];

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <a href={`/animals/${id}`} className="text-sm text-slate-400 underline dark:text-slate-500">
          ← {animal.name}
        </a>
        <h1 className="mt-2 text-xl font-semibold">Visit History — {animal.name}</h1>
        <p className="text-sm text-slate-400 dark:text-slate-500">Every reservation for this dog, across all facilities.</p>

        <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-500">
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Facility</th>
                <th className="px-3 py-2">Start</th>
                <th className="px-3 py-2">End</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {reservations.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                  <td className="px-3 py-2">
                    <a href={`/reservations/${r.id}`} className="font-medium underline">
                      {r.reservation_types?.name ?? "—"}
                    </a>
                  </td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{r.facilities?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{fmtDate(r.start_date)}</td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{fmtDate(r.end_date)}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        STATUS_STYLE[r.status] ?? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                      }`}
                    >
                      {r.status.replace("_", " ")}
                    </span>
                    {r.status === "cancelled" && r.cancelled_reason && (
                      <div className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{r.cancelled_reason}</div>
                    )}
                  </td>
                </tr>
              ))}
              {reservations.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-400 dark:text-slate-500">
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
