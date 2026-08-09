import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import Link from "next/link";

function money(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

// Full cross-facility invoice history for this parent — the Billing section
// on the parent page already shows this list, but this dedicated page gives
// a fuller, dedicated view reachable via a direct link.
export default async function ParentInvoiceHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;

  const supabase = createClient();
  const { data: parent } = await supabase.from("parents").select("id, first_name, last_name").eq("id", id).maybeSingle();
  if (!parent) notFound();

  const { data: invoiceData } = await supabase
    .from("invoices")
    .select(`id, status, subtotal, tax, total, created_at, paid_at, facilities ( name )`)
    .eq("parent_id", id)
    .order("created_at", { ascending: false });

  type Row = {
    id: string;
    status: string;
    subtotal: number;
    tax: number;
    total: number;
    created_at: string;
    paid_at: string | null;
    facilities: { name: string } | null;
  };
  const invoices = (invoiceData as unknown as Row[]) ?? [];
  const totalBilled = invoices.reduce((sum, i) => sum + Number(i.total), 0);
  const totalOpen = invoices.filter((i) => i.status !== "paid").reduce((sum, i) => sum + Number(i.total), 0);

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <Link href={`/parents/${id}`} className="text-sm text-slate-400 underline dark:text-slate-500">
          ← {parent.first_name} {parent.last_name}
        </Link>
        <h1 className="mt-2 text-xl font-semibold">
          Invoice History — {parent.first_name} {parent.last_name}
        </h1>
        <p className="text-sm text-slate-400 dark:text-slate-500">
          {invoices.length} invoice{invoices.length === 1 ? "" : "s"} · {money(totalBilled)} billed total
          {totalOpen > 0 && ` · ${money(totalOpen)} open`}
        </p>

        <div className="mt-6 flex flex-col gap-2">
          {invoices.map((inv) => (
            <Link
              key={inv.id}
              href={`/invoices/${inv.id}`}
              className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm hover:border-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600"
            >
              <span>
                {new Date(inv.created_at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                <span className="ml-2 text-slate-400 dark:text-slate-500">{inv.facilities?.name ?? "—"}</span>
              </span>
              <span className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    inv.status === "paid"
                      ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                  }`}
                >
                  {inv.status === "paid" ? "Paid" : "Open"}
                </span>
                <span className="font-medium">{money(Number(inv.total))}</span>
              </span>
            </Link>
          ))}
          {invoices.length === 0 && <p className="text-sm text-slate-400 dark:text-slate-500">No invoices yet.</p>}
        </div>
      </div>
    </main>
  );
}
