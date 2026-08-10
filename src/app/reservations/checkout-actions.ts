"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Classifies what a line actually is, so reports can separate grooming
// revenue from lodging revenue from tips without guessing at description text.
export type LineKind =
  | "base"
  | "discount"
  | "fee"
  | "grooming"
  | "retail"
  | "tip"
  | "adjustment"
  | "other";

export type CheckoutLineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  lineKind?: LineKind;
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
    /** Set when staff corrected the stay window at checkout (YYYY-MM-DD). */
    adjustedStartDate?: string;
    adjustedEndDate?: string;
  }
) {
  const supabase = createClient();

  // An early/late checkout adjusts the reservation itself, so the calendar,
  // board, and history all agree with what was actually billed.
  if (payload.adjustedStartDate || payload.adjustedEndDate) {
    const { data: resRow } = await supabase
      .from("reservations")
      .select("start_date, end_date")
      .eq("id", reservationId)
      .maybeSingle();
    if (resRow) {
      const withDate = (iso: string, ymd: string) => {
        const d = new Date(iso);
        const [y, m, day] = ymd.split("-").map(Number);
        d.setFullYear(y, m - 1, day);
        return d.toISOString();
      };
      const newStart = payload.adjustedStartDate ? withDate(resRow.start_date, payload.adjustedStartDate) : resRow.start_date;
      const newEnd = payload.adjustedEndDate ? withDate(resRow.end_date, payload.adjustedEndDate) : resRow.end_date;
      if (newStart !== resRow.start_date || newEnd !== resRow.end_date) {
        await supabase.from("reservations").update({ start_date: newStart, end_date: newEnd }).eq("id", reservationId);
        await supabase.from("reservation_history").insert({
          reservation_id: reservationId,
          action: "modified",
          details: `Stay dates corrected at checkout: ${payload.adjustedStartDate ?? resRow.start_date.slice(0, 10)} → ${
            payload.adjustedEndDate ?? resRow.end_date.slice(0, 10)
          }`,
          performed_by: "Checkout",
        });
      }
    }
  }
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
        line_kind: li.lineKind ?? (li.retailItemId ? "retail" : "other"),
        grooming_service_name: li.groomingServiceName ?? null,
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
