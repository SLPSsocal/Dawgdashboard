import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isOwnerUnlocked } from "@/lib/ownerGate";
import FacilityHeader from "@/components/FacilityHeader";
import AdminGate from "@/components/AdminGate";
import AdminReportControls from "@/components/AdminReportControls";
import { getFacilities, getReferralReport } from "@/lib/reports";
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

export default async function AdminReferralsPage({
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
          <AdminGate facilityName={session!.facilityName} next="/admin/referrals" error={sp.error} />
        </div>
      </main>
    );
  }

  const range = defaultRange();
  const from = sp.from || range.from;
  const to = sp.to || range.to;
  const facilityId = !sp.facility || sp.facility === "all" ? null : sp.facility;

  const [facilities, report] = await Promise.all([
    getFacilities(),
    getReferralReport(from, to, facilityId),
  ]);

  const totals = report.rows.reduce(
    (acc, r) => {
      acc.inPeriod += r.revenueInPeriod;
      acc.toDate += r.revenueToDate;
      return acc;
    },
    { inPeriod: 0, toDate: 0 }
  );

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <Link href="/admin" className="text-sm text-slate-400 underline dark:text-slate-500">
          ← Admin Reports
        </Link>
        <h1 className="mt-2 text-xl font-semibold">📣 Referral Sources — New Customer ROI</h1>
        <p className="mt-1 max-w-[70ch] text-sm text-slate-500 dark:text-slate-400">
          Customers who signed up in this window, grouped by where they said they heard about us.
          Compare a channel&apos;s revenue against what you spent on it that month. Customers are
          shared across locations; the location filter scopes the <em>revenue</em> columns to
          invoices at that facility.
        </p>

        <AdminReportControls
          basePath="/admin/referrals"
          from={from}
          to={to}
          facilityId={facilityId}
          facilities={facilities}
        />

        <div className="mt-4 rounded-xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950/40 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-2">Referral Source</th>
                  <th className="px-3 py-2 text-right">New Customers</th>
                  <th className="px-3 py-2 text-right" title="Their invoices dated inside the selected window">
                    Revenue in Period
                  </th>
                  <th className="px-3 py-2 text-right" title="Everything these customers have been invoiced since joining">
                    Revenue to Date
                  </th>
                  <th className="px-4 py-2 text-right">Avg / Customer</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <>
                    <tr key={r.source} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="px-4 py-2 font-medium">{r.source}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.newCustomers}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">
                        {r.revenueInPeriod === 0 ? "—" : money(r.revenueInPeriod)}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">
                        {r.revenueToDate === 0 ? "—" : money(r.revenueToDate)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">
                        {r.avgToDate === 0 ? "—" : money(r.avgToDate)}
                      </td>
                    </tr>
                    {/* Per-facility split (All Locations view): customer counts
                        by where they first booked; revenue by which facility
                        invoiced it. */}
                    {!facilityId &&
                      r.facilities.map((f) => (
                        <tr
                          key={`${r.source}-${f.facilityId}`}
                          className="border-b border-slate-50 bg-slate-50/40 text-xs text-slate-500 dark:border-slate-800/60 dark:bg-slate-950/20 dark:text-slate-400"
                        >
                          <td className="py-1.5 pl-8 pr-4">↳ {f.facilityName}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{f.newCustomers || "—"}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {f.revenueInPeriod === 0 ? "—" : money(f.revenueInPeriod)}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {f.revenueToDate === 0 ? "—" : money(f.revenueToDate)}
                          </td>
                          <td className="px-4 py-1.5" />
                        </tr>
                      ))}
                  </>
                ))}
                {report.rows.length > 1 && (
                  <tr className="bg-slate-50/60 dark:bg-slate-950/30">
                    <td className="px-4 py-2 font-semibold">All Sources ({report.totalNew} new)</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{report.totalNew}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{money(totals.inPeriod)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{money(totals.toDate)}</td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums">
                      {report.totalNew > 0 ? money(totals.toDate / report.totalNew) : "—"}
                    </td>
                  </tr>
                )}
                {report.rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400 dark:text-slate-500">
                      No new customers in this range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
          &quot;Revenue to Date&quot; keeps growing after the period ends — re-run last month&apos;s
          range later to see a channel&apos;s customers mature. &quot;(not recorded)&quot; means the
          parent was created without picking a referral source.
        </p>
      </div>
    </main>
  );
}
