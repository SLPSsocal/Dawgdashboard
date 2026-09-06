import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { notifyPurchaseRequestCreated } from "@/lib/purchaseRequestNotify";
import { validatePurchaseRequest, type CreatePurchaseRequestBody } from "@/lib/purchaseRequests";
import type { SupabaseClient } from "@supabase/supabase-js";

type RpcResult = {
  id: string;
  request_number: number;
  status: string;
};

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = validatePurchaseRequest(raw);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc("create_purchase_request", {
    p_facility_id: parsed.value.facilityId,
    p_requested_by: parsed.value.requestedBy,
    p_notes: parsed.value.notes ?? null,
    p_items: parsed.value.items.map((item) => ({
      item: item.item,
      brand: item.brand ?? "",
      quantity: item.quantity,
      urgent: Boolean(item.urgent),
    })),
  });

  let result: RpcResult | null = null;
  if (!error && data) {
    result = (typeof data === "string" ? JSON.parse(data) : data) as RpcResult;
  } else if (isMissingRpc(error)) {
    result = await insertPurchaseRequestFallback(supabase, parsed.value);
  }

  if (!result?.id) {
    return NextResponse.json(
      { error: error?.message ?? "Could not save the purchase request." },
      { status: 500 }
    );
  }
  const { data: facility } = await supabase
    .from("facilities")
    .select("name")
    .eq("id", parsed.value.facilityId)
    .maybeSingle();

  await notifyPurchaseRequestCreated({
    id: result.id,
    requestNumber: result.request_number,
    facilityName: facility?.name ?? "Unknown facility",
    payload: parsed.value,
  });

  return NextResponse.json({
    id: result.id,
    requestNumber: result.request_number,
    status: "new",
  });
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  }

  const rawStatus = new URL(req.url).searchParams.get("status") ?? "new";
  const status = ["new", "ordered", "received", "cancelled"].includes(rawStatus)
    ? rawStatus
    : "new";
  const supabase = createClient();
  const { data, error } = await supabase
    .from("purchase_requests")
    .select(
      "id, request_number, facility_id, requested_by, notes, status, created_at, facilities ( name, slug ), purchase_request_items ( id, item, brand, quantity, urgent, sort_order )"
    )
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const requests = (data ?? []).map((row) => {
    const facility = row.facilities as unknown as { name: string; slug: string } | null;
    const items = (
      (row.purchase_request_items as {
        id: string;
        item: string;
        brand: string | null;
        quantity: number;
        urgent: boolean;
        sort_order: number;
      }[]) ?? []
    ).slice().sort((a, b) => a.sort_order - b.sort_order);

    return {
      id: row.id,
      requestNumber: row.request_number,
      facilityId: row.facility_id,
      facilityName: facility?.name ?? "—",
      requestedBy: row.requested_by,
      notes: row.notes,
      status: row.status,
      createdAt: row.created_at,
      items,
    };
  });

  return NextResponse.json({ requests });
}

function isMissingRpc(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return error.code === "PGRST202" || msg.includes("create_purchase_request");
}

async function insertPurchaseRequestFallback(
  supabase: SupabaseClient,
  value: CreatePurchaseRequestBody
): Promise<RpcResult | null> {
  const { data: header, error: headerError } = await supabase
    .from("purchase_requests")
    .insert({
      facility_id: value.facilityId,
      requested_by: value.requestedBy,
      notes: value.notes ?? null,
      status: "new",
    })
    .select("id, request_number")
    .single();
  if (headerError || !header) return null;

  const { error: itemsError } = await supabase.from("purchase_request_items").insert(
    value.items.map((item, index) => ({
      purchase_request_id: header.id,
      item: item.item,
      brand: item.brand ?? null,
      quantity: item.quantity,
      urgent: Boolean(item.urgent),
      sort_order: index,
    }))
  );
  if (itemsError) {
    await supabase.from("purchase_requests").delete().eq("id", header.id);
    return null;
  }

  return { id: header.id, request_number: header.request_number, status: "new" };
}
