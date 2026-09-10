"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { chargeSavedCard } from "@/app/billing/helcim-actions";

// Advance payments / deposits on a reservation (Gelica, Sep 4; rules from
// Krishan, Sep 10):
//   • Collected BEFORE checkout, from the reservation page. Suggested amount
//     is 50% of the estimated stay, but staff can type any amount.
//   • Tender: saved card, new card (HelcimPay modal), cash, or the parent's
//     store credit.
//   • Each deposit is its own small invoice (invoices.kind = 'deposit') so
//     the money has a receipt + payment row exactly like any other charge,
//     and Helcim card flows can settle it the normal way.
//   • At checkout the paid deposits for the dogs on the ticket are applied
//     as a "Prepaid deposit" credit; anything left over rolls into the
//     parent's store credit. Applied deposit invoices become status
//     'applied' so they can't be used twice.
//   • If the reservation is cancelled, its paid deposits roll into store
//     credit (status 'credited') — see cancelReservation.

export type DepositTender = "cash" | "store_credit" | "new_card" | `card:${string}`;

export type PaidDeposit = {
  invoiceId: string;
  reservationId: string;
  amount: number;
  paidAt: string | null;
  method: string; // cash | store_credit | card | purchase
  createdAt: string;
};

export async function getStoreCreditBalance(parentId: string, facilityId: string): Promise<number> {
  const supabase = createClient();
  const { data } = await supabase
    .from("store_credit_transactions")
    .select("amount")
    .eq("parent_id", parentId)
    .eq("facility_id", facilityId);
  return Math.round(((data ?? []).reduce((s, r) => s + Number(r.amount), 0)) * 100) / 100;
}

/** Paid, not-yet-applied deposits for the given reservations. */
export async function getPaidDeposits(reservationIds: string[]): Promise<PaidDeposit[]> {
  if (reservationIds.length === 0) return [];
  const supabase = createClient();
  const { data } = await supabase
    .from("invoices")
    .select("id, reservation_id, total, paid_at, created_at, payments ( type, status )")
    .eq("kind", "deposit")
    .eq("status", "paid")
    .in("reservation_id", reservationIds)
    .order("created_at", { ascending: true });
  type Row = {
    id: string;
    reservation_id: string;
    total: number;
    paid_at: string | null;
    created_at: string;
    payments: { type: string; status: string }[] | null;
  };
  return ((data as unknown as Row[]) ?? []).map((r) => {
    const ok = (r.payments ?? []).find((p) => p.status === "approved" || p.status === "completed");
    return {
      invoiceId: r.id,
      reservationId: r.reservation_id,
      amount: Number(r.total),
      paidAt: r.paid_at,
      method: ok?.type === "purchase" ? "card" : ok?.type ?? "—",
      createdAt: r.created_at,
    };
  });
}

async function logHistory(reservationId: string, action: string, details: string, performedBy: string | null) {
  const supabase = createClient();
  const { error } = await supabase
    .from("reservation_history")
    .insert({ reservation_id: reservationId, action, details, performed_by: performedBy });
  if (error) console.error("Failed to log deposit history", reservationId, error.message);
}

// Deposit invoices that never got paid (card declined / modal closed) are
// noise — clear them before opening a new one for the same reservation.
async function sweepOpenDeposits(reservationId: string) {
  const supabase = createClient();
  const { data: open } = await supabase
    .from("invoices")
    .select("id")
    .eq("kind", "deposit")
    .eq("status", "open")
    .eq("reservation_id", reservationId);
  const ids = (open ?? []).map((r) => r.id);
  if (ids.length === 0) return;
  // Keep the payment attempts (declines are worth knowing about) but detach
  // them from the invoice we're removing.
  await supabase.from("payments").update({ invoice_id: null }).in("invoice_id", ids);
  await supabase.from("invoice_line_items").delete().in("invoice_id", ids);
  await supabase.from("invoices").delete().in("id", ids);
}

/**
 * Collect a deposit. For cash / store credit / saved card the money moves
 * here. For a new card this only opens the invoice — the client then runs
 * the HelcimPay modal against it and completeHelcimSession marks it paid.
 */
