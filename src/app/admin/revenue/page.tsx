import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isOwnerUnlocked } from "@/lib/ownerGate";
import FacilityHeader from "@/components/FacilityHeader";
import AdminGate from "@/components/AdminGate";
import AdminReportControls from "@/components/AdminReportControls";
import { getFacilities, getRevenueByServiceType } from "@/lib/reports";
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

const COLUMNS = [
  { key: "boarding", label: "Boarding" },
  { key: "daycare", label: "Daycare" },
  { key: "grooming", label: "Grooming" },
  { key: "retail", label: "Retail" },
  { key: "fees", label: "Fees" },
  { key: "discounts", label: "Discounts" },
  { key: "tips", label: "Tips" },
  { key: "other", label: "Other" },
] as const;

export default async function AdminRevenuePage({
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
          <AdminGate facilityName={session!.facilityName} next="/admin/revenue" error={sp.error} />
        </div>
      </main>
    );
  }

  const range = defaultRange();
  const from = sp.from || range.from;
  const to = sp.to || range.to;
  const facilityId = !sp.facility || sp.facility === "all" ? null : sp.facility;

  const [facilities, breakdown] = await Promise.all([
    getFacilities(),
    getRevenueByServiceType(from, to, facilityId),
  ]);

  const totals = breakdown.reduce(
    (acc, b) => {
      for (const c of COLUMNS) acc[c.key] += b[c.key];
      acc.total += b.total;
      return acc;
    },
    { boarding: 0, daycare: 0, grooming: 0, retail: 0, fees: 0, discounts: 0, tips: 0, other: 0, total: 0 }
  );

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <Link href="/admin" className="text-sm text-slate-400 underline dark:text-slate-500">
          ← Admin Reports
        </Link>
        <h1 className="mt-2 text-xl font-semibold">📊 Revenue by Service Type</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          What was actually invoiced in the period, split by what was sold. Discounts show as the
          negative adjustments they are.
        </p>

        <AdminReportControls
          basePath="/admin/revenue"
          from={from}
          to={to}
          facilityId={facilityId}
          facilities={facilities}
        />

        <div className="mt-4 rounded-xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950/40 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-2">Location</th>
                  {COLUMNS.map((c) => (
                    <th key={c.key} className="px-3 py-2 text-right">
                      {c.label}
                    </th>
                  ))}
                  <th className="px-4 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((b) => (
                  <tr key={b.facilityId} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-2 font-medium">{b.facilityName}</td>
                    {COLUMNS.map((c) => (
                      <td key={c.key} className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">
                        {b[c.key] === 0 ? "—" : money(b[c.key])}
                      </td>
                    ))}
                    <td className="px-4 py-2 text-right font-semibold">{money(b.total)}</td>
                  </tr>
                ))}
                {breakdown.length > 1 && (
                  <tr className="bg-slate-50/60 dark:bg-slate-950/30">
                    <td className="px-4 py-2 font-semibold">All Locations</td>
                    {COLUMNS.map((c) => (
                      <td key={c.key} className="px-3 py-2 text-right font-semibold">
                        {totals[c.key] === 0 ? "—" : money(totals[c.key])}
                      </td>
                    ))}
                    <td className="px-4 py-2 text-right font-semibold">{money(totals.total)}</td>
                  </tr>
                )}
                {breakdown.length === 0 && (
                  <tr>
                    <td colSpan={COLUMNS.length + 2} className="px-4 py-8 text-center text-slate-400 dark:text-slate-500">
                      No invoiced revenue in this range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
