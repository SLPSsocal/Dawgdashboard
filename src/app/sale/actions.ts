"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SaleLineItem = {
  retailItemId: string;
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
export async function createWalkInSale(payload: {
  facilityId: string;
  parentId: string | null;
  lineItems: SaleLineItem[];
  taxAmount: number;
  markPaid: boolean;
}) {
  const supabase = createClient();
  const subtotal = payload.lineItems.reduce((sum, li) => sum + li.lineTotal, 0);
  const tax = payload.taxAmount;

  const { data: invoice, error } = await supabase
    .from("invoices")
    .insert({
      facility_id: payload.facilityId,
      parent_id: payload.parentId,
      reservation_id: null,
      status: payload.markPaid ? "paid" : "open",
      subtotal,
      tax,
      total: subtotal + tax,
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

  revalidatePath("/retail");
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
