import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";

function money(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;

  const supabase = createClient();
  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      `id, status, subtotal, tax, total, paid_at, created_at,
       facilities ( name ),
       parents ( id, first_name, last_name ),
       reservations ( id, animals ( id, name ), reservation_types ( name ) )`
    )
    .eq("id", id)
    .maybeSingle();
  if (!invoice) notFound();

  const { data: lineItems } = await supabase
    .from("invoice_line_items")
    .select("id, description, quantity, unit_price, line_total")
    .eq("invoice_id", id)
    .order("id");

  const facility = invoice.facilities as unknown as { name: string } | null;
  const parent = invoice.parents as unknown as { id: string; first_name: string; last_name: string } | null;
  const reservation = invoice.reservations as unknown as {
    id: string;
    animals: { id: string; name: string } | null;
    reservation_types: { name: string } | null;
  } | null;

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        {parent && (
          <a href={`/parents/${parent.id}`} className="text-sm text-slate-400 underline dark:text-slate-500">
            ← {parent.first_name} {parent.last_name}
          </a>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">Invoice</h1>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              invoice.status === "paid"
                ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300"
                : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
            }`}
          >
            {invoice.status === "paid" ? "Paid" : "Open"}
          </span>
        </div>

        <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">
          {facility?.name ?? "—"} ·{" "}
          {new Date(invoice.created_at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
          {invoice.paid_at &&
            ` · Paid ${new Date(invoice.paid_at).toLocaleDateString([], { month: "short", day: "numeric" })}`}
        </p>

        {reservation && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {reservation.animals && (
              <a href={`/animals/${reservation.animals.id}`} className="underline">
                {reservation.animals.name}
              </a>
            )}{" "}
            {reservation.reservation_types?.name && `· ${reservation.reservation_types.name}`}{" "}
            <a href={`/reservations/${reservation.id}`} className="ml-1 text-xs underline text-slate-400 dark:text-slate-500">
              View reservation →
            </a>
          </p>
        )}

        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:text-slate-500">
                <th className="py-2">Description</th>
                <th className="py-2 text-right">Qty</th>
                <th className="py-2 text-right">Unit</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {(lineItems ?? []).map((li) => (
                <tr key={li.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                  <td className="py-2">{li.description}</td>
                  <td className="py-2 text-right">{Number(li.quantity)}</td>
                  <td className="py-2 text-right">{money(Number(li.unit_price))}</td>
                  <td className="py-2 text-right font-medium">{money(Number(li.line_total))}</td>
                </tr>
              ))}
              {(!lineItems || lineItems.length === 0) && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-slate-400 dark:text-slate-500">
                    No line items.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="mt-4 flex flex-col items-end gap-1 border-t border-slate-100 pt-4 text-sm dark:border-slate-800">
            <div className="flex w-40 justify-between">
              <span className="text-slate-400 dark:text-slate-500">Subtotal</span>
              <span>{money(Number(invoice.subtotal))}</span>
            </div>
            <div className="flex w-40 justify-between">
              <span className="text-slate-400 dark:text-slate-500">Tax</span>
              <span>{money(Number(invoice.tax))}</span>
            </div>
            <div className="flex w-40 justify-between text-base font-semibold">
              <span>Total</span>
              <span>{money(Number(invoice.total))}</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
