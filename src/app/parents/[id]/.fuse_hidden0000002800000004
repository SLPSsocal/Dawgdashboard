import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import ParentForm from "@/components/ParentForm";
import { updateParent } from "../actions";
import { addStoreCredit } from "../billing-actions";

function money(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export default async function ParentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;
  const { error } = await searchParams;

  const supabase = createClient();
  const { data: parent } = await supabase.from("parents").select("*").eq("id", id).maybeSingle();
  if (!parent) notFound();

  const { data: animals } = await supabase
    .from("animals")
    .select("id, name, breed, active")
    .eq("parent_id", id)
    .order("name");

  const [{ data: invoices }, { data: creditTx }] = await Promise.all([
    supabase
      .from("invoices")
      .select(`id, status, total, created_at, paid_at, facilities ( name )`)
      .eq("parent_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("store_credit_transactions")
      .select("amount, facility_id, facilities ( name )")
      .eq("parent_id", id),
  ]);

  type InvoiceRow = {
    id: string;
    status: string;
    total: number;
    created_at: string;
    paid_at: string | null;
    facilities: { name: string } | null;
  };
  const invoiceRows = (invoices as unknown as InvoiceRow[]) ?? [];
  const openBalance = invoiceRows.filter((i) => i.status !== "paid").reduce((sum, i) => sum + Number(i.total), 0);

  type CreditRow = { amount: number; facility_id: string; facilities: { name: string } | null };
  const creditRows = (creditTx as unknown as CreditRow[]) ?? [];
  const creditByFacility = new Map<string, { name: string; balance: number }>();
  for (const c of creditRows) {
    const key = c.facility_id;
    const cur = creditByFacility.get(key) ?? { name: c.facilities?.name ?? "—", balance: 0 };
    cur.balance += Number(c.amount);
    creditByFacility.set(key, cur);
  }
  const totalCredit = Array.from(creditByFacility.values()).reduce((sum, f) => sum + f.balance, 0);

  const updateWithId = updateParent.bind(null, id);

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        <a href="/parents" className="text-sm text-neutral-400 underline dark:text-neutral-500">
          ← Parents
        </a>
        <h1 className="mt-2 text-xl font-semibold">
          {parent.first_name} {parent.last_name}
        </h1>

        <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-4 sm:p-5 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Animals</h2>
            <a
              href={`/animals/new?parent_id=${id}`}
              className="text-sm font-medium text-neutral-900 underline dark:text-neutral-100"
            >
              + Add Animal
            </a>
          </div>
          {(!animals || animals.length === 0) && (
            <p className="mt-2 text-sm text-neutral-400 dark:text-neutral-500">No animals linked yet.</p>
          )}
          <div className="mt-3 flex flex-col gap-2">
            {(animals ?? []).map((a) => (
              <a
                key={a.id}
                href={`/animals/${a.id}`}
                className="rounded-md border border-neutral-200 px-3 py-2 text-sm hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600"
              >
                <span className="font-medium">{a.name}</span>{" "}
                <span className="text-neutral-400 dark:text-neutral-500">{a.breed ?? ""}</span>
              </a>
            ))}
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-4 sm:p-6 dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Billing</h2>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-green-200 bg-green-50/60 px-4 py-3 dark:border-green-900 dark:bg-green-950/20">
              <div className="text-xs uppercase tracking-wide text-green-700 dark:text-green-400">
                Store Credit
              </div>
              <div className="text-xl font-semibold text-green-800 dark:text-green-300">{money(totalCredit)}</div>
              {creditByFacility.size > 1 && (
                <div className="mt-1 text-xs text-green-700/80 dark:text-green-400/80">
                  {Array.from(creditByFacility.values())
                    .map((f) => `${f.name}: ${money(f.balance)}`)
                    .join(" · ")}
                </div>
              )}
            </div>
            <div
              className={`rounded-lg border px-4 py-3 ${
                openBalance > 0
                  ? "border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/20"
                  : "border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900/40"
              }`}
            >
              <div
                className={`text-xs uppercase tracking-wide ${
                  openBalance > 0 ? "text-red-700 dark:text-red-400" : "text-neutral-500 dark:text-neutral-400"
                }`}
              >
                Open Balance
              </div>
              <div
                className={`text-xl font-semibold ${
                  openBalance > 0 ? "text-red-800 dark:text-red-300" : ""
                }`}
              >
                {money(openBalance)}
              </div>
            </div>
          </div>

          <details className="group mt-4 rounded-lg border border-neutral-200 dark:border-neutral-800">
            <summary className="flex cursor-pointer select-none list-none items-center justify-between px-3 py-2 text-sm font-medium">
              + Add / Adjust Store Credit
              <span className="text-neutral-400 transition-transform group-open:rotate-180 dark:text-neutral-500">
                ▾
              </span>
            </summary>
            <form
              action={addStoreCredit}
              className="flex flex-col gap-3 border-t border-neutral-100 p-3 dark:border-neutral-800"
            >
              <input type="hidden" name="parent_id" value={id} />
              <input type="hidden" name="facility_id" value={session!.facilityId} />
              <input type="hidden" name="staff_name" value={session!.staffName} />
              <p className="text-xs text-neutral-400 dark:text-neutral-500">
                Applies to {session!.facilityName}&apos;s balance.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <label>
                  <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Amount</span>
                  <input
                    name="amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    className="mt-1 w-28 rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                  />
                </label>
                <label>
                  <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Direction</span>
                  <select
                    name="direction"
                    defaultValue="add"
                    className="mt-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                  >
                    <option value="add">Add credit</option>
                    <option value="redeem">Redeem credit</option>
                  </select>
                </label>
                <label className="flex-1">
                  <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Reason</span>
                  <input
                    name="reason"
                    placeholder="e.g. Bought $50 grooming package"
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                  />
                </label>
              </div>
              <button
                type="submit"
                className="w-full rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white sm:w-fit dark:bg-neutral-100 dark:text-neutral-900"
              >
                Save
              </button>
            </form>
          </details>

          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
              Invoices
            </h3>
            {invoiceRows.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-400 dark:text-neutral-500">No invoices yet.</p>
            ) : (
              <div className="mt-2 flex flex-col gap-1.5">
                {invoiceRows.map((inv) => (
                  <a
                    key={inv.id}
                    href={`/invoices/${inv.id}`}
                    className="flex items-center justify-between rounded-md border border-neutral-200 px-3 py-2 text-sm hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600"
                  >
                    <span>
                      {new Date(inv.created_at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                      <span className="ml-2 text-neutral-400 dark:text-neutral-500">{inv.facilities?.name ?? "—"}</span>
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
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-4 sm:p-6 dark:border-neutral-800 dark:bg-neutral-900">
          <ParentForm action={updateWithId} defaults={parent} submitLabel="Save Changes" error={error} />
        </div>
      </div>
    </main>
  );
}
