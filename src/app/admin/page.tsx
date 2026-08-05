import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isOwnerUnlocked } from "@/lib/ownerGate";
import FacilityHeader from "@/components/FacilityHeader";
import AdminGate from "@/components/AdminGate";

const REPORTS = [
  {
    href: "/admin/tips",
    icon: "💵",
    title: "Tips",
    blurb:
      "Gratuity by groomer and House pool for any date range, with a per-animal breakdown. Flags grooming+boarding tickets that need a manual split.",
  },
  {
    href: "/admin/revenue",
    icon: "📊",
    title: "Revenue by Service Type",
    blurb: "Boarding, daycare, grooming, retail, fees and tips broken out per location.",
  },
  {
    href: "/admin/commission",
    icon: "✂️",
    title: "Groomer Commission",
    blurb:
      "Payout per groomer using each one's Bath / Haircut / A La Carte split, less card processing, plus tips.",
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
            <h1 className="text-xl font-semibold">Admin Reports</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Reports run across every location, not just {session!.facilityName}. Owner-only.
            </p>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {REPORTS.map((r) => (
                <a
                  key={r.href}
                  href={r.href}
                  className="rounded-xl border border-slate-300 bg-white p-4 hover:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-500"
                >
                  <div className="text-base font-semibold">
                    {r.icon} {r.title}
                  </div>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{r.blurb}</p>
                </a>
              ))}
            </div>

            <p className="mt-6 text-xs text-slate-400 dark:text-slate-500">
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
