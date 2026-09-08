import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isPurchaseRequestUnlocked } from "@/lib/purchaseRequestGate";
import { parseCatalogHistory, type CatalogHistoryMap } from "@/lib/purchaseCatalog";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  if (!(await isPurchaseRequestUnlocked())) {
    return NextResponse.json({ error: "PIN required." }, { status: 401 });
  }

  const facilityId = new URL(req.url).searchParams.get("facilityId")?.trim() ?? "";
  if (!facilityId || !UUID_RE.test(facilityId)) {
    return NextResponse.json({ error: "Facility is required." }, { status: 400 });
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc("purchase_catalog_last_requests", {
    p_facility_id: facilityId,
  });

  if (!error) {
    const parsed = typeof data === "string" ? JSON.parse(data) : data;
    return NextResponse.json({ history: parseCatalogHistory(parsed) });
  }

  if (!isMissingRpc(error)) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const history = await historyFallback(supabase, facilityId);
  return NextResponse.json({ history });
}

function isMissingRpc(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return error.code === "PGRST202" || msg.includes("purchase_catalog_last_requests");
}

async function historyFallback(
  supabase: ReturnType<typeof createClient>,
  facilityId: string
): Promise<CatalogHistoryMap> {
  const { data, error } = await supabase
    .from("purchase_request_items")
    .select("catalog_item_id, item, quantity, purchase_requests!inner(facility_id, created_at)")
    .eq("purchase_requests.facility_id", facilityId)
    .limit(3000);

  if (error || !data) return {};

  const byCatalog = new Map<string, { quantity: number; requestedAt: string }>();
  const byName = new Map<string, { quantity: number; requestedAt: string }>();

  for (const row of data) {
    const parent = row.purchase_requests as unknown as
      | { created_at: string }
      | { created_at: string }[]
      | null;
    const createdAt = Array.isArray(parent) ? parent[0]?.created_at : parent?.created_at;
    if (!createdAt) continue;
    const quantity = Number(row.quantity);
    if (!Number.isFinite(quantity)) continue;
    const entry = { quantity, requestedAt: createdAt };
    if (row.catalog_item_id) {
      const prev = byCatalog.get(row.catalog_item_id);
      if (!prev || createdAt > prev.requestedAt) byCatalog.set(row.catalog_item_id, entry);
    } else {
      const key = String(row.item ?? "")
        .trim()
        .toLowerCase();
      if (!key) continue;
      const prev = byName.get(key);
      if (!prev || createdAt > prev.requestedAt) byName.set(key, entry);
    }
  }

  const { data: catalog } = await supabase
    .from("purchase_catalog_items")
    .select("id, name")
    .eq("active", true);

  const history: CatalogHistoryMap = {};
  for (const item of catalog ?? []) {
    const fromId = byCatalog.get(item.id);
    const fromName = byName.get(item.name.trim().toLowerCase());
    const last =
      !fromId ? fromName : !fromName ? fromId : fromId.requestedAt >= fromName.requestedAt ? fromId : fromName;
    if (last) history[item.id] = last;
  }
  return history;
}
