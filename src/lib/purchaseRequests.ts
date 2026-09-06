export type PurchaseRequestItemInput = {
  item: string;
  brand?: string;
  quantity: number;
  urgent?: boolean;
};

export type CreatePurchaseRequestBody = {
  facilityId: string;
  requestedBy: string;
  notes?: string;
  items: PurchaseRequestItemInput[];
};

export type CreatedPurchaseRequest = {
  id: string;
  requestNumber: number;
  status: "new";
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Soft warning only — staff can still submit. Matches soda / Coke / Pepsi /
// Sprite / liquid Gatorade (and a few obvious cousins) in item or brand.
const SODA_RE =
  /\b(soda|coke|coca[\s-]?cola|pepsi|sprite|gatorade|mountain\s*dew|dr\.?\s*pepper|fanta|7[\s-]?up)\b/i;

export function looksLikeSoda(text: string): boolean {
  return SODA_RE.test(text);
}

export function sodaWarningLabels(items: PurchaseRequestItemInput[]): string[] {
  const labels: string[] = [];
  for (const row of items) {
    const haystack = `${row.item} ${row.brand ?? ""}`;
    if (!looksLikeSoda(haystack)) continue;
    const label = row.item.trim() || row.brand?.trim();
    if (label && !labels.includes(label)) labels.push(label);
  }
  return labels;
}

export type PurchaseRequestValidation =
  | { ok: true; value: CreatePurchaseRequestBody }
  | { ok: false; error: string };

export function validatePurchaseRequest(raw: unknown): PurchaseRequestValidation {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Invalid request body." };
  }
  const body = raw as Record<string, unknown>;
  const facilityId = String(body.facilityId ?? "").trim();
  const requestedBy = String(body.requestedBy ?? "").trim();
  const notes = String(body.notes ?? "").trim();

  if (!facilityId || !UUID_RE.test(facilityId)) {
    return { ok: false, error: "Facility is required." };
  }
  if (!requestedBy) {
    return { ok: false, error: "Requested by is required." };
  }
  if (requestedBy.length > 120) {
    return { ok: false, error: "Requested by is too long." };
  }
  if (notes.length > 2000) {
    return { ok: false, error: "Notes are too long." };
  }

  if (!Array.isArray(body.items) || body.items.length < 1) {
    return { ok: false, error: "Add at least one item." };
  }

  const items: PurchaseRequestItemInput[] = [];
  for (const [index, row] of body.items.entries()) {
    if (!row || typeof row !== "object") {
      return { ok: false, error: `Item ${index + 1} is invalid.` };
    }
    const rec = row as Record<string, unknown>;
    const item = String(rec.item ?? "").trim();
    const brand = String(rec.brand ?? "").trim();
    const quantity = typeof rec.quantity === "number" ? rec.quantity : Number(rec.quantity);
    const urgent = Boolean(rec.urgent);

    if (!item) {
      return { ok: false, error: `Item ${index + 1} needs a name.` };
    }
    if (item.length > 200) {
      return { ok: false, error: `Item ${index + 1} name is too long.` };
    }
    if (brand.length > 120) {
      return { ok: false, error: `Item ${index + 1} brand is too long.` };
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { ok: false, error: `Item ${index + 1} quantity must be greater than 0.` };
    }
    if (quantity > 100000) {
      return { ok: false, error: `Item ${index + 1} quantity is too large.` };
    }

    items.push({
      item,
      brand: brand || undefined,
      quantity,
      urgent,
    });
  }

  return {
    ok: true,
    value: {
      facilityId,
      requestedBy,
      notes: notes || undefined,
      items,
    },
  };
}

export function formatRequestId(id: string, requestNumber?: number | null): string {
  if (requestNumber && requestNumber > 0) return `#${requestNumber}`;
  return id.slice(0, 8);
}
