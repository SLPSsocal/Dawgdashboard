export type PurchaseCatalogItem = {
  id: string;
  name: string;
  brand: string;
  typicalUnit: string;
  packSize: string | null;
  category: string;
  notes: string | null;
  sortOrder: number;
};

export type CatalogLastRequest = {
  quantity: number;
  requestedAt: string;
};

export type CatalogHistoryMap = Record<string, CatalogLastRequest>;

/** Display order for grouped checklist sections. Unknown categories sort last. */
export const CATALOG_CATEGORY_ORDER = [
  "cleaning",
  "laundry",
  "paper goods",
  "dog supplies",
  "dog supplies / grooming",
  "grooming",
  "grooming / medical",
  "medical/first aid",
  "groceries/snacks",
  "office",
  "facilities",
];

export function packHint(item: PurchaseCatalogItem): string {
  const unit = item.typicalUnit.trim();
  const pack = (item.packSize ?? "").trim();
  if (unit && pack) return `${unit} · ${pack}`;
  return unit || pack;
}

export function matchesCatalogSearch(item: PurchaseCatalogItem, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = [
    item.name,
    item.brand,
    item.category,
    item.notes ?? "",
    item.typicalUnit,
    item.packSize ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return needle.split(/\s+/).every((part) => hay.includes(part));
}

export function groupCatalogByCategory(
  items: PurchaseCatalogItem[]
): { category: string; items: PurchaseCatalogItem[] }[] {
  const groups = new Map<string, PurchaseCatalogItem[]>();
  for (const item of items) {
    const cat = item.category.trim() || "other";
    const list = groups.get(cat) ?? [];
    list.push(item);
    groups.set(cat, list);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }
  return [...groups.keys()]
    .sort((a, b) => {
      const ia = CATALOG_CATEGORY_ORDER.indexOf(a);
      const ib = CATALOG_CATEGORY_ORDER.indexOf(b);
      const sa = ia === -1 ? 1000 : ia;
      const sb = ib === -1 ? 1000 : ib;
      if (sa !== sb) return sa - sb;
      return a.localeCompare(b);
    })
    .map((category) => ({ category, items: groups.get(category)! }));
}

export function formatCatalogCategory(category: string): string {
  return category
    .split(" / ")
    .map((part) =>
      part
        .split("/")
        .map((seg) =>
          seg
            .split(" ")
            .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
            .join(" ")
        )
        .join("/")
    )
    .join(" / ");
}

export function isExactPreferred(item: PurchaseCatalogItem): boolean {
  return /no substitutes/i.test(item.notes ?? "");
}

export function formatLastRequestLine(
  last: CatalogLastRequest | undefined,
  facilitySelected: boolean,
  ready = true
): string {
  if (!facilitySelected) return "Last: pick a facility";
  if (!ready) return "Last: …";
  if (!last) return "Last: never";
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(last.requestedAt));
  const qty = Number(last.quantity);
  const qtyLabel = Number.isFinite(qty)
    ? Number.isInteger(qty)
      ? String(qty)
      : String(qty)
    : String(last.quantity);
  return `Last: ${qtyLabel} on ${date}`;
}

export function parseCatalogHistory(raw: unknown): CatalogHistoryMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: CatalogHistoryMap = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const rec = value as Record<string, unknown>;
    const quantity =
      typeof rec.quantity === "number" ? rec.quantity : Number(rec.quantity);
    const requestedAt = String(rec.requestedAt ?? rec.requested_at ?? "");
    if (!Number.isFinite(quantity) || !requestedAt) continue;
    out[id] = { quantity, requestedAt };
  }
  return out;
}

export function mapCatalogRow(row: {
  id: string;
  name: string;
  brand: string;
  typical_unit: string;
  pack_size: string | null;
  category: string;
  notes: string | null;
  sort_order: number;
}): PurchaseCatalogItem {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    typicalUnit: row.typical_unit,
    packSize: row.pack_size,
    category: row.category,
    notes: row.notes,
    sortOrder: row.sort_order,
  };
}
