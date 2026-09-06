import type { CreatePurchaseRequestBody } from "@/lib/purchaseRequests";

type NotifyInput = {
  id: string;
  requestNumber: number;
  facilityName: string;
  payload: CreatePurchaseRequestBody;
};

function itemLine(item: CreatePurchaseRequestBody["items"][number]): string {
  const brand = item.brand ? ` (${item.brand})` : "";
  const urgent = item.urgent ? " — urgent" : "";
  return `• ${item.quantity}× ${item.item}${brand}${urgent}`;
}

export function purchaseRequestWebhookBody(input: NotifyInput) {
  const lines = [
    `🛒 New purchase request #${input.requestNumber} at ${input.facilityName}`,
    `Requested by ${input.payload.requestedBy}`,
    ...input.payload.items.map(itemLine),
  ];
  if (input.payload.notes) lines.push(`Notes: ${input.payload.notes}`);

  return {
    text: lines.join("\n"),
    id: input.id,
    request_number: input.requestNumber,
    status: "new" as const,
    facility_id: input.payload.facilityId,
    facility_name: input.facilityName,
    requested_by: input.payload.requestedBy,
    notes: input.payload.notes ?? null,
    items: input.payload.items,
  };
}

// Optional Slack-compatible incoming webhook. Failures are logged and never
// fail the staff submit — purchasing still has the row in Supabase.
export async function notifyPurchaseRequestCreated(input: NotifyInput): Promise<void> {
  const url = process.env.PURCHASE_REQUEST_WEBHOOK_URL?.trim();
  if (!url) return;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(purchaseRequestWebhookBody(input)),
    });
    if (!res.ok) {
      console.error("purchase request webhook failed", res.status, await res.text().catch(() => ""));
    }
  } catch (err) {
    console.error("purchase request webhook error", err);
  }
}
