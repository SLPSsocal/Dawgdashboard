import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Shared reporting layer for the cross-location admin area.
//
// Everything here is derived from invoices/invoice_line_items rather than a
// separate reporting table, so a report can never drift from what was actually
// charged. The one thing that IS stored is the admin's manual split of a tip
// on a mixed grooming+boarding ticket (tip_allocations), because that's a
// judgement call the data can't infer.
// ---------------------------------------------------------------------------

export type Facility = { id: string; name: string; slug: string };

export type TipRow = {
  lineItemId: string;
  invoiceId: string;
  facilityId: string;
  facilityName: string;
  paidAt: string | null;
  createdAt: string;
  tipAmount: number;
  animalId: string | null;
  animalName: string | null;
  parentName: string | null;
  reservationId: string | null;
  reservationCategory: string | null;
  /** Groomer scheduled on the reservation, if any. */
  specialistId: string | null;
  specialistName: string | null;
  groomingRevenue: number;
  lodgingRevenue: number;
  /** Ticket contained BOTH grooming and boarding/daycare — needs a manual split. */
  isMixed: boolean;
  /** Saved admin split, if one has been entered. */
  allocation: {
    specialistId: string | null;
    groomerAmount: number;
    houseAmount: number;
    allocatedBy: string | null;
  } | null;
  /** What the report will count if no manual split exists. */
  effectiveGroomerAmount: number;
  effectiveHouseAmount: number;
  effectiveSpecialistId: string | null;
};

export async function getFacilities(): Promise<Facility[]> {
  const supabase = createClient();
  const { data } = await supabase.from("facilities").select("id, name, slug").order("name");
  return (data as Facility[]) ?? [];
}

/**
 * Invoices are dated by paid_at when settled, falling back to created_at for
 * open ones — so a period report reflects when money actually landed.
 */
function invoiceDate(inv: { paid_at: string | null; created_at: string }): string {
  return inv.paid_at ?? inv.created_at;
}

type RawInvoice = {
  id: string;
  facility_id: string;
  paid_at: string | null;
  created_at: string;
  reservation_id: string | null;
};

async function loadInvoicesInRange(from: string, to: string, facilityId: string | null) {
  const supabase = createClient();
  // Widen the fetch window to cover both date columns, then filter precisely
  // in JS against whichever date actually applies to each invoice.
  let q = supabase
    .from("invoices")
    .select("id, facility_id, paid_at, created_at, reservation_id")
    .lte("created_at", `${to}T23:59:59.999Z`);
  if (facilityId) q = q.eq("facility_id", facilityId);
  const { data } = await q;

  return ((data as RawInvoice[]) ?? []).filter((inv) => {
    const d = invoiceDate(inv).slice(0, 10);
    return d >= from && d <= to;
  });
}

/**
 * Every tip line item in the window, enriched with the animal/groomer it
 * belongs to and whether the surrounding ticket mixed grooming with lodging.
 */
