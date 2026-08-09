import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isOwnerUnlocked } from "@/lib/ownerGate";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import AdminGate from "@/components/AdminGate";
import AdminReportControls from "@/components/AdminReportControls";
import { getFacilities, getTipRows, summarizeTipsBySpecialist } from "@/lib/reports";
import { saveTipAllocation } from "../actions";
import Link from "next/link";

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

function defaultRange() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(first), to: iso(now) };
}

export default async function AdminTipsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; facility?: string; error?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const sp = await searchParams;
  const unlocked = await isOwnerUnlocked(session.facilityId);

  if (!unlocked) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-950">
        <FacilityHeader session={session!} />
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
          <AdminGate facilityName={session!.facilityName} next="/admin/tips" error={sp.error} />
        </div>
      </main>
    );
  }

  const range = defaultRange();
  const from = sp.from || range.from;
  const to = sp.to || range.to;
  const facilityId = !sp.facility || sp.facility === "all" ? null : sp.facility;

  const supabase = createClient();
  const [facilities, rows, { data: allStaff }] = await Promise.all([
    getFacilities(),
    getTipRows(from, to, facilityId),
    supabase.from("staff").select("id, full_name, facility_id").eq("active", true).order("full_name"),
  ]);

  const staffNames = new Map<string, string>(
    ((allStaff as { id: string; full_name: string }[]) ?? []).map((s) => [s.id, s.full_name])
  );
  const { specialists, house, needsAllocation } = summarizeTipsBySpecialist(rows, staffNames);

  const grandTotal = rows.reduce((s, r) => s + r.tipAmount, 0);
  const qs = `from=${from}&to=${to}&facility=${sp.facility ?? "all"}`;
  const returnTo = `/admin/tips?${qs}`;

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <Link href="/admin" className="text-sm text-slate-400 underline dark:text-slate-500">
          ← Admin Reports
        </Link>
        <h1 className="mt-2 text-xl font-semibold">💵 Tips</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Gratuity earned per groomer for a date range, across one or all locations.
        </p>

        <AdminReportControls
          basePath="/admin/tips"
          from={from}
          to={to}
          facilityId={facilityId}
          facilities={facilities}
        />

        {/* Totals */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="text-2xl font-semibold">{money(grandTotal)}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Total tips collected</div>
          </div>
          <div className="rounded-xl border border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="text-2xl font-semibold">{rows.length}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Tipped tickets</div>
          </div>
          <div className="rounded-xl border border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="text-2xl font-semibold">{money(house.tipTotal)}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">House / General Staff</div>
          </div>
          <div
            className={`rounded-xl border p-4 ${
              needsAllocation.length > 0
                ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"
                : "border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900"
            }`}
          >
            <div className="text-2xl font-semibold">{needsAllocation.length}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Need a manual split</div>
          </div>
        </div>

        {/* Per-specialist rollup */}
        <div className="mt-6 rounded-xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
          <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 dark:border-slate-800 dark:text-slate-200">
            Tips by Specialist
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950/40 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-2">Specialist</th>
                  <th className="px-4 py-2 text-right">Tickets</th>
                  <th className="px-4 py-2 text-right">Tips Earned</th>
                </tr>
              </thead>
              <tbody>
                {specialists.map((s) => (
                  <tr key={s.specialistId ?? s.name} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-2 font-medium">✂️ {s.name}</td>
                    <td className="px-4 py-2 text-right text-slate-500 dark:text-slate-400">{s.ticketCount}</td>
                    <td className="px-4 py-2 text-right font-semibold">{money(s.tipTotal)}</td>
                  </tr>
                ))}
                <tr className="border-b border-slate-100 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-950/30">
                  <td className="px-4 py-2 font-medium">🏠 {house.name}</td>
                  <td className="px-4 py-2 text-right text-slate-500 dark:text-slate-400">{house.ticketCount}</td>
                  <td className="px-4 py-2 text-right font-semibold">{money(house.tipTotal)}</td>
                </tr>
                {specialists.length === 0 && house.tipTotal === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-slate-400 dark:text-slate-500">
                      No tips recorded in this range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Per-ticket detail, with inline split inputs on mixed tickets */}
        <div className="mt-6 rounded-xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
          <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 dark:border-slate-800 dark:text-slate-200">
            Detail by Animal
          </h2>
          <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((r) => {
              // Proportional prefill is only a starting point — the whole
              // reason this is a form is that the split is your call.
              const svcTotal = r.groomingRevenue + r.lodgingRevenue;
              const suggestedGroomer =
                svcTotal > 0 ? Math.round((r.tipAmount * r.groomingRevenue) / svcTotal * 100) / 100 : 0;
              const suggestedHouse = Math.round((r.tipAmount - suggestedGroomer) * 100) / 100;
              const groomerOptions = ((allStaff as { id: string; full_name: string; facility_id: string }[]) ?? [])
                .filter((s) => s.facility_id === r.facilityId);

              return (
                <div key={r.lineItemId} className="px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-medium">
                        {r.animalId ? (
                          <Link href={`/animals/${r.animalId}`} className="underline">
                            {r.animalName ?? "—"}
                          </Link>
                        ) : (
                          r.animalName ?? "Walk-in / no animal"
                        )}
                      </span>
                      <span className="text-slate-400 dark:text-slate-500">
                        {r.parentName ? ` · ${r.parentName}` : ""} · {r.facilityName} ·{" "}
                        {new Date(r.paidAt ?? r.createdAt).toLocaleDateString()}
                      </span>
                      {r.isMixed && (
                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                          ⚠️ Grooming + Boarding
                        </span>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-semibold">{money(r.tipAmount)}</div>
                      <div className="text-xs text-slate-400 dark:text-slate-500">
                        {r.effectiveGroomerAmount > 0 &&
                          `✂️ ${money(r.effectiveGroomerAmount)}${
                            r.effectiveSpecialistId
                              ? ` → ${staffNames.get(r.effectiveSpecialistId) ?? "?"}`
                              : ""
                          }`}
                        {r.effectiveGroomerAmount > 0 && r.effectiveHouseAmount > 0 && " · "}
                        {r.effectiveHouseAmount > 0 && `🏠 ${money(r.effectiveHouseAmount)}`}
                      </div>
                    </div>
                  </div>

                  {r.isMixed && (
                    <details open={!r.allocation} className="mt-2">
                      <summary className="cursor-pointer select-none text-xs text-indigo-600 underline dark:text-indigo-400">
                        {r.allocation ? "Edit split" : "Split this tip"}
                      </summary>
                      <div className="mt-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-950/40">
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Grooming on this ticket: {money(r.groomingRevenue)} · Boarding/daycare:{" "}
                          {money(r.lodgingRevenue)} · suggested split {money(suggestedGroomer)} /{" "}
                          {money(suggestedHouse)}
                        </p>
                        <form action={saveTipAllocation} className="mt-2 flex flex-wrap items-end gap-2">
                          <input type="hidden" name="line_item_id" value={r.lineItemId} />
                          <input type="hidden" name="facility_id" value={r.facilityId} />
                          <input type="hidden" name="return_to" value={returnTo} />
                          <label className="block">
                            <span className="text-xs text-slate-500 dark:text-slate-400">Groomer</span>
                            <select
                              name="specialist_id"
                              defaultValue={r.allocation?.specialistId ?? r.specialistId ?? ""}
                              className="mt-1 block rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            >
                              <option value="">— none —</option>
                              {groomerOptions.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.full_name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block">
                            <span className="text-xs text-slate-500 dark:text-slate-400">Groomer $</span>
                            <input
                              name="groomer_amount"
                              type="number"
                              step="0.01"
                              defaultValue={(r.allocation?.groomerAmount ?? suggestedGroomer).toFixed(2)}
                              className="mt-1 block w-24 rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs text-slate-500 dark:text-slate-400">House $</span>
                            <input
                              name="house_amount"
                              type="number"
                              step="0.01"
                              defaultValue={(r.allocation?.houseAmount ?? suggestedHouse).toFixed(2)}
                              className="mt-1 block w-24 rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            />
                          </label>
                          <button
                            type="submit"
                            className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 dark:bg-slate-100 dark:text-slate-900"
                          >
                            Save Split
                          </button>
                          {r.allocation?.allocatedBy && (
                            <span className="text-xs text-slate-400 dark:text-slate-500">
                              set by {r.allocation.allocatedBy}
                            </span>
                          )}
                        </form>
                      </div>
                    </details>
                  )}
                </div>
              );
            })}
            {rows.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
                No tips in this range.
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
