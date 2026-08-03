import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import PageQuickActions from "@/components/PageQuickActions";
import ParentForm from "@/components/ParentForm";
import { updateParent } from "../actions";
import { addStoreCredit } from "../billing-actions";
import { deletePaymentMethod } from "@/app/billing/helcim-actions";
import HelcimCardModal from "@/components/HelcimCardModal";
import SendWaiverLink from "@/components/SendWaiverLink";
import { getProfileTagCatalog, getProfileTagsFor } from "@/lib/profileTags";
import ProfileTagEditor from "@/components/ProfileTagEditor";
import ProfileTagBadges from "@/components/ProfileTagBadges";

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
    .select("id, name, breed, active, alert_note")
    .eq("parent_id", id)
    .order("name");

  const [
    { data: invoices },
    { data: creditTx },
    { data: cards },
    { data: activeWaiver },
    { data: signatures },
    { data: referralSources },
    { data: cardAttempts },
    tagCatalog,
    assignedTags,
  ] = await Promise.all([
    supabase
      .from("invoices")
      .select(`id, status, total, created_at, paid_at, facilities ( name )`)
      .eq("parent_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("store_credit_transactions")
      .select("amount, facility_id, facilities ( name )")
      .eq("parent_id", id),
    supabase
      .from("payment_methods")
      .select("id, facility_id, card_brand, last4, card_holder_name, created_at, facilities ( name )")
      .eq("parent_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("waivers")
      .select("id, title")
      .eq("facility_id", session!.facilityId)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("waiver_signatures")
      .select("id, status, signer_name, sent_at, signed_at, token, waivers ( title )")
      .eq("parent_id", id)
      .eq("facility_id", session!.facilityId)
      .order("created_at", { ascending: false }),
    supabase
      .from("referral_sources")
      .select("id, name")
      .eq("facility_id", session!.facilityId)
      .eq("active", true)
      .order("name"),
    // Recent card-verification attempts ("Add Card on File") that didn't
    // result in a saved card — surfaced here so staff see *why* a card
    // didn't appear instead of just a silent absence.
    supabase
      .from("payments")
      .select("id, status, failure_reason, created_at")
      .eq("parent_id", id)
      .eq("type", "verify")
      .neq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(3),
    getProfileTagCatalog("parent"),
    getProfileTagsFor("parent", id),
  ]);

  type CardRow = {
    id: string;
    facility_id: string;
    card_brand: string | null;
    last4: string | null;
    card_holder_name: string | null;
    created_at: string;
    facilities: { name: string } | null;
  };
  const cardRows = (cards as unknown as CardRow[]) ?? [];

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
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <PageQuickActions session={session!} />

        <a href="/parents" className="mt-4 inline-block text-sm text-slate-400 underline dark:text-slate-500">
          ← Parents
        </a>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">
            {parent.first_name} {parent.last_name}
          </h1>
          <ProfileTagBadges tags={assignedTags} />
          <a
            href={`/parents/${id}/reservations`}
            className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium hover:border-slate-500 dark:border-slate-700 dark:hover:border-slate-500"
          >
            📋 Reservation History
          </a>
          <a
            href={`/parents/${id}/invoices`}
            className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium hover:border-slate-500 dark:border-slate-700 dark:hover:border-slate-500"
          >
            🧾 Invoice History
          </a>
          {parent.email_opt_out && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              📧 Email opt-out
            </span>
          )}
          {parent.sms_opt_out && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              📵 SMS opt-out
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-sm">
          {parent.phone && (
            <a href={`tel:${parent.phone}`} className="text-indigo-600 underline dark:text-indigo-400">
              📞 {parent.phone}
            </a>
          )}
          {parent.email && (
            <a href={`mailto:${parent.email}`} className="text-indigo-600 underline dark:text-indigo-400">
              ✉️ {parent.email}
            </a>
          )}
        </div>

        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300">Animals</h2>
            <a
              href={`/animals/new?parent_id=${id}`}
              className="text-sm font-medium text-slate-900 underline dark:text-slate-100"
            >
              + Add Animal
            </a>
          </div>
          {(!animals || animals.length === 0) && (
            <p className="mt-2 text-sm text-slate-400 dark:text-slate-500">No animals linked yet.</p>
          )}
          <div className="mt-3 flex flex-col gap-2">
            {(animals ?? []).map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm hover:border-slate-400 dark:border-slate-800 dark:hover:border-slate-600"
              >
                <a
                  href={`/animals/${a.id}`}
                  className="min-w-0 flex-1 underline decoration-slate-300 hover:decoration-slate-600 dark:decoration-slate-600"
                >
                  <span className="font-medium">{a.name}</span>{" "}
                  {a.alert_note && <span title={`Alert: ${a.alert_note}`}>❗</span>}{" "}
                  <span className="text-slate-400 dark:text-slate-500">{a.breed ?? ""}</span>
                </a>
                <a
                  href={`/reservations/new?animal_id=${a.id}`}
                  className="ml-2 shrink-0 rounded-full border border-slate-300 px-2 py-1 text-xs font-medium hover:border-slate-500 dark:border-slate-700 dark:hover:border-slate-500"
                >
                  📅 Book
                </a>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300">Tags</h2>
          <div className="mt-2">
            <ProfileTagEditor
              targetType="parent"
              targetId={id}
              catalog={tagCatalog}
              assigned={assignedTags}
              staffName={session!.staffName}
            />
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300">Waivers</h2>
          {activeWaiver ? (
            <div className="mt-2 flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
              <span>{activeWaiver.title}</span>
              <SendWaiverLink
                waiverId={activeWaiver.id}
                facilityId={session!.facilityId}
                parentId={id}
                signerName={`${parent.first_name} ${parent.last_name}`}
                phone={parent.phone}
              />
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-400 dark:text-slate-500">
              No active waiver set up for {session!.facilityName} yet —{" "}
              <a href="/waivers" className="underline">
                add one
              </a>
              .
            </p>
          )}
          {(signatures ?? []).length > 0 && (
            <div className="mt-3 flex flex-col gap-1.5">
              {(signatures ?? []).map((s) => {
                const w = s.waivers as unknown as { title: string } | null;
                return (
                  <div key={s.id} className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>{w?.title ?? "Waiver"}</span>
                    <span
                      className={
                        s.status === "signed"
                          ? "font-medium text-green-600 dark:text-green-400"
                          : s.status === "sent"
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-slate-400 dark:text-slate-500"
                      }
                    >
                      {s.status === "signed"
                        ? `Signed ${s.signed_at ? new Date(s.signed_at).toLocaleDateString() : ""}`
                        : s.status === "sent"
                          ? `Sent ${s.sent_at ? new Date(s.sent_at).toLocaleDateString() : ""}`
                          : "Link created, not sent"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300">Billing</h2>

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
                  : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40"
              }`}
            >
              <div
                className={`text-xs uppercase tracking-wide ${
                  openBalance > 0 ? "text-red-700 dark:text-red-400" : "text-slate-500 dark:text-slate-400"
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

          <details className="group mt-4 rounded-lg border border-slate-200 dark:border-slate-800">
            <summary className="flex cursor-pointer select-none list-none items-center justify-between px-3 py-2 text-sm font-medium">
              + Add / Adjust Store Credit
              <span className="text-slate-400 transition-transform group-open:rotate-180 dark:text-slate-500">
                ▾
              </span>
            </summary>
            <form
              action={addStoreCredit}
              className="flex flex-col gap-3 border-t border-slate-100 p-3 dark:border-slate-800"
            >
              <input type="hidden" name="parent_id" value={id} />
              <input type="hidden" name="facility_id" value={session!.facilityId} />
              <input type="hidden" name="staff_name" value={session!.staffName} />
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Applies to {session!.facilityName}&apos;s balance.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <label>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Amount</span>
                  <input
                    name="amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    className="mt-1 w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                <label>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Direction</span>
                  <select
                    name="direction"
                    defaultValue="add"
                    className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="add">Add credit</option>
                    <option value="redeem">Redeem credit</option>
                  </select>
                </label>
                <label className="flex-1">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Reason</span>
                  <input
                    name="reason"
                    placeholder="e.g. Bought $50 grooming package"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
              </div>
              <button
                type="submit"
                className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-medium text-white sm:w-fit dark:bg-slate-100 dark:text-slate-900"
              >
                Save
              </button>
            </form>
          </details>

          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Invoices
            </h3>
            {invoiceRows.length === 0 ? (
              <p className="mt-2 text-sm text-slate-400 dark:text-slate-500">No invoices yet.</p>
            ) : (
              <div className="mt-2 flex flex-col gap-1.5">
                {invoiceRows.map((inv) => (
                  <a
                    key={inv.id}
                    href={`/invoices/${inv.id}`}
                    className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm hover:border-slate-400 dark:border-slate-800 dark:hover:border-slate-600"
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
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Payment Methods
              </h3>
              <HelcimCardModal
                facilityId={session!.facilityId}
                parentId={id}
                purpose="save_card"
                amount={0}
                buttonLabel="+ Add Card on File"
                className="text-xs font-medium text-indigo-600 underline hover:text-indigo-700"
              />
            </div>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Cards are saved securely with Helcim — we only ever store a token, never the card number. A card can
              only be charged through the facility it was added at.
            </p>
            {cardRows.length === 0 ? (
              <p className="mt-2 text-sm text-slate-400 dark:text-slate-500">No cards on file.</p>
            ) : (
              <div className="mt-2 flex flex-col gap-1.5">
                {cardRows.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-800"
                  >
                    <span>
                      💳 {c.card_brand ?? "Card"} •••• {c.last4 ?? "----"}
                      <span className="ml-2 text-slate-400 dark:text-slate-500">{c.facilities?.name ?? "—"}</span>
                    </span>
                    <form action={deletePaymentMethod.bind(null, c.id)}>
                      <button type="submit" className="text-xs text-slate-400 underline hover:text-red-500">
                        Remove
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            )}
            {(cardAttempts ?? []).length > 0 && (
              <div className="mt-3 flex flex-col gap-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  Recent Failed Attempts
                </p>
                {(cardAttempts ?? []).map((a) => (
                  <div
                    key={a.id}
                    className="rounded-md border border-red-200 bg-red-50/60 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-400"
                  >
                    <span className="font-medium">
                      {new Date(a.created_at).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>{" "}
                    — {a.failure_reason ?? "Declined (no reason given)."}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
          <ParentForm
            action={updateWithId}
            defaults={parent}
            submitLabel="Save Changes"
            error={error}
            referralSources={referralSources ?? []}
          />
        </div>
      </div>
    </main>
  );
}
