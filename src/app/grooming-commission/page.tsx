import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import { isOwnerUnlocked } from "@/lib/ownerGate";
import { unlockOwnerView, saveCommissionRates } from "./actions";

const BUCKETS = [
  { key: "bath", label: "Bath" },
  { key: "haircut", label: "Haircut" },
  { key: "a_la_carte", label: "A La Carte" },
] as const;

export default async function GroomingCommissionPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { error } = await searchParams;

  const unlocked = await isOwnerUnlocked(session!.facilityId);

  if (!unlocked) {
    return (
      <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <FacilityHeader session={session!} />
        <div className="mx-auto max-w-sm px-4 py-10 sm:px-6">
          <h1 className="text-lg font-semibold">Owner Access</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Enter the owner PIN for {session!.facilityName} to view commission rates.
          </p>
          {error && (
            <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
              Incorrect PIN.
            </div>
          )}
          <form action={unlockOwnerView} className="mt-4 flex flex-col gap-3">
            <input
              name="pin"
              type="password"
              required
              autoFocus
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 sm:w-fit dark:bg-slate-100 dark:text-slate-900"
            >
              Unlock
            </button>
          </form>
        </div>
      </main>
    );
  }

  const supabase = createClient();
  const { data: groomers } = await supabase
    .from("staff")
    .select("id, full_name")
    .eq("facility_id", session!.facilityId)
    .eq("active", true)
    .or("role.eq.groomer,is_specialist.eq.true")
    .order("full_name");

  const groomerIds = (groomers ?? []).map((g) => g.id);
  const { data: rates } = groomerIds.length
    ? await supabase
        .from("groomer_commission_rates")
        .select("staff_id, service_bucket, split_percent")
        .in("staff_id", groomerIds)
    : { data: [] as { staff_id: string; service_bucket: string; split_percent: number }[] };

  const rateFor = (staffId: string, bucket: string) =>
    (rates ?? []).find((r) => r.staff_id === staffId && r.service_bucket === bucket)?.split_percent ?? "";

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="text-xl font-semibold">Grooming Commission Rates — {session!.facilityName}</h1>
        <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">
          Each groomer's commission split (%) per service type. Rates are set per groomer — they don't have to
          match each other.
        </p>

        {(groomers?.length ?? 0) === 0 ? (
          <p className="mt-6 text-sm text-slate-400 dark:text-slate-500">
            No groomers on staff here yet. Add a staff record with role &quot;groomer&quot; first.
          </p>
        ) : (
          <form
            action={saveCommissionRates}
            className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
          >
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Groomer
                  </th>
                  {BUCKETS.map((b) => (
                    <th
                      key={b.key}
                      className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                    >
                      {b.label} %
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groomers!.map((g) => (
                  <tr key={g.id} className="border-b border-slate-100 last:border-b-0 dark:border-slate-800">
                    <td className="px-3 py-2 font-medium">{g.full_name}</td>
                    {BUCKETS.map((b) => (
                      <td key={b.key} className="px-3 py-2">
                        <input
                          name={`rate__${g.id}__${b.key}`}
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          defaultValue={rateFor(g.id, b.key)}
                          className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="p-3">
              <button
                type="submit"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 dark:bg-slate-100 dark:text-slate-900"
              >
                Save Rates
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