export async function getTipRows(
  from: string,
  to: string,
  facilityId: string | null
): Promise<TipRow[]> {
  const supabase = createClient();
  const invoices = await loadInvoicesInRange(from, to, facilityId);
  if (invoices.length === 0) return [];

  const invoiceIds = invoices.map((i) => i.id);
  const [{ data: lines }, facilities] = await Promise.all([
    supabase
      .from("invoice_line_items")
      .select("id, invoice_id, description, line_total, line_kind")
      .in("invoice_id", invoiceIds),
    getFacilities(),
  ]);

  type Line = {
    id: string;
    invoice_id: string;
    description: string;
    line_total: number;
    line_kind: string | null;
  };
  const allLines = (lines as Line[]) ?? [];

  // A row written before line_kind existed still has to be classified.
  const kindOf = (l: Line): string => {
    if (l.line_kind) return l.line_kind;
    if (/^tip/i.test(l.description)) return "tip";
    return "other";
  };

  const linesByInvoice = new Map<string, Line[]>();
  for (const l of allLines) {
    const arr = linesByInvoice.get(l.invoice_id) ?? [];
    arr.push(l);
    linesByInvoice.set(l.invoice_id, arr);
  }

  const tipLines = allLines.filter((l) => kindOf(l) === "tip" && Number(l.line_total) !== 0);
  if (tipLines.length === 0) return [];

  const reservationIds = invoices.map((i) => i.reservation_id).filter((v): v is string => !!v);

  const [{ data: reservations }, { data: allocations }] = await Promise.all([
    reservationIds.length
      ? supabase
          .from("reservations")
          .select(
            `id, specialist_id, animal_id,
             reservation_types ( category ),
             animals ( id, name, parents ( first_name, last_name ) )`
          )
          .in("id", reservationIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from("tip_allocations")
      .select("invoice_line_item_id, specialist_id, groomer_amount, house_amount, allocated_by")
      .in(
        "invoice_line_item_id",
        tipLines.map((t) => t.id)
      ),
  ]);

  type Res = {
    id: string;
    specialist_id: string | null;
    animal_id: string | null;
    reservation_types: { category: string } | null;
    animals: { id: string; name: string; parents: { first_name: string; last_name: string } | null } | null;
  };
  const resById = new Map<string, Res>();
  for (const r of ((reservations as unknown as Res[]) ?? [])) resById.set(r.id, r);

  const specialistIds = Array.from(
    new Set([
      ...((reservations as unknown as Res[]) ?? []).map((r) => r.specialist_id),
      ...((allocations as { specialist_id: string | null }[]) ?? []).map((a) => a.specialist_id),
    ])
  ).filter((v): v is string => !!v);

  const { data: staffRows } = specialistIds.length
    ? await supabase.from("staff").select("id, full_name").in("id", specialistIds)
    : { data: [] };
  const staffById = new Map<string, string>();
  for (const s of ((staffRows as { id: string; full_name: string }[]) ?? [])) {
    staffById.set(s.id, s.full_name);
  }

  const allocByLine = new Map<
    string,
    { specialist_id: string | null; groomer_amount: number; house_amount: number; allocated_by: string | null }
  >();
  for (const a of ((allocations as {
    invoice_line_item_id: string;
    specialist_id: string | null;
    groomer_amount: number;
    house_amount: number;
    allocated_by: string | null;
  }[]) ?? [])) {
    allocByLine.set(a.invoice_line_item_id, a);
  }

  const invById = new Map(invoices.map((i) => [i.id, i]));
  const facilityName = new Map(facilities.map((f) => [f.id, f.name]));

  return tipLines.map((tip): TipRow => {
    const inv = invById.get(tip.invoice_id)!;
    const res = inv.reservation_id ? resById.get(inv.reservation_id) ?? null : null;
    const siblings = linesByInvoice.get(tip.invoice_id) ?? [];

    const groomingRevenue = siblings
      .filter((l) => kindOf(l) === "grooming")
      .reduce((s, l) => s + Number(l.line_total), 0);
    // Lodging = the stay itself plus any add-on fees, but only when the
    // reservation is actually a boarding/daycare stay. On a pure grooming
    // appointment the base line IS the groom, and counting it as lodging
    // would wrongly make every grooming tip look "mixed".
    const category = res?.reservation_types?.category ?? null;
    const isStay = category === "boarding" || category === "daycare";
    const lodgingRevenue = isStay
      ? siblings
          .filter((l) => ["base", "fee"].includes(kindOf(l)))
          .reduce((s, l) => s + Number(l.line_total), 0)
      : 0;

    const isMixed = groomingRevenue > 0 && lodgingRevenue > 0;
    const tipAmount = Number(tip.line_total);
    const alloc = allocByLine.get(tip.id) ?? null;

    // Defaults when the admin hasn't split it by hand:
    //  - pure grooming ticket  -> all to the groomer
    //  - anything else         -> all to the House pool
    //  - mixed                 -> left to the House pool until allocated, and
    //    surfaced in the report's "needs allocation" bucket so it's obvious.
    let effGroomer = 0;
    let effHouse = tipAmount;
    let effSpecialist: string | null = null;
    if (alloc) {
      effGroomer = Number(alloc.groomer_amount);
      effHouse = Number(alloc.house_amount);
      effSpecialist = alloc.specialist_id ?? res?.specialist_id ?? null;
    } else if (groomingRevenue > 0 && !isMixed) {
      effGroomer = tipAmount;
      effHouse = 0;
      effSpecialist = res?.specialist_id ?? null;
    }

    const parent = res?.animals?.parents ?? null;

    return {
      lineItemId: tip.id,
      invoiceId: tip.invoice_id,
      facilityId: inv.facility_id,
      facilityName: facilityName.get(inv.facility_id) ?? "—",
      paidAt: inv.paid_at,
      createdAt: inv.created_at,
      tipAmount,
      animalId: res?.animals?.id ?? null,
      animalName: res?.animals?.name ?? null,
      parentName: parent ? `${parent.first_name} ${parent.last_name}` : null,
      reservationId: inv.reservation_id,
      reservationCategory: category,
      specialistId: res?.specialist_id ?? null,
      specialistName: res?.specialist_id ? staffById.get(res.specialist_id) ?? null : null,
      groomingRevenue,
      lodgingRevenue,
      isMixed,
      allocation: alloc
        ? {
            specialistId: alloc.specialist_id,
            groomerAmount: Number(alloc.groomer_amount),
            houseAmount: Number(alloc.house_amount),
            allocatedBy: alloc.allocated_by,
          }
        : null,
      effectiveGroomerAmount: effGroomer,
      effectiveHouseAmount: effHouse,
      effectiveSpecialistId: effSpecialist,
    };
  });
}

export type SpecialistTipTotal = {
  specialistId: string | null;
  name: string;
  tipTotal: number;
  ticketCount: number;
};

/** Rolls tip rows up per groomer, with unassigned amounts in a House pool. */
export function summarizeTipsBySpecialist(
  rows: TipRow[],
  staffNames: Map<string, string>
): { specialists: SpecialistTipTotal[]; house: SpecialistTipTotal; needsAllocation: TipRow[] } {
  const bySpecialist = new Map<string, SpecialistTipTotal>();
  let houseTotal = 0;
  let houseTickets = 0;

  for (const r of rows) {
    if (r.effectiveGroomerAmount > 0) {
      const key = r.effectiveSpecialistId ?? "__unknown__";
      const existing = bySpecialist.get(key) ?? {
        specialistId: r.effectiveSpecialistId,
        name: r.effectiveSpecialistId
          ? staffNames.get(r.effectiveSpecialistId) ?? "Unknown groomer"
          : "Groomer not recorded",
        tipTotal: 0,
        ticketCount: 0,
      };
      existing.tipTotal += r.effectiveGroomerAmount;
      existing.ticketCount += 1;
      bySpecialist.set(key, existing);
    }
    if (r.effectiveHouseAmount > 0) {
      houseTotal += r.effectiveHouseAmount;
      houseTickets += 1;
    }
  }

  return {
    specialists: Array.from(bySpecialist.values()).sort((a, b) => b.tipTotal - a.tipTotal),
    house: {
      specialistId: null,
      name: "House / General Staff",
      tipTotal: houseTotal,
      ticketCount: houseTickets,
    },
    needsAllocation: rows.filter((r) => r.isMixed && !r.allocation),
  };
}

export type RevenueBreakdown = {
  facilityId: string;
  facilityName: string;
  boarding: number;
  daycare: number;
  grooming: number;
  retail: number;
  fees: number;
  discounts: number;
  tips: number;
  other: number;
  total: number;
};

/** Revenue split by what was actually sold, per facility, for the window. */
export async function getRevenueByServiceType(
  from: string,
  to: string,
  facilityId: string | null
): Promise<RevenueBreakdown[]> {
  const supabase = createClient();
  const invoices = await loadInvoicesInRange(from, to, facilityId);
  const facilities = await getFacilities();
  if (invoices.length === 0) return [];

  const { data: lines } = await supabase
    .from("invoice_line_items")
    .select("invoice_id, description, line_total, line_kind")
    .in(
      "invoice_id",
      invoices.map((i) => i.id)
    );

  const reservationIds = invoices.map((i) => i.reservation_id).filter((v): v is string => !!v);
  const { data: reservations } = reservationIds.length
    ? await supabase
        .from("reservations")
        .select("id, reservation_types ( category )")
        .in("id", reservationIds)
    : { data: [] };

  type Res = { id: string; reservation_types: { category: string } | null };
  const catByRes = new Map<string, string | null>();
  for (const r of ((reservations as unknown as Res[]) ?? [])) {
    catByRes.set(r.id, r.reservation_types?.category ?? null);
  }
  const invById = new Map(invoices.map((i) => [i.id, i]));

  const acc = new Map<string, RevenueBreakdown>();
  const blank = (fid: string): RevenueBreakdown => ({
    facilityId: fid,
    facilityName: facilities.find((f) => f.id === fid)?.name ?? "—",
    boarding: 0,
    daycare: 0,
    grooming: 0,
    retail: 0,
    fees: 0,
    discounts: 0,
    tips: 0,
    other: 0,
    total: 0,
  });

  for (const l of ((lines as {
    invoice_id: string;
    description: string;
    line_total: number;
    line_kind: string | null;
  }[]) ?? [])) {
    const inv = invById.get(l.invoice_id);
    if (!inv) continue;
    const row = acc.get(inv.facility_id) ?? blank(inv.facility_id);
    const amt = Number(l.line_total);
    const kind = l.line_kind ?? (/^tip/i.test(l.description) ? "tip" : "other");
    const cat = inv.reservation_id ? catByRes.get(inv.reservation_id) ?? null : null;

    if (kind === "grooming") row.grooming += amt;
    else if (kind === "retail") row.retail += amt;
    else if (kind === "tip") row.tips += amt;
    else if (kind === "fee") row.fees += amt;
    else if (kind === "discount") row.discounts += amt;
    else if (kind === "base") {
      if (cat === "boarding") row.boarding += amt;
      else if (cat === "daycare") row.daycare += amt;
      else if (cat === "grooming") row.grooming += amt;
      else row.other += amt;
    } else row.other += amt;

    row.total += amt;
    acc.set(inv.facility_id, row);
  }

  return Array.from(acc.values()).sort((a, b) => a.facilityName.localeCompare(b.facilityName));
}

// ---------------------------------------------------------------------------
// Referral-source ROI: which channel (Yelp / Google / Facebook / word of
// mouth…) brings in new customers, and what those customers are worth.
// "New customers" = parents CREATED in the window; revenue = their invoices,
// both inside the window and lifetime-to-date, so monthly ad spend can be
// compared against what the channel actually produced.
// ---------------------------------------------------------------------------
export type ReferralReportRow = {
  source: string;
  newCustomers: number;
  revenueInPeriod: number;
  revenueToDate: number;
  avgToDate: number;
};

export async function getReferralReport(
  from: string,
  to: string,
  facilityId: string | null
): Promise<{ rows: ReferralReportRow[]; totalNew: number }> {
  const supabase = createClient();
  const { data: parents } = await supabase
    .from("parents")
    .select("id, referral_source, created_at")
    .gte("created_at", `${from}T00:00:00`)
    .lte("created_at", `${to}T23:59:59`);

  const byParent = new Map<string, string>();
  for (const p of parents ?? []) {
    byParent.set(p.id, (p.referral_source ?? "").trim() || "(not recorded)");
  }
  if (byParent.size === 0) return { rows: [], totalNew: 0 };

  // All invoices ever for these new customers (facility-filtered when asked) —
  // one query, split into in-period vs to-date in memory.
  let invQuery = supabase
    .from("invoices")
    .select("parent_id, total, created_at, paid_at, status")
    .in("parent_id", Array.from(byParent.keys()));
  if (facilityId) invQuery = invQuery.eq("facility_id", facilityId);
  const { data: invoices } = await invQuery;

  const agg = new Map<string, ReferralReportRow>();
  const rowFor = (source: string) => {
    let r = agg.get(source);
    if (!r) {
      r = { source, newCustomers: 0, revenueInPeriod: 0, revenueToDate: 0, avgToDate: 0 };
      agg.set(source, r);
    }
    return r;
  };
  for (const source of byParent.values()) rowFor(source).newCustomers += 1;

  for (const inv of invoices ?? []) {
    const source = byParent.get(inv.parent_id as string);
    if (!source) continue;
    const total = Number(inv.total ?? 0);
    const when = String(inv.paid_at ?? inv.created_at).slice(0, 10);
    const r = rowFor(source);
    r.revenueToDate += total;
    if (when >= from && when <= to) r.revenueInPeriod += total;
  }

  const rows = Array.from(agg.values()).map((r) => ({
    ...r,
    avgToDate: r.newCustomers > 0 ? r.revenueToDate / r.newCustomers : 0,
  }));
  rows.sort((a, b) => b.revenueToDate - a.revenueToDate || b.newCustomers - a.newCustomers);
  return { rows, totalNew: byParent.size };
}
