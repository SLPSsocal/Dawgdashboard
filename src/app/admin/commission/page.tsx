import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isOwnerUnlocked } from "@/lib/ownerGate";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import AdminGate from "@/components/AdminGate";
import AdminReportControls from "@/components/AdminReportControls";
import { getFacilities, getTipRows } from "@/lib/reports";

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

function defaultRange() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(first), to: iso(now) };
}

// Mirrors the buckets in the commission rate table. Anything that isn't
// clearly a bath or a full haircut is treated as an a-la-carte add-on.
function bucketFor(serviceName: string | null, description: string): "bath" | "haircut" | "a_la_carte" {
  const s = `${serviceName ?? ""} ${description}`.toLowerCase();
  if (s.includes("haircut") || s.includes("styling")) return "haircut";
  if (s.includes("bath") && !s.includes("flea") && !s.includes("mud")) return "bath";
  return "a_la_carte";
}

const BUCKET_LABEL = { bath: "Bath", haircut: "Haircut", a_la_carte: "A La Carte" } as const;

// From the payout spreadsheet: the shop keeps 2% off the top, the groomer's
// split applies to the remainder, card tickets then carry a ~4.08% processing
// fee on (commission + tip), and tips pass through in full.
const SHOP_RETENTION = 0.98;
const CARD_FEE_RATE = 2 / 49;

