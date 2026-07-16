import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";

type Row = {
  id: string;
  status: string;
  start_date: string;
  end_date: string;
  animals: { id: string; name: string; breed: string | null; photo_url: string | null; parents: { first_name: string; last_name: string; phone: string | null } | null } | null;
  lodging_areas: { name: string } | null;
  reservation_types: { name: string } | null;
};

export default async function ReservationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Facility isolation happens right here: every query in this app is filtered
  // by session.facilityId, which came from the PIN login for this facility only.
  const supabase = createClient();
  const { data, error } = await supabase
    .from("reservations")
    .select(
      `id, status, start_date, end_date,
       animals ( id, name, breed, photo_url, parents ( first_name, last_name, phone ) ),
       lodging_areas ( name ),
       reservation_types ( name )`
    )
    .eq("facility_id", session!.facilityId)
    .in("status", ["booked", "checked_in"])
    .order("start_date", { ascending: true });

  const rows = (data as unknown as Row[]) ?? [];
  const checkedIn = rows.filter((r) => r.status === "checked_in");
  const expected = rows.filter((r) => r.status === "booked");

  return (
    <main className="min-h-screen bg-neutral-100 dark:bg-neutral-950">
      <FacilityHeader session={session!} />

      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="text-xl font-semibold">Check-in Board</h1>
        {error && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">Couldn&apos;t load reservations: {error.message}</p>
        )}

        <Section
          title={`🟢 Currently Checked In (${checkedIn.length})`}
          rows={checkedIn}
          accent="border-l-green-500"
        />
        <Section
          title={`📋 Expected Today (${expected.length})`}
          rows={expected}
          accent="border-l-amber-500"
        />

        {rows.length === 0 && !error && (
          <p className="mt-8 text-sm text-neutral-400 dark:text-neutral-500">
            No reservations yet at {session!.facilityName}. Once reservation types and lodging
            areas are set up, bookings will show here.
          </p>
        )}
      </div>
    </main>
  );
}

function Section({ title, rows, accent }: { title: string; rows: Row[]; accent: string }) {
  if (rows.length === 0) return null;
  return (
    <details
      open
      className="group mt-4 rounded-xl border border-neutral-300 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-900"
    >
      <summary className="flex cursor-pointer select-none list-none items-center justify-between px-4 py-3">
        <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">{title}</h2>
        <span className="text-neutral-400 transition-transform group-open:rotate-180 dark:text-neutral-500">
          ▾
        </span>
      </summary>
      <div className="grid grid-cols-1 gap-3 border-t border-neutral-100 p-4 sm:grid-cols-2 dark:border-neutral-800">
        {rows.map((r) => (
          <div
            key={r.id}
            className={`rounded-lg border border-l-4 border-neutral-200 bg-neutral-50 p-4 shadow-sm ${accent} dark:border-neutral-800 dark:bg-neutral-950/60`}
          >
            <div className="font-medium">{r.animals?.name ?? "Unknown"}</div>
            <div className="text-sm text-neutral-500 dark:text-neutral-400">
              {r.animals?.breed ?? "—"} · {r.reservation_types?.name ?? "—"}
            </div>
            <div className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Owner: {r.animals?.parents ? `${r.animals.parents.first_name} ${r.animals.parents.last_name}` : "—"}
            </div>
            <div className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
              {r.lodging_areas?.name ?? "No lodging assigned"} · {new Date(r.start_date).toLocaleDateString()} → {new Date(r.end_date).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}
