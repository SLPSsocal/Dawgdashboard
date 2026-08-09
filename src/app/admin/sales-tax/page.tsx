import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isOwnerUnlocked } from "@/lib/ownerGate";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import AdminGate from "@/components/AdminGate";
import AdminReportControls from "@/components/AdminReportControls";
import { PageHeader, PageShell } from "@/components/ui/Page";
import { getFacilities } from "@/lib/reports";

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

function defaultRange() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(first), to: iso(now) };
}

export default async function SalesTaxPage({
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
      <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <FacilityHeader session={session!} />
        <PageShell>
          <AdminGate facilityName={session!.facilityName} next="/admin/sales-tax" error={sp.error} />
        </PageShell>
      </main>
    );
  }

  const range = defaultRange();
  const from = sp.from || range.from;
  const to = sp.to || range.to;
  const facilityId = !sp.facility || sp.facility === "all" ? null : sp.facility;

  const supabase = createClient();

  let invQ = supabase
    .from("invoices")
    .select("id, facility_id, paid_at, created_at, tax, total")
    .lte("created_at", `${to}T23:59:59.999Z`);
  if (facilityId) invQ = invQ.eq("facility_id", facilityId);
  const [{ data: invRaw }, facilities, { data: facRates }] = await Promise.all([
    invQ,
    getFacilities(),
    supabase.from("facilities").select("id, tax_rate"),
  ]);

  type Inv = {
    id: string;
    facility_id: string;
    paid_at: string | null;
    created_at: string;
    tax: number;
    total: number;
  };
  const invoices = ((invRaw as Inv[]) ?? []).filter((i) => {
    const d = (i.paid_at ?? i.created_at).slice(0, 10);
    return d >= from && d <= to;
  });

  // Line items carry the taxability decision made at sale time (a retail item
  // flagged non-taxable — House Food, CBD chews — must not be counted).
  const { data: lines } = invoices.length
    ? await supabase
        .from("invoice_line_items")
        .select("invoice_id, description, line_total, line_kind, retail_item_id")
        .in(
          "invoice_id",
          invoices.map((i) => i.id)
        )
    : { data: [] };

  const { data: retailItems } = await supabase.from("retail_items").select("id, name, taxable");
  const taxableById = new Map(
    ((retailItems as { id: string; name: string; taxable: boolean }[]) ?? []).map((r) => [r.id, r])
  );
  const rateById = new Map(
    ((facRates as { id: string; tax_rate: number }[]) ?? []).map((f) => [f.id, Number(f.tax_rate)])
  );
  const invById = new Map(invoices.map((i) => [i.id, i]));

  type Row = {
    facilityId: string;
    facilityName: string;
    taxableSales: number;
    nonTaxableRetail: number;
    otherRevenue: number;
    taxCollected: number;
    rate: number;
  };
  const acc = new Map<string, Row>();
  const blank = (fid: string): Row => ({
    facilityId: fid,
    facilityName: facilities.find((f) => f.id === fid)?.name ?? "—",
    taxableSales: 0,
    nonTaxableRetail: 0,
    otherRevenue: 0,
    taxCollected: 0,
    rate: rateById.get(fid) ?? 0,
  });

  for (const l of ((lines as {
    invoice_id: string;
    description: string;
    line_total: number;
    line_kind: string | null;
    retail_item_id: string | null;
  }[]) ?? [])) {
    const inv = invById.get(l.invoice_id);
    if (!inv) continue;
    const row = acc.get(inv.facility_id) ?? blank(inv.facility_id);
    const amt = Number(l.line_total);
    const isRetail = l.line_kind === "retail" || l.retail_item_id;

    if (isRetail) {
      const item = l.retail_item_id ? taxableById.get(l.retail_item_id) : null;
      // Unknown item (deleted from catalog) falls back to taxable, matching
      // the retail_items default, and is safer than under-reporting tax owed.
      if (item ? item.taxable : true) row.taxableSales += amt;
      else row.nonTaxableRetail += amt;
    } else {
      row.otherRevenue += amt;
    }
    acc.set(inv.facility_id, row);
  }

  // Tax actually charged comes off the invoice, not recomputed — that's what
  // the customer was billed and therefore what's owed.
  for (const inv of invoices) {
    const row = acc.get(inv.facility_id) ?? blank(inv.facility_id);
    row.taxCollected += Number(inv.tax);
    acc.set(inv.facility_id, row);
  }

  const rows = Array.from(acc.values()).sort((a, b) => a.facilityName.localeCompare(b.facilityName));
  const grand = rows.reduce(
    (a, r) => ({
      taxableSales: a.taxableSales + r.taxableSales,
      nonTaxableRetail: a.nonTaxableRetail + r.nonTaxableRetail,
      otherRevenue: a.otherRevenue + r.otherRevenue,
      taxCollected: a.taxCollected + r.taxCollected,
    }),
    { taxableSales: 0, nonTaxableRetail: 0, otherRevenue: 0, taxCollected: 0 }
  );

  // Flag drift between what was charged and what the current rate implies.
  const expected = rows.reduce((s, r) => s + (r.taxableSales * r.rate) / 100, 0);
  const drift = Math.round((grand.taxCollected - expected) * 100) / 100;

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <FacilityHeader session={session!} />
      <PageShell width="lg">
        <PageHeader
          backHref="/admin"
          backLabel="Admin"
          title="Sales Tax"
          description="Taxable sales and tax collected for a period. Only retail counts — and only retail flagged taxable, so House Food and CBD chews are excluded."
        />

        <AdminReportControls
          basePath="/admin/sales-tax"
          from={from}
          to={to}
          facilityId={facilityId}
          facilities={facilities}
        />

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="text-[20px] font-semibold tabular-nums">{money(grand.taxableSales)}</div>
            <div className="text-[12px] text-slate-500 dark:text-slate-400">Taxable sales</div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/30">
            <div className="text-[20px] font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
              {money(grand.taxCollected)}
            </div>
            <div className="text-[12px] text-emerald-700/80 dark:text-emerald-400/80">Tax collected (owed)</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="text-[20px] font-semibold tabular-nums">{money(grand.nonTaxableRetail)}</div>
            <div className="text-[12px] text-slate-500 dark:text-slate-400">Non-taxable retail</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="text-[20px] font-semibold tabular-nums">{money(grand.otherRevenue)}</div>
            <div className="text-[12px] text-slate-500 dark:text-slate-400">Services (not taxed)</div>
          </div>
        </div>

        {Math.abs(drift) >= 0.01 && (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            Tax charged differs from taxable sales × current rate by{" "}
            <strong>{money(Math.abs(drift))}</strong> ({drift > 0 ? "over" : "under"}-collected). Usually
            means the rate changed mid-period, or a sale predates the rate being set.
          </div>
        )}

        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-950/40 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-2">Location</th>
                  <th className="px-3 py-2 text-right">Rate</th>
                  <th className="px-3 py-2 text-right">Taxable sales</th>
                  <th className="px-3 py-2 text-right">Non-taxable retail</th>
                  <th className="px-3 py-2 text-right">Services</th>
                  <th className="px-4 py-2 text-right">Tax collected</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.facilityId} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-2 font-medium">{r.facilityName}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">
                      {r.rate}%
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(r.taxableSales)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">
                      {r.nonTaxableRetail === 0 ? "—" : money(r.nonTaxableRetail)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">
                      {r.otherRevenue === 0 ? "—" : money(r.otherRevenue)}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums">{money(r.taxCollected)}</td>
                  </tr>
                ))}
                {rows.length > 1 && (
                  <tr className="bg-slate-50/60 dark:bg-slate-950/30">
                    <td className="px-4 py-2 font-semibold">All Locations</td>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{money(grand.taxableSales)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {money(grand.nonTaxableRetail)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{money(grand.otherRevenue)}</td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums">{money(grand.taxCollected)}</td>
                  </tr>
                )}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400 dark:text-slate-500">
                      No invoiced sales in this range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-3 text-[12px] text-slate-400 dark:text-slate-500">
          &ldquo;Tax collected&rdquo; is what was actually charged on each invoice, not a recalculation — that&apos;s
          the figure you remitted against. Set each location&apos;s rate on its facility record.
        </p>
      </PageShell>
    </main>
  );
}
