import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import { Badge, Card, PageHeader, PageShell } from "@/components/ui/Page";
import Link from "next/link";
import { formatRequestId } from "@/lib/purchaseRequests";

type ItemRow = {
  id: string;
  item: string;
  brand: string | null;
  quantity: number | string;
  urgent: boolean;
  sort_order: number;
};

export default async function PurchaseRequestsPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/purchase-requests");

  const supabase = createClient();
  const { data, error } = await supabase
    .from("purchase_requests")
    .select(
      "id, request_number, requested_by, notes, status, created_at, facilities ( name ), purchase_request_items ( id, item, brand, quantity, urgent, sort_order )"
    )
    .eq("status", "new")
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = data ?? [];

  return (
    <main className="min-h-screen bg-[#f5f6f8] dark:bg-slate-950">
      <FacilityHeader session={session} />
      <PageShell width="md">
        <PageHeader
          title="New purchase requests"
          description="Everything still in status new — across all four facilities. Staff submit from Purchase request."
          action={
            <Link
              href="/purchase-request"
              className="inline-flex h-9 items-center rounded-[10px] bg-indigo-600 px-3.5 text-[13px] font-semibold text-white hover:bg-indigo-700"
            >
              + New request
            </Link>
          }
        />

        {error && (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            Couldn&apos;t load requests. If this is a fresh deploy, apply{" "}
            <code className="font-mono text-[12px]">
              supabase/migrations/20260906220000_purchase_requests.sql
            </code>{" "}
            in the Supabase SQL editor. {error.message}
          </p>
        )}

        {rows.length === 0 && !error && (
          <Card>
            <p className="px-4 py-8 text-center text-[13px] text-slate-500 dark:text-slate-400">
              No new purchase requests.
            </p>
          </Card>
        )}

        <div className="flex flex-col gap-3">
          {rows.map((row) => {
            const facility = row.facilities as unknown as { name: string } | null;
            const items = ((row.purchase_request_items as ItemRow[] | null) ?? [])
              .slice()
              .sort((a, b) => a.sort_order - b.sort_order);
            const urgentCount = items.filter((i) => i.urgent).length;
            const pretty = formatRequestId(row.id, row.request_number as number);

            return (
              <Card
                key={row.id}
                title={`${pretty} · ${facility?.name ?? "Unknown facility"}`}
                meta={
                  <>
                    {urgentCount > 0 && <Badge tone="neutral">{urgentCount} urgent</Badge>}
                    <Badge>new</Badge>
                  </>
                }
              >
                <div className="px-4 py-3 text-[13px] text-slate-600 dark:text-slate-300">
                  <p>
                    <span className="font-medium text-slate-800 dark:text-slate-100">
                      {row.requested_by}
                    </span>
                    <span className="text-slate-400">
                      {" "}
                      · {new Date(row.created_at).toLocaleString()}
                    </span>
                  </p>
                  {row.notes && (
                    <p className="mt-1 whitespace-pre-wrap text-slate-500 dark:text-slate-400">
                      {row.notes}
                    </p>
                  )}
                </div>
                <div className="overflow-x-auto border-t border-slate-100 dark:border-slate-800">
                  <table className="w-full text-left text-[13px]">
                    <thead className="text-[11px] uppercase tracking-wide text-slate-400">
                      <tr>
                        <th className="px-4 py-2 font-medium">Item</th>
                        <th className="px-3 py-2 font-medium">Brand</th>
                        <th className="px-3 py-2 font-medium">Qty</th>
                        <th className="px-4 py-2 font-medium">Urgent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.id} className="border-t border-slate-50 dark:border-slate-800/80">
                          <td className="px-4 py-2 text-slate-800 dark:text-slate-100">{item.item}</td>
                          <td className="px-3 py-2 text-slate-500">{item.brand || "—"}</td>
                          <td className="px-3 py-2 tabular-nums">{item.quantity}</td>
                          <td className="px-4 py-2">{item.urgent ? "Yes" : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            );
          })}
        </div>
      </PageShell>
    </main>
  );
}
