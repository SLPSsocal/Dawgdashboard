"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type CheckoutLineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  groomingServiceName?: string;
  retailItemId?: string;
  taxable?: boolean;
};

export async function completeCheckout(
  reservationId: string,
  payload: {
    facilityId: string;
    parentId: string | null;
    animalId: string;
    lineItems: CheckoutLineItem[];
    markPaid: boolean;
    taxAmount?: number;
  }
) {
  const supabase = createClient();
  const subtotal = payload.lineItems.reduce((sum, li) => sum + li.lineTotal, 0);
  const tax = payload.taxAmount ?? 0;

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      facility_id: payload.facilityId,
      parent_id: payload.parentId,
      reservation_id: reservationId,
      status: payload.markPaid ? "paid" : "open",
      subtotal,
      tax,
      total: subtotal + tax,
      paid_at: payload.markPaid ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (invoiceError || !invoice) {
    throw new Error(invoiceError?.message ?? "Failed to create invoice");
  }

  if (payload.lineItems.length > 0) {
    const { error: lineError } = await supabase.from("invoice_line_items").insert(
      payload.lineItems.map((li) => ({
        invoice_id: invoice.id,
        description: li.description,
        quantity: li.quantity,
        unit_price: li.unitPrice,
        line_total: li.lineTotal,
        retail_item_id: li.retailItemId ?? null,
      }))
    );
    if (lineError) throw new Error(lineError.message);
  }

  // Remember what was actually charged per animal per grooming service, so
  // next checkout can pre-fill it instead of guessing from the price range.
  const groomingLines = payload.lineItems.filter((li) => li.groomingServiceName);
  for (const li of groomingLines) {
    await supabase.from("grooming_service_prices").upsert(
      {
        facility_id: payload.facilityId,
        animal_id: payload.animalId,
        service_name: li.groomingServiceName!,
        price: li.unitPrice,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "animal_id,service_name" }
    );
  }

  const { error: resError } = await supabase
    .from("reservations")
    .update({ status: "checked_out", checked_out_at: new Date().toISOString() })
    .eq("id", reservationId);
  if (resError) throw new Error(resError.message);

  revalidatePath("/reservations");
  revalidatePath("/lodging");

  // No redirect here — the caller (CheckoutCalculator) may still need to
  // charge a card against this invoice before navigating away.
  return { invoiceId: invoice.id as string };
}
