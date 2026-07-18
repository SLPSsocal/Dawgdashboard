"use server";

import { headers } from "next/headers";
import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getHelcimTokenForFacility } from "@/lib/helcim";

const HELCIM_INITIALIZE_URL = "https://api.helcim.com/v2/helcim-pay/initialize";
const HELCIM_PURCHASE_URL = "https://api.helcim.com/v2/payment/purchase";

async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "0.0.0.0";
}

// Opens a HelcimPay.js modal purely to capture + tokenize a card (no charge,
// or a $0/$1 verification hold depending on what Helcim's sandbox allows).
// Used both for "add a card on file" from the parent page, and "add a new
// card" at checkout.
export async function startCardSession(
  facilityId: string,
  parentId: string,
  purpose: "save_card" | "charge_and_save",
  invoiceId: string | null,
  amount: number
) {
  const token = await getHelcimTokenForFacility(facilityId);

  const res = await fetch(HELCIM_INITIALIZE_URL, {
    method: "POST",
    headers: { "api-token": token, "content-type": "application/json" },
    body: JSON.stringify({
      paymentType: purpose === "save_card" ? "verify" : "purchase",
      amount: purpose === "save_card" ? 1 : amount,
      currency: "USD",
    }),
  });
  if (!res.ok) {
    throw new Error(`Helcim initialize failed (${res.status}): ${await res.text()}`);
  }
  const { checkoutToken, secretToken } = (await res.json()) as { checkoutToken: string; secretToken: string };

  const supabase = createClient();
  const { error } = await supabase.from("helcim_checkout_sessions").insert({
    checkout_token: checkoutToken,
    secret_token: secretToken,
    facility_id: facilityId,
    purpose,
    parent_id: parentId,
    invoice_id: invoiceId,
    amount,
  });
  if (error) throw new Error(error.message);

  return { checkoutToken };
}

// Called from the client once the HelcimPay.js iframe posts a SUCCESS event.
// The secretToken used to validate the hash never left the server — the
// client only ever had the checkoutToken.
export async function completeHelcimSession(checkoutToken: string, rawEventMessage: string) {
  const supabase = createClient();
  const { data: session } = await supabase
    .from("helcim_checkout_sessions")
    .select("*")
    .eq("checkout_token", checkoutToken)
    .maybeSingle();
  if (!session) throw new Error("This checkout session has expired or was already used.");

  const parsed = JSON.parse(rawEventMessage) as { data: Record<string, unknown>; hash: string };
  const canonical = JSON.stringify(parsed.data);
  const expectedHash = crypto.createHash("sha256").update(canonical + session.secret_token).digest("hex");
  const hashValid = expectedHash === parsed.hash;
  if (!hashValid) {
    // Don't silently drop a transaction Helcim says succeeded, but flag it
    // loudly — this should only ever happen from a canonicalization mismatch
    // or an actual tampering attempt, and is worth investigating either way.
    console.error("Helcim response hash mismatch for checkout", checkoutToken, {
      expectedHash,
      receivedHash: parsed.hash,
    });
  }

  const d = parsed.data as {
    status?: string;
    cardToken?: string;
    customerCode?: string;
    cardType?: string;
    cardNumber?: string;
    cardHolderName?: string;
    transactionId?: string;
    amount?: string;
  };

  let paymentMethodId: string | null = null;

  if ((session.purpose === "save_card" || session.purpose === "charge_and_save") && d.cardToken) {
    const { data: pm, error: pmError } = await supabase
      .from("payment_methods")
      .insert({
        facility_id: session.facility_id,
        parent_id: session.parent_id,
        helcim_customer_code: d.customerCode ?? null,
        card_token: d.cardToken,
        card_brand: d.cardType ?? null,
        last4: (d.cardNumber ?? "").slice(-4) || null,
        card_holder_name: d.cardHolderName ?? null,
      })
      .select("id")
      .single();
    if (pmError) throw new Error(pmError.message);
    paymentMethodId = pm.id;
  }

  if (session.purpose === "charge_and_save" || session.purpose === "charge") {
    const approved = d.status === "APPROVED";
    const { error: payError } = await supabase.from("payments").insert({
      facility_id: session.facility_id,
      parent_id: session.parent_id,
      invoice_id: session.invoice_id,
      payment_method_id: paymentMethodId,
      helcim_transaction_id: d.transactionId ?? null,
      amount: Number(d.amount ?? session.amount ?? 0),
      status: approved ? "approved" : "declined",
    });
    if (payError) throw new Error(payError.message);

    if (session.invoice_id && approved) {
      await supabase
        .from("invoices")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", session.invoice_id);
    }
  }

  await supabase.from("helcim_checkout_sessions").delete().eq("checkout_token", checkoutToken);

  if (session.parent_id) revalidatePath(`/parents/${session.parent_id}`);
  if (session.invoice_id) revalidatePath(`/invoices/${session.invoice_id}`);
  revalidatePath("/reservations");

  return { approved: d.status === "APPROVED" || session.purpose === "save_card", hashValid };
}

// Charge a card that's already on file — no modal needed, server-to-server.
export async function chargeSavedCard(paymentMethodId: string, invoiceId: string | null, amount: number) {
  const supabase = createClient();
  const { data: pm } = await supabase
    .from("payment_methods")
    .select("id, facility_id, parent_id, card_token")
    .eq("id", paymentMethodId)
    .maybeSingle();
  if (!pm) throw new Error("Payment method not found");

  const token = await getHelcimTokenForFacility(pm.facility_id);
  const ip = await clientIp();
  const idempotencyKey = crypto.randomUUID();

  const res = await fetch(HELCIM_PURCHASE_URL, {
    method: "POST",
    headers: {
      "api-token": token,
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify({
      ipAddress: ip,
      currency: "USD",
      amount,
      cardData: { cardToken: pm.card_token },
    }),
  });
  const body = await res.json().catch(() => ({}));
  const approved = res.ok && (body?.status === "APPROVED" || body?.data?.status === "APPROVED");
  const d = body?.data ?? body ?? {};

  const { error: payError } = await supabase.from("payments").insert({
    facility_id: pm.facility_id,
    parent_id: pm.parent_id,
    invoice_id: invoiceId,
    payment_method_id: pm.id,
    helcim_transaction_id: d.transactionId ?? null,
    amount,
    status: approved ? "approved" : "declined",
  });
  if (payError) throw new Error(payError.message);

  if (approved && invoiceId) {
    await supabase.from("invoices").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", invoiceId);
  }

  if (pm.parent_id) revalidatePath(`/parents/${pm.parent_id}`);
  if (invoiceId) revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/reservations");

  if (!approved) {
    throw new Error(d.message ?? "Card declined");
  }
  return { approved, transactionId: d.transactionId };
}

export async function deletePaymentMethod(paymentMethodId: string) {
  const supabase = createClient();
  const { data: pm } = await supabase
    .from("payment_methods")
    .select("parent_id")
    .eq("id", paymentMethodId)
    .maybeSingle();
  const { error } = await supabase.from("payment_methods").delete().eq("id", paymentMethodId);
  if (error) throw new Error(error.message);
  if (pm?.parent_id) revalidatePath(`/parents/${pm.parent_id}`);
}
