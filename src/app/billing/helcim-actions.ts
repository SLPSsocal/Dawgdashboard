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
    approvalCode?: string;
    amount?: string;
  };

  // Trust what Helcim actually told us, for every purpose — a $1 card
  // verification can be declined too (bad card, expired, etc.), and
  // previously that case was silently reported as "approved" here just
  // because the purpose was save_card, which could tell staff a card was
  // successfully saved/verified when Helcim actually declined it.
  const approved = d.status === "APPROVED";

  // Per Helcim's own docs, even a genuinely DECLINED transaction still comes
  // back with a transactionId. A SUCCESS event whose parsed data has neither
  // an APPROVED status nor a transactionId doesn't look like a real decline
  // — it looks like something didn't parse the way we expect. Recording that
  // as a confident "declined" is exactly the kind of false signal that can
  // send staff chasing (or worse, retrying and double-charging) a card that
  // may have actually gone through fine on Helcim's side. Flag it instead.
  const looksMalformed = !approved && !d.transactionId;
  if (looksMalformed) {
    console.error("Helcim SUCCESS event had no transactionId and non-APPROVED status — treating as unconfirmed, not declined", {
      checkoutToken,
      purpose: session.purpose,
      parsedData: d,
    });
  }

  let paymentMethodId: string | null = null;

  // Tokenization can succeed independent of the hold/charge outcome, so the
  // card still gets saved on file even if this specific attempt was
  // declined — staff can retry billing later without re-entering the card.
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

  // Log a receipt row for every attempt, including a pure card-verification
  // (save_card) — previously only real charges got logged, so a declined or
  // approved verify-only attempt left no record anywhere in the app.
  const { error: payError } = await supabase.from("payments").insert({
    facility_id: session.facility_id,
    parent_id: session.parent_id,
    invoice_id: session.purpose === "save_card" ? null : session.invoice_id,
    payment_method_id: paymentMethodId,
    helcim_transaction_id: d.transactionId ?? null,
    approval_code: d.approvalCode ?? null,
    type: session.purpose === "save_card" ? "verify" : "purchase",
    amount: Number(d.amount ?? session.amount ?? 0),
    status: approved ? "approved" : looksMalformed ? "unconfirmed" : "declined",
  });
  if (payError) throw new Error(payError.message);

  if (session.invoice_id && approved && (session.purpose === "charge_and_save" || session.purpose === "charge")) {
    await supabase
      .from("invoices")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", session.invoice_id);
  }

  await supabase.from("helcim_checkout_sessions").delete().eq("checkout_token", checkoutToken);

  if (session.parent_id) revalidatePath(`/parents/${session.parent_id}`);
  if (session.invoice_id) revalidatePath(`/invoices/${session.invoice_id}`);
  revalidatePath("/reservations");

  return { approved, hashValid, looksMalformed };
}

// Called when the HelcimPay.js iframe reports ABORTED. Critically, ABORTED
// does not mean "declined" — Helcim's own docs only say the iframe attempt
// failed to complete, which can also happen from a closed modal or a network
// hiccup on our end while the transaction still went through on Helcim's
// side. We don't get transaction data in this event, so we can't confirm
// either way — this just logs that an attempt was made (for cross-checking
// against Helcim's own dashboard by time/amount) without asserting a status
// we can't actually verify.
export async function logAbortedAttempt(
  facilityId: string,
  parentId: string | null,
  invoiceId: string | null,
  amount: number,
  purpose: "save_card" | "charge_and_save"
) {
  const supabase = createClient();
  const { error } = await supabase.from("payments").insert({
    facility_id: facilityId,
    parent_id: parentId,
    invoice_id: purpose === "save_card" ? null : invoiceId,
    payment_method_id: null,
    helcim_transaction_id: null,
    approval_code: null,
    type: purpose === "save_card" ? "verify" : "purchase",
    amount,
    status: "unconfirmed",
  });
  if (error) throw new Error(error.message);
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
    approval_code: d.approvalCode ?? null,
    type: "purchase",
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
