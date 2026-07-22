"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SaleLineItem = {
  retailItemId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  taxable: boolean;
};

// Standalone retail sale — not tied to a reservation/checkout. Used for
// walk-in customers buying retail items on their own, or a parent picking
// something up outside of a boarding/daycare stay. Logs to the parent's
// account (shows up on their invoice history) only if one was selected;
// otherwise it's a cash-register-style anonymous sale.
//
// Also handles two Gingr-style cart add-ons, both bundled into the SAME
// charge as the rest of the cart rather than creating separate invoices:
// buying store credit (logs a store_credit_transactions row) and paying off
// existing open invoices for this parent (marks those invoices paid). Both
// require a parent to be selected — there's no account to credit or invoice
// to close otherwise.
export async function createWalkInSale(payload: {
  facilityId: string;
  parentId: string | null;
  lineItems: SaleLineItem[];
  taxAmount: number;
  markPaid: boolean;
  storeCreditAmount?: number;
  payoffInvoiceIds?: string[];
  staffName?: string | null;
}) {
  const supabase = createClient();
  const subtotal = payload.lineItems.reduce((sum, li) => sum + li.lineTotal, 0);
  const tax = payload.taxAmount;
  const total = subtotal + tax;

  const { data: invoice, error } = await supabase
    .from("invoices")
    .insert({
      facility_id: payload.facilityId,
      parent_id: payload.parentId,
      reservation_id: null,
      status: payload.markPaid ? "paid" : "open",
      subtotal,
      tax,
      total,
      paid_at: payload.markPaid ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (error || !invoice) throw new Error(error?.message ?? "Failed to create sale");

  if (payload.lineItems.length > 0) {
    const { error: lineError } = await supabase.from("invoice_line_items").insert(
      payload.lineItems.map((li) => ({
        invoice_id: invoice.id,
        description: li.description,
        quantity: li.quantity,
        unit_price: li.unitPrice,
        line_total: li.lineTotal,
        retail_item_id: li.retailItemId,
      }))
    );
    if (lineError) throw new Error(lineError.message);
  }

  // Only meaningful with a parent on the sale — both write to that parent's
  // account.
  if (payload.parentId) {
    const creditAmount = payload.storeCreditAmount ?? 0;
    if (creditAmount > 0) {
      const { error: creditError } = await supabase.from("store_credit_transactions").insert({
        parent_id: payload.parentId,
        facility_id: payload.facilityId,
        amount: creditAmount,
        reason: "Purchased at walk-in sale",
        created_by: payload.staffName ?? null,
      });
      if (creditError) throw new Error(creditError.message);
    }

    if (payload.payoffInvoiceIds && payload.payoffInvoiceIds.length > 0) {
      const { error: payoffError } = await supabase
        .from("invoices")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .in("id", payload.payoffInvoiceIds)
        .eq("parent_id", payload.parentId);
      if (payoffError) throw new Error(payoffError.message);
    }
  }

  revalidatePath("/retail");
  if (payload.parentId) revalidatePath(`/parents/${payload.parentId}`);
  return { invoiceId: invoice.id as string };
}

export async function getSavedCardsForParent(facilityId: string, parentId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("payment_methods")
    .select("id, card_brand, last4")
    .eq("facility_id", facilityId)
    .eq("parent_id", parentId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

// Open (unpaid) invoices for this parent, at any facility — surfaced so a
// walk-in sale can also collect payment toward an old balance in the same
// transaction, same idea as Gingr's "Amount to pay off" cart field.
export async function getOpenInvoicesForParent(parentId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("invoices")
    .select("id, total, created_at, facilities ( name )")
    .eq("parent_id", parentId)
    .neq("status", "paid")
    .order("created_at", { ascending: true });
  type Row = { id: string; total: number; created_at: string; facilities: { name: string } | null };
  return ((data as unknown as Row[]) ?? []).map((r) => ({
    id: r.id,
    total: Number(r.total),
    createdAt: r.created_at,
    facilityName: r.facilities?.name ?? "—",
  }));
}
