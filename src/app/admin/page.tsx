import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isOwnerUnlocked } from "@/lib/ownerGate";
import FacilityHeader from "@/components/FacilityHeader";
import AdminGate from "@/components/AdminGate";
import Link from "next/link";

const REPORTS = [
  {
    href: "/admin/tips",
    title: "Tips",
    blurb:
      "Gratuity by groomer and House pool for any date range, with a per-animal breakdown. Flags grooming+boarding tickets that need a manual split.",
  },
  {
    href: "/admin/revenue",
    title: "Revenue by Service Type",
    blurb: "Boarding, daycare, grooming, retail, fees and tips broken out per location.",
  },
  {
    href: "/admin/sales-tax",
    title: "Sales Tax",
    blurb:
      "Taxable sales and tax collected for a period, per location. Only retail flagged taxable counts.",
  },
  {
    href: "/admin/commission",
    title: "Groomer Commission",
    blurb:
      "Payout per groomer using each one's Bath / Haircut / A La Carte split, less card processing, plus tips.",
  },
];

// Setup + QA screens that used to sit as top-level nav pills on every page.
const TOOLS = [
  {
    href: "/admin/account-codes",
    title: "Account Codes",
    blurb: "Revenue buckets every service and item rolls up into. Drag items between codes.",
  },
  {
    href: "/support",
    title: "Reported Issues",
    blurb: "Everything submitted through the 💬 button — screenshots, notes, open/resolved status.",
  },
  {
    href: "/referral-sources",
    title: "Referral Sources",
    blurb: "Options in the Referral Source dropdown on the New Parent form.",
  },
  {
    href: "/profile-tags",
    title: "Profile Tags",
    blurb: "Icons staff can attach to a dog or parent profile.",
  },
  {
    href: "/grooming-commission",
    title: "Commission Splits",
    blurb: "Each groomer's Bath / Haircut / A La Carte percentage.",
  },
];

export default async function AdminIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { error } = await searchParams;
  const unlocked = await isOwnerUnlocked(session.facilityId);

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        {!unlocked ? (
          <AdminGate facilityName={session!.facilityName} next="/admin" error={error} />
        ) : (
          <>
            <h1 className="text-[19px] font-semibold leading-tight">Admin</h1>
            <p className="mt-1 max-w-[65ch] text-[13px] text-slate-500 dark:text-slate-400">
              Reports run across every location, not just {session!.facilityName}. Owner-only.
            </p>

            <h2 className="mt-6 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Reports
            </h2>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {REPORTS.map((r) => (
                <Link
                  key={r.href}
                  href={r.href}
                  className="rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600"
                >
                  <div className="text-[14px] font-semibold">{r.title}</div>
                  <p className="mt-1 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">{r.blurb}</p>
                </Link>
              ))}
            </div>

            <h2 className="mt-6 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Setup &amp; QA
            </h2>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {TOOLS.map((r) => (
                <Link
                  key={r.href}
                  href={r.href}
                  className="rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600"
                >
                  <div className="text-[14px] font-semibold">{r.title}</div>
                  <p className="mt-1 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">{r.blurb}</p>
                </Link>
              ))}
            </div>

            <p className="mt-6 text-[12px] text-slate-400 dark:text-slate-500">
              Tip totals only count money that was actually invoiced. A tip is attributed to the groomer
              scheduled on the reservation; anything not clearly a groomer&apos;s goes to the House /
              General Staff pool.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