export async function collectDeposit(payload: {
  reservationId: string;
  facilityId: string;
  parentId: string;
  animalName: string;
  amount: number;
  tender: DepositTender;
  staffName: string | null;
}): Promise<{ invoiceId: string; paid: boolean }> {
  const supabase = createClient();
  const amount = Math.round(Number(payload.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a deposit amount greater than $0.");

  const { data: res } = await supabase
    .from("reservations")
    .select("id, status, start_date, end_date")
    .eq("id", payload.reservationId)
    .maybeSingle();
  if (!res) throw new Error("Reservation not found");
  if (res.status === "cancelled" || res.status === "checked_out") {
    throw new Error("Deposits can only be taken on an upcoming or in-progress stay.");
  }

  if (payload.tender === "store_credit") {
    const balance = await getStoreCreditBalance(payload.parentId, payload.facilityId);
    if (balance + 0.005 < amount) {
      throw new Error(`Not enough store credit — balance is $${balance.toFixed(2)}.`);
    }
  }

  await sweepOpenDeposits(payload.reservationId);

  const stay = `${res.start_date.slice(0, 10)} → ${res.end_date.slice(0, 10)}`;
  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .insert({
      facility_id: payload.facilityId,
      parent_id: payload.parentId,
      reservation_id: payload.reservationId,
      kind: "deposit",
      status: "open",
      subtotal: amount,
      tax: 0,
      total: amount,
      paid_at: null,
    })
    .select("id")
    .single();
  if (invErr || !invoice) throw new Error(invErr?.message ?? "Could not open deposit invoice");

  await supabase.from("invoice_line_items").insert({
    invoice_id: invoice.id,
    description: `Deposit — ${payload.animalName}, stay ${stay}`,
    quantity: 1,
    unit_price: amount,
    line_total: amount,
    line_kind: "deposit",
  });

  const tenderLabel =
    payload.tender === "cash"
      ? "cash"
      : payload.tender === "store_credit"
        ? "store credit"
        : payload.tender === "new_card"
          ? "card"
          : "card on file";

  if (payload.tender === "cash" || payload.tender === "store_credit") {
    const { error: payErr } = await supabase.from("payments").insert({
      facility_id: payload.facilityId,
      parent_id: payload.parentId,
      invoice_id: invoice.id,
      amount,
      status: "completed",
      type: payload.tender,
    });
    if (payErr) throw new Error(payErr.message);
    if (payload.tender === "store_credit") {
      const { error: scErr } = await supabase.from("store_credit_transactions").insert({
        parent_id: payload.parentId,
        facility_id: payload.facilityId,
        amount: -amount,
        reason: `Deposit on ${payload.animalName}'s stay ${stay}`,
        created_by: payload.staffName,
      });
      if (scErr) throw new Error(scErr.message);
    }
    await supabase
      .from("invoices")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", invoice.id);
    await logHistory(payload.reservationId, "deposit", `Deposit $${amount.toFixed(2)} collected (${tenderLabel})`, payload.staffName);
    revalidatePath(`/reservations/${payload.reservationId}`);
    revalidatePath(`/parents/${payload.parentId}`);
    return { invoiceId: invoice.id as string, paid: true };
  }

  if (payload.tender.startsWith("card:")) {
    // chargeSavedCard writes the payment row, flips the invoice to paid on
    // approval, and throws on a decline (invoice stays open → swept next time).
    await chargeSavedCard(payload.tender.slice(5), invoice.id, amount);
    await logHistory(payload.reservationId, "deposit", `Deposit $${amount.toFixed(2)} charged to card on file`, payload.staffName);
    revalidatePath(`/reservations/${payload.reservationId}`);
    revalidatePath(`/parents/${payload.parentId}`);
    return { invoiceId: invoice.id as string, paid: true };
  }

  // new_card: the caller opens HelcimPay against this invoice.
  return { invoiceId: invoice.id as string, paid: false };
}

/** Called after the HelcimPay modal approves a new-card deposit. */
export async function noteCardDepositPaid(reservationId: string, invoiceId: string, staffName: string | null) {
  const supabase = createClient();
  const { data: inv } = await supabase.from("invoices").select("status, total, parent_id").eq("id", invoiceId).maybeSingle();
  if (inv?.status === "paid") {
    await logHistory(reservationId, "deposit", `Deposit $${Number(inv.total).toFixed(2)} charged to new card`, staffName);
  }
  revalidatePath(`/reservations/${reservationId}`);
  if (inv?.parent_id) revalidatePath(`/parents/${inv.parent_id}`);
}

/** Staff closed the card modal without paying — drop the empty invoice. */
export async function discardOpenDeposit(reservationId: string) {
  await sweepOpenDeposits(reservationId);
  revalidatePath(`/reservations/${reservationId}`);
}

/**
 * Cancellation rule (Krishan, Sep 10): paid deposits roll into the parent's
 * store credit rather than being refunded to the card.
 */
export async function rollDepositsIntoStoreCredit(reservationId: string, performedBy: string | null) {
  const supabase = createClient();
  const { data: deposits } = await supabase
    .from("invoices")
    .select("id, total, parent_id, facility_id")
    .eq("kind", "deposit")
    .eq("status", "paid")
    .eq("reservation_id", reservationId);
  let rolled = 0;
  for (const d of deposits ?? []) {
    if (!d.parent_id) continue;
    const amount = Number(d.total);
    const { error } = await supabase.from("store_credit_transactions").insert({
      parent_id: d.parent_id,
      facility_id: d.facility_id,
      amount,
      reason: "Deposit from cancelled reservation",
      created_by: performedBy,
    });
    if (error) throw new Error(error.message);
    await supabase.from("invoices").update({ status: "credited" }).eq("id", d.id);
    rolled += amount;
  }
  if (rolled > 0) {
    await logHistory(
      reservationId,
      "deposit",
      `Deposit $${rolled.toFixed(2)} moved to store credit (reservation cancelled)`,
      performedBy
    );
    const pid = (deposits ?? []).find((d) => d.parent_id)?.parent_id;
    if (pid) revalidatePath(`/parents/${pid}`);
  }
  return rolled;
}
