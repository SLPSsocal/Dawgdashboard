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
  /** Which dog this line belongs to — needed on household invoices so the
      per-animal grooming price memory lands on the right dog. */
  animalId?: string;
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
    /** Non-card tenders collected now (cash / store_credit / admin_credit). */
    tenders?: { method: string; amount: number }[];
    /** Other household reservations checking out on THIS invoice (one bill
        per family, not per dog — Krishan, Aug 30). */
    additionalReservations?: {
      reservationId: string;
      animalId: string;
      adjustedStartDate?: string;
      adjustedEndDate?: string;
    }[];
  }
) {
  const supabase = createClient();

  // An early/late checkout adjusts the reservation itself, so the calendar,
  // board, and history all agree with what was actually billed.
  async function applyDateAdjustment(resId: string, adjStart?: string, adjEnd?: string) {
    if (!adjStart && !adjEnd) return;
    const { data: resRow } = await supabase
      .from("reservations")
      .select("start_date, end_date")
      .eq("id", resId)
      .maybeSingle();
    if (!resRow) return;
    const withDate = (iso: string, ymd: string) => {
      const d = new Date(iso);
      const [y, m, day] = ymd.split("-").map(Number);
      d.setFullYear(y, m - 1, day);
      return d.toISOString();
    };
    const newStart = adjStart ? withDate(resRow.start_date, adjStart) : resRow.start_date;
    const newEnd = adjEnd ? withDate(resRow.end_date, adjEnd) : resRow.end_date;
    if (newStart !== resRow.start_date || newEnd !== resRow.end_date) {
      await supabase.from("reservations").update({ start_date: newStart, end_date: newEnd }).eq("id", resId);
      await supabase.from("reservation_history").insert({
        reservation_id: resId,
        action: "modified",
        details: `Stay dates corrected at checkout: ${adjStart ?? resRow.start_date.slice(0, 10)} → ${
          adjEnd ?? resRow.end_date.slice(0, 10)
        }`,
        performed_by: "Checkout",
      });
    }
  }

  await applyDateAdjustment(reservationId, payload.adjustedStartDate, payload.adjustedEndDate);
  for (const extra of payload.additionalReservations ?? []) {
    await applyDateAdjustment(extra.reservationId, extra.adjustedStartDate, extra.adjustedEndDate);
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

  // Tender trail for non-card money: without these rows a cash-paid invoice
  // said "paid" with no record of how, so end-of-day cash counts had nothing
  // to reconcile against (QA-039 finding).
  const validTenders = (payload.tenders ?? []).filter(
    (t) => ["cash", "store_credit", "admin_credit"].includes(t.method) && t.amount > 0
  );
  if (validTenders.length > 0) {
    await supabase.from("payments").insert(
      validTenders.map((t) => ({
        facility_id: payload.facilityId,
        parent_id: payload.parentId,
        invoice_id: invoice.id,
        amount: t.amount,
        status: "completed",
        type: t.method,
      }))
    );
  }

  // Remember what was actually charged per animal per grooming service, so
  // next checkout can pre-fill it instead of guessing from the price range.
  const groomingLines = payload.lineItems.filter((li) => li.groomingServiceName);
  for (const li of groomingLines) {
    await supabase.from("grooming_service_prices").upsert(
      {
        facility_id: payload.facilityId,
        // Household invoices tag each grooming line with its dog; untagged
        // lines belong to the primary dog (single-dog checkouts).
        animal_id: li.animalId ?? payload.animalId,
        service_name: li.groomingServiceName!,
        price: li.unitPrice,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "animal_id,service_name" }
    );
  }

  // One invoice can close several reservations (household checkout) — every
  // dog on the ticket checks out together.
  const allReservationIds = [reservationId, ...(payload.additionalReservations ?? []).map((r) => r.reservationId)];
  const { error: resError } = await supabase
    .from("reservations")
    .update({ status: "checked_out", checked_out_at: new Date().toISOString() })
    .in("id", allReservationIds);
  if (resError) throw new Error(resError.message);

  if (allReservationIds.length > 1) {
    await supabase.from("reservation_history").insert(
      allReservationIds.map((rid) => ({
        reservation_id: rid,
        action: "checked_out",
        details: `Household checkout — one invoice for ${allReservationIds.length} dogs (invoice ${invoice.id})`,
        performed_by: "Checkout",
      }))
    );
  }

  revalidatePath("/reservations");
  revalidatePath("/lodging");

  // No redirect here — the caller (CheckoutCalculator) may still need to
  // charge a card against this invoice before navigating away.
  return { invoiceId: invoice.id as string };
}
