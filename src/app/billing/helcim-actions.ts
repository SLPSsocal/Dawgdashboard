"use server";

import { headers } from "next/headers";
import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getHelcimTokenForFacility } from "@/lib/helcim";
import { isQaSession, QA_SIMULATED_TXN_PREFIX } from "@/lib/qaMode";

const HELCIM_INITIALIZE_URL = "https://api.helcim.com/v2/helcim-pay/initialize";
const HELCIM_PURCHASE_URL = "https://api.helcim.com/v2/payment/purchase";

async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "0.0.0.0";
}

// Opens a HelcimPay.js modal purely to capture + tokenize a card. Used both
// for "add a card on file" from the parent page, and "add a new card" at
// checkout.
export async function startCardSession(
  facilityId: string,
  parentId: string,
  purpose: "save_card" | "charge_and_save" | "charge",
  invoiceId: string | null,
  amount: number
) {
  // Never open a live card-capture session for a QA/agent session — that
  // would hit the real merchant account. The agent should exercise payments
  // via the seeded saved card instead, which is simulated in chargeSavedCard.
  if (await isQaSession()) {
    throw new Error(
      "QA mode: live card entry is disabled. Use the seeded saved test card to exercise the payment flow."
    );
  }

  const token = await getHelcimTokenForFacility(facilityId);

  const res = await fetch(HELCIM_INITIALIZE_URL, {
    method: "POST",
    headers: { "api-token": token, "content-type": "application/json" },
    body: JSON.stringify({
      paymentType: purpose === "save_card" ? "verify" : "purchase",
      // Helcim's "verify" transaction type validates a card with a $0
      // authorization, not a real hold — it rejects any nonzero amount here
      // with "amount must be a valid Zero Number". A previous version of
      // this sent $1, which is what was causing "Add Card on File" to fail
      // outright (the initialize call itself got rejected before the modal
      // ever opened).
      amount: purpose === "save_card" ? 0 : amount,
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

// Called when the HelcimPay.js iframe reports ABORTED. Per Helcim's own
// documentation this specifically means the payment was declined (not just
// "the iframe didn't finish") — the eventMessage that comes with it is a
// plain-text reason string like "HelcimPay.js transaction failed - Card
// Declined", which we log verbatim so staff get the real reason instead of
// a generic message.
export async function logAbortedAttempt(
  facilityId: string,
  parentId: string | null,
  invoiceId: string | null,
  amount: number,
  purpose: "save_card" | "charge_and_save" | "charge",
  reason?: string | null
) {
  const supabase = createClient();
  const { error } = await supabase.from("payments").insert({
    facility_id: facilityId,
    parent_id: parentId,
    invoice_id: purpose === "save_card" ? null : invoiceId,
    payment_method_id: null,
    helcim_transaction_id: null,
    approval_code: null,
    failure_reason: reason ?? null,
    type: purpose === "save_card" ? "verify" : "purchase",
    amount,
    status: "declined",
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

  // QA/agent sessions never reach the live Helcim gateway. We still write a
  // payment row and settle the invoice so an automated tester can exercise
  // the whole checkout path (saved card -> paid invoice -> receipt), but the
  // row is stamped QA-SIMULATED- so it can never be mistaken for real money.
  if (await isQaSession()) {
    const simulatedTxn = `${QA_SIMULATED_TXN_PREFIX}${crypto.randomUUID()}`;
    const { error: qaPayError } = await supabase.from("payments").insert({
      facility_id: pm.facility_id,
      parent_id: pm.parent_id,
      invoice_id: invoiceId,
      payment_method_id: pm.id,
      helcim_transaction_id: simulatedTxn,
      approval_code: "QA-SIM",
      type: "purchase",
      amount,
      status: "approved",
    });
    if (qaPayError) throw new Error(qaPayError.message);

    if (invoiceId) {
      await supabase
        .from("invoices")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", invoiceId);
      revalidatePath(`/invoices/${invoiceId}`);
    }
    if (pm.parent_id) revalidatePath(`/parents/${pm.parent_id}`);
    revalidatePath("/reservations");
    return { approved: true, transactionId: simulatedTxn, simulated: true };
  }

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
