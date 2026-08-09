import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import Link from "next/link";

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

  // Receipt trail — every Helcim attempt tied to this invoice (approved,
  // declined, or unconfirmed/aborted), so staff can see exactly what Helcim
  // reported without having to log into Helcim's own dashboard for routine
  // checks.
  const { data: paymentRows } = await supabase
    .from("payments")
    .select(
      `id, amount, status, type, helcim_transaction_id, approval_code, failure_reason, created_at,
       payment_methods ( card_brand, last4 )`
    )
    .eq("invoice_id", id)
    .order("created_at", { ascending: false });
  type PaymentRow = {
    id: string;
    amount: number;
    status: string;
    type: string;
    helcim_transaction_id: string | null;
    approval_code: string | null;
    failure_reason: string | null;
    created_at: string;
    payment_methods: { card_brand: string | null; last4: string | null } | null;
  };
  const payments = (paymentRows as unknown as PaymentRow[]) ?? [];

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
          <Link href={`/parents/${parent.id}`} className="text-sm text-slate-400 underline dark:text-slate-500">
            ← {parent.first_name} {parent.last_name}
          </Link>
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
              <Link href={`/animals/${reservation.animals.id}`} className="underline">
                {reservation.animals.name}
              </Link>
            )}{" "}
            {reservation.reservation_types?.name && `· ${reservation.reservation_types.name}`}{" "}
            <Link href={`/reservations/${reservation.id}`} className="ml-1 text-xs underline text-slate-400 dark:text-slate-500">
              View reservation →
            </Link>
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

        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300">Payments</h2>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Every Helcim attempt tied to this invoice, as reported to us — cross-check the transaction ID against
            Helcim&apos;s own dashboard if a status here ever looks off.
          </p>
          {payments.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400 dark:text-slate-500">No payment attempts recorded yet.</p>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              {payments.map((p) => {
                const card = p.payment_methods;
                return (
                  <div key={p.id} className="rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{money(Number(p.amount))}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          p.status === "approved"
                            ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300"
                            : p.status === "declined"
                              ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                        }`}
                      >
                        {p.status === "approved" ? "Approved" : p.status === "declined" ? "Declined" : "Unconfirmed"}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                      {new Date(p.created_at).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                      {card?.card_brand && ` · ${card.card_brand} •••• ${card.last4 ?? "----"}`}
                      {p.type === "verify" && " · Card verification"}
                    </div>
                    {(p.helcim_transaction_id || p.approval_code) && (
                      <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                        {p.helcim_transaction_id && `Txn #${p.helcim_transaction_id}`}
                        {p.helcim_transaction_id && p.approval_code && " · "}
                        {p.approval_code && `Approval ${p.approval_code}`}
                      </div>
                    )}
                    {p.failure_reason && (
                      <div className="mt-1 text-xs text-red-600 dark:text-red-400">{p.failure_reason}</div>
                    )}
                    {p.status === "unconfirmed" && !p.helcim_transaction_id && !p.failure_reason && (
                      <div className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                        The card form closed before we got a result back from Helcim — verify this one manually.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