export default async function AdminCommissionPage({
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
          <AdminGate facilityName={session!.facilityName} next="/admin/commission" error={sp.error} />
        </div>
      </main>
    );
  }

  const range = defaultRange();
  const from = sp.from || range.from;
  const to = sp.to || range.to;
  const facilityId = !sp.facility || sp.facility === "all" ? null : sp.facility;

  const supabase = createClient();

  // Invoices in range (same date rule as the other reports: paid_at, else created_at)
  let invQ = supabase
    .from("invoices")
    .select("id, facility_id, paid_at, created_at, reservation_id")
    .lte("created_at", `${to}T23:59:59.999Z`);
  if (facilityId) invQ = invQ.eq("facility_id", facilityId);
  const { data: invRaw } = await invQ;

  type Inv = { id: string; facility_id: string; paid_at: string | null; created_at: string; reservation_id: string | null };
  const invoices = ((invRaw as Inv[]) ?? []).filter((i) => {
    const d = (i.paid_at ?? i.created_at).slice(0, 10);
    return d >= from && d <= to;
  });

  const [facilities, tipRows] = await Promise.all([getFacilities(), getTipRows(from, to, facilityId)]);

  type Row = {
    specialistId: string;
    name: string;
    facilityName: string;
    buckets: Record<"bath" | "haircut" | "a_la_carte", { revenue: number; rate: number; commission: number }>;
    revenue: number;
    commissionBeforeFee: number;
    cardFee: number;
    tips: number;
    payout: number;
  };
  const byGroomer = new Map<string, Row>();

  if (invoices.length > 0) {
    const invoiceIds = invoices.map((i) => i.id);
    const reservationIds = invoices.map((i) => i.reservation_id).filter((v): v is string => !!v);

    const [{ data: lines }, { data: reservations }, { data: payments }, { data: rates }, { data: staffRows }] =
      await Promise.all([
        supabase
          .from("invoice_line_items")
          .select("invoice_id, description, line_total, line_kind, grooming_service_name")
          .in("invoice_id", invoiceIds),
        reservationIds.length
          ? supabase.from("reservations").select("id, specialist_id").in("id", reservationIds)
          : Promise.resolve({ data: [] }),
        supabase
          .from("payments")
          .select("invoice_id, helcim_transaction_id, status")
          .in("invoice_id", invoiceIds),
        supabase.from("groomer_commission_rates").select("staff_id, service_bucket, split_percent"),
        supabase.from("staff").select("id, full_name, facility_id").eq("active", true),
      ]);

    const specialistByRes = new Map<string, string | null>();
    for (const r of ((reservations as { id: string; specialist_id: string | null }[]) ?? [])) {
      specialistByRes.set(r.id, r.specialist_id);
    }
    // A ticket counts as "card" if any approved payment on it carries a
    // gateway transaction id; cash-only tickets take no processing fee.
    const cardInvoices = new Set(
      ((payments as { invoice_id: string; helcim_transaction_id: string | null; status: string }[]) ?? [])
        .filter((p) => p.helcim_transaction_id && p.status === "approved")
        .map((p) => p.invoice_id)
    );
    const rateFor = new Map<string, number>();
    for (const r of ((rates as { staff_id: string; service_bucket: string; split_percent: number }[]) ?? [])) {
      rateFor.set(`${r.staff_id}:${r.service_bucket}`, Number(r.split_percent));
    }
    const staffById = new Map<string, { full_name: string; facility_id: string }>();
    for (const s of ((staffRows as { id: string; full_name: string; facility_id: string }[]) ?? [])) {
      staffById.set(s.id, { full_name: s.full_name, facility_id: s.facility_id });
    }
    const invById = new Map(invoices.map((i) => [i.id, i]));
    const facilityName = new Map(facilities.map((f) => [f.id, f.name]));

    const blank = (id: string): Row => ({
      specialistId: id,
      name: staffById.get(id)?.full_name ?? "Unknown",
      facilityName: facilityName.get(staffById.get(id)?.facility_id ?? "") ?? "—",
      buckets: {
        bath: { revenue: 0, rate: rateFor.get(`${id}:bath`) ?? 0, commission: 0 },
        haircut: { revenue: 0, rate: rateFor.get(`${id}:haircut`) ?? 0, commission: 0 },
        a_la_carte: { revenue: 0, rate: rateFor.get(`${id}:a_la_carte`) ?? 0, commission: 0 },
      },
      revenue: 0,
      commissionBeforeFee: 0,
      cardFee: 0,
      tips: 0,
      payout: 0,
    });

    for (const l of ((lines as {
      invoice_id: string;
      description: string;
      line_total: number;
      line_kind: string | null;
      grooming_service_name: string | null;
    }[]) ?? [])) {
      if (l.line_kind !== "grooming") continue;
      const inv = invById.get(l.invoice_id);
      if (!inv?.reservation_id) continue;
      const specialistId = specialistByRes.get(inv.reservation_id) ?? null;
      if (!specialistId) continue;

      const row = byGroomer.get(specialistId) ?? blank(specialistId);
      const bucket = bucketFor(l.grooming_service_name, l.description);
      const amt = Number(l.line_total);
      const base = amt * SHOP_RETENTION;
      const commission = base * (row.buckets[bucket].rate / 100);

      row.buckets[bucket].revenue += amt;
      row.buckets[bucket].commission += commission;
      row.revenue += amt;
      row.commissionBeforeFee += commission;
      if (cardInvoices.has(l.invoice_id)) {
        // Fee applies to commission now; the tip portion is added below.
        row.cardFee += commission * CARD_FEE_RATE;
      }
      byGroomer.set(specialistId, row);
    }

    // Tips already resolved (including any manual splits) by the tips report.
    for (const t of tipRows) {
      if (t.effectiveGroomerAmount <= 0 || !t.effectiveSpecialistId) continue;
      const row = byGroomer.get(t.effectiveSpecialistId) ?? blank(t.effectiveSpecialistId);
      row.tips += t.effectiveGroomerAmount;
      if (cardInvoices.has(t.invoiceId)) row.cardFee += t.effectiveGroomerAmount * CARD_FEE_RATE;
      byGroomer.set(t.effectiveSpecialistId, row);
    }

    for (const row of byGroomer.values()) {
      row.payout = row.commissionBeforeFee - row.cardFee + row.tips;
    }
  }

  const rows = Array.from(byGroomer.values()).sort((a, b) => b.payout - a.payout);
  const grand = rows.reduce(
    (a, r) => ({
      revenue: a.revenue + r.revenue,
      commissionBeforeFee: a.commissionBeforeFee + r.commissionBeforeFee,
      cardFee: a.cardFee + r.cardFee,
      tips: a.tips + r.tips,
      payout: a.payout + r.payout,
    }),
    { revenue: 0, commissionBeforeFee: 0, cardFee: 0, tips: 0, payout: 0 }
  );

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <a href="/admin" className="text-sm text-slate-400 underline dark:text-slate-500">
          ← Admin Reports
        </a>
        <h1 className="mt-2 text-xl font-semibold">✂️ Groomer Commission</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Commission = service revenue × 98% × that groomer&apos;s split for the bucket. Card tickets
          carry a {(CARD_FEE_RATE * 100).toFixed(2)}% processing fee on commission + tips. Tips pass
          through in full.{" "}
          <a href="/grooming-commission" className="text-indigo-600 underline dark:text-indigo-400">
            Edit splits →
          </a>
        </p>

        <AdminReportControls
          basePath="/admin/commission"
          from={from}
          to={to}
          facilityId={facilityId}
          facilities={facilities}
        />

        <div className="mt-4 rounded-xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950/40 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-2">Groomer</th>
                  <th className="px-3 py-2 text-right">Service Rev</th>
                  <th className="px-3 py-2 text-right">Commission</th>
                  <th className="px-3 py-2 text-right">Card Fee</th>
                  <th className="px-3 py-2 text-right">Tips</th>
                  <th className="px-4 py-2 text-right">Payout</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.specialistId} className="border-b border-slate-100 align-top dark:border-slate-800">
                    <td className="px-4 py-2">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-slate-400 dark:text-slate-500">{r.facilityName}</div>
                      <div className="mt-1 flex flex-col gap-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {(["bath", "haircut", "a_la_carte"] as const)
                          .filter((b) => r.buckets[b].revenue > 0)
                          .map((b) => (
                            <span key={b}>
                              {BUCKET_LABEL[b]}: {money(r.buckets[b].revenue)} @ {r.buckets[b].rate}% ={" "}
                              {money(r.buckets[b].commission)}
                            </span>
                          ))}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">{money(r.revenue)}</td>
                    <td className="px-3 py-2 text-right">{money(r.commissionBeforeFee)}</td>
                    <td className="px-3 py-2 text-right text-red-600 dark:text-red-400">
                      {r.cardFee > 0 ? `−${money(r.cardFee)}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">{r.tips > 0 ? money(r.tips) : "—"}</td>
                    <td className="px-4 py-2 text-right font-semibold">{money(r.payout)}</td>
                  </tr>
                ))}
                {rows.length > 1 && (
                  <tr className="bg-slate-50/60 dark:bg-slate-950/30">
                    <td className="px-4 py-2 font-semibold">All Groomers</td>
                    <td className="px-3 py-2 text-right font-semibold">{money(grand.revenue)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{money(grand.commissionBeforeFee)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-red-600 dark:text-red-400">
                      −{money(grand.cardFee)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">{money(grand.tips)}</td>
                    <td className="px-4 py-2 text-right font-semibold">{money(grand.payout)}</td>
                  </tr>
                )}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400 dark:text-slate-500">
                      No grooming revenue attributed to a specialist in this range. A groom only counts
                      here if its reservation had a specialist assigned.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
          Does not yet apply the hourly-minimum-wage guarantee comparison from your spreadsheet — that
          needs hours worked, which the app doesn&apos;t track.
        </p>
      </div>
    </main>
  );
}
