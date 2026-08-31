import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import CheckoutCalculator from "@/components/CheckoutCalculator";
import { getRetailCatalogForFacility } from "@/lib/retailPricing";
import Link from "next/link";

export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;

  const supabase = createClient();
  const { data: reservation } = await supabase
    .from("reservations")
    .select(
      `*, animals ( id, name, parent_id, gingr_animal_id, parents ( id, first_name, last_name ) ),
       reservation_types ( id, name, base_rate, rate_unit, category )`
    )
    .eq("id", id)
    .maybeSingle();
  if (!reservation) notFound();

  const animal = reservation.animals as unknown as {
    id: string;
    name: string;
    parent_id: string;
    gingr_animal_id: number | string | null;
    parents: { id: string; first_name: string; last_name: string } | null;
  } | null;
  const type = reservation.reservation_types as unknown as {
    id: string;
    name: string;
    base_rate: string;
    rate_unit: string;
    category: string | null;
  } | null;

  // Anchor every price lookup to when the STAY started, not today. A rate
  // hike or a retired discount rule next month must never change what an
  // already-in-progress (or even not-yet-checked-out) reservation is billed —
  // it should always reflect what was actually in effect when the animal
  // checked in.
  const stayDateStr = String(reservation.start_date).slice(0, 10);

  const [{ data: rateHistory }, { data: rules }, { data: groomingItems }, { data: remembered }, { data: savedCardRows }, retailCatalog, { data: facilityRow }] =
    await Promise.all([
      type
        ? supabase
            .from("reservation_type_rates")
            .select("rate, effective_date")
            .eq("reservation_type_id", type.id)
            .lte("effective_date", stayDateStr)
            .order("effective_date", { ascending: false })
            .limit(1)
        : Promise.resolve({ data: null }),
      // ALL of this facility's rules in effect at stay start — filtered per
      // reservation type below, because a household checkout can mix types
      // (one dog boarding, one in daycare) on the same invoice.
      supabase
        .from("pricing_rules")
        .select("id, reservation_type_id, label, rule_type, threshold, method, amount, effective_date, retired_date")
        .eq("facility_id", session!.facilityId)
        .lte("effective_date", stayDateStr)
        .or(`retired_date.is.null,retired_date.gt.${stayDateStr}`),
      supabase.from("grooming_menu_items").select("name, min_price, max_price").eq("facility_id", session!.facilityId).eq("active", true).order("name"),
      animal
        ? supabase.from("grooming_service_prices").select("service_name, price").eq("animal_id", animal.id)
        : Promise.resolve({ data: null }),
      animal?.parents
        ? supabase
            .from("payment_methods")
            .select("id, card_brand, last4")
            .eq("parent_id", animal.parents.id)
            .eq("facility_id", session!.facilityId)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: null }),
      getRetailCatalogForFacility(session!.facilityId),
      supabase.from("facilities").select("tax_rate").eq("id", session!.facilityId).maybeSingle(),
    ]);

  const currentRate = rateHistory && rateHistory.length > 0 ? Number(rateHistory[0].rate) : Number(type?.base_rate ?? 0);
  const taxRate = Number(facilityRow?.tax_rate ?? 0);

  // Per-type rule filtering (a household ticket can mix reservation types).
  const allRules = rules ?? [];
  const rulesFor = (typeId: string | null | undefined) =>
    allRules.filter((r) => !r.reservation_type_id || r.reservation_type_id === typeId);

  // Feeding-log charges: house fresh food / CBD logged during the stay (in
  // this dashboard or the PawFeed tablet app — same table) pre-fill as retail
  // lines so they actually land on the tab instead of relying on memory.
  // Shared with each household dog on a combined invoice, hence the helper.
  const houseFoodItem = retailCatalog.find((r) => r.name.toLowerCase().includes("house food"));
  const cbdItem = retailCatalog.find((r) => r.name.toLowerCase().includes("cbd"));
  const todayYmd = new Date().toISOString().slice(0, 10);

  async function feedingPrefill(petKeys: string[], sinceYmd: string) {
    const { data: feedRows } = petKeys.length
      ? await supabase
          .from("feeding_logs")
          .select("date, meal_time, fresh_food, fresh_food_items")
          .in("pet_id", petKeys)
          .gte("date", sinceYmd)
          .lte("date", todayYmd)
      : { data: [] };
    let houseFoodMeals = 0;
    let cbdCount = 0;
    let topperCount = 0;
    for (const f of feedRows ?? []) {
      if (f.fresh_food) houseFoodMeals++;
      const items = String(f.fresh_food_items ?? "").toLowerCase();
      if (items.includes("cbd")) cbdCount++;
      if (items.includes("topper")) topperCount++;
    }
    const retailRows: { itemId: string; qty: number }[] = [];
    const careParts: string[] = [];
    if (houseFoodMeals > 0) {
      if (houseFoodItem) retailRows.push({ itemId: houseFoodItem.id, qty: houseFoodMeals });
      careParts.push(`house fresh food ×${houseFoodMeals} meal${houseFoodMeals === 1 ? "" : "s"}`);
    }
    if (cbdCount > 0) {
      if (cbdItem) retailRows.push({ itemId: cbdItem.id, qty: cbdCount });
      careParts.push(`CBD ×${cbdCount}`);
    }
    if (topperCount > 0) {
      careParts.push(`topper ×${topperCount} (no retail item configured — add one under Items for Sale to bill it)`);
    }
    return {
      retailRows,
      careNote:
        careParts.length > 0
          ? `From the feeding log this stay: ${careParts.join(", ")} — pre-filled below, adjust if needed.`
          : null,
    };
  }

  const petKeys = animal ? [animal.id, ...(animal.gingr_animal_id != null ? [String(animal.gingr_animal_id)] : [])] : [];
  const primaryCare = await feedingPrefill(petKeys, stayDateStr);
  const initialRetailRows = primaryCare.retailRows;
  const careNote = primaryCare.careNote;

  const start = new Date(reservation.start_date);
  const end = new Date(reservation.end_date);
  const units = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));

  // Household dog rank, detected instead of asked for. The additional-dog rate
  // used to depend on staff remembering to bump a dropdown that defaulted to 1,
  // so a forgotten click silently OVERCHARGED a multi-dog family. Look up the
  // parent's other dogs whose stays overlap this one and rank this ticket among
  // them. Order is created_at (then id) so every dog in the group resolves to
  // the same rank no matter which one is checked out first, or in what order —
  // two dogs must never both come out as "#2". Staff can still override.
  let householdRank = 1;
  let householdSize = 1;
  let rankOf = (animalId: string): number => (animalId ? 1 : 1);
  if (animal?.parents) {
    const { data: siblingRows } = await supabase
      .from("reservations")
      .select("id, created_at, animal_id, animals!inner ( parent_id )")
      .eq("facility_id", session!.facilityId)
      .eq("animals.parent_id", animal.parents.id)
      .in("status", ["booked", "checked_in", "checked_out"])
      .is("cancelled_at", null)
      .lte("start_date", reservation.end_date)
      .gte("end_date", reservation.start_date);

    // One rank per DOG, not per reservation — a dog with two back-to-back
    // bookings inside the window must not consume two slots in the tier list.
    const byAnimal = new Map<string, { id: string; created_at: string }>();
    for (const r of siblingRows ?? []) {
      const prev = byAnimal.get(r.animal_id);
      if (!prev || r.created_at < prev.created_at || (r.created_at === prev.created_at && r.id < prev.id)) {
        byAnimal.set(r.animal_id, { id: r.id, created_at: r.created_at });
      }
    }
    const ordered = [...byAnimal.entries()].sort(([, a], [, b]) =>
      a.created_at === b.created_at ? a.id.localeCompare(b.id) : a.created_at.localeCompare(b.created_at)
    );
    householdSize = Math.max(1, ordered.length);
    const idx = ordered.findIndex(([animalId]) => animalId === animal.id);
    householdRank = idx >= 0 ? idx + 1 : 1;
    rankOf = (animalId: string) => {
      const i = ordered.findIndex(([aid]) => aid === animalId);
      return i >= 0 ? i + 1 : ordered.length + 1;
    };
  }

  // ---- Household invoice (Krishan, Aug 30): one bill per family. ----
  // Every OTHER dog from this household still checked in joins this ticket
  // as its own section — its base rate, its rank's additional-dog discount,
  // its grooming service, its feeding-log charges — and completing checkout
  // closes all the reservations against ONE invoice.
  type ExtraDogData = {
    reservationId: string;
    animalId: string;
    animalName: string;
    baseRate: number;
    rateUnit: string;
    startDate: string;
    endDate: string;
    rank: number;
    typeName: string | null;
    isGrooming: boolean;
    bookedGroomingService: string | null;
    rules: NonNullable<typeof rules>;
    rememberedPrices: { service_name: string; price: number }[];
    initialRetailRows: { itemId: string; qty: number }[];
    careNote: string | null;
  };
  const extraDogs: ExtraDogData[] = [];
  if (animal?.parents) {
    const { data: hereNow } = await supabase
      .from("reservations")
      .select(
        `id, animal_id, start_date, end_date, grooming_service_name,
         animals!inner ( id, name, parent_id, gingr_animal_id ),
         reservation_types ( id, name, base_rate, rate_unit, category )`
      )
      .eq("facility_id", session!.facilityId)
      .eq("animals.parent_id", animal.parents.id)
      .eq("status", "checked_in")
      .neq("id", id);

    type HereRow = {
      id: string;
      animal_id: string;
      start_date: string;
      end_date: string;
      grooming_service_name: string | null;
      animals: { id: string; name: string; gingr_animal_id: number | string | null } | null;
      reservation_types: { id: string; name: string; base_rate: string; rate_unit: string; category: string | null } | null;
    };
    const extraRows = ((hereNow as unknown as HereRow[]) ?? []).filter((r) => r.animal_id !== animal.id);

    // Remembered grooming prices for all extra dogs in one query.
    const extraAnimalIds = extraRows.map((r) => r.animal_id);
    const { data: extraRemembered } = extraAnimalIds.length
      ? await supabase
          .from("grooming_service_prices")
          .select("animal_id, service_name, price")
          .in("animal_id", extraAnimalIds)
      : { data: [] };

    for (const r of extraRows) {
      const rType = r.reservation_types;
      const rStayYmd = String(r.start_date).slice(0, 10);
      // Same anchored-rate lookup the primary dog gets.
      const { data: rRate } = rType
        ? await supabase
            .from("reservation_type_rates")
            .select("rate")
            .eq("reservation_type_id", rType.id)
            .lte("effective_date", rStayYmd)
            .order("effective_date", { ascending: false })
            .limit(1)
        : { data: null };
      const dogRate = rRate && rRate.length > 0 ? Number(rRate[0].rate) : Number(rType?.base_rate ?? 0);
      const dogKeys = [r.animal_id, ...(r.animals?.gingr_animal_id != null ? [String(r.animals.gingr_animal_id)] : [])];
      const care = await feedingPrefill(dogKeys, rStayYmd);
      extraDogs.push({
        reservationId: r.id,
        animalId: r.animal_id,
        animalName: r.animals?.name ?? "Unknown",
        baseRate: dogRate,
        rateUnit: rType?.rate_unit ?? "per_night",
        startDate: r.start_date,
        endDate: r.end_date,
        rank: rankOf(r.animal_id),
        typeName: rType?.name ?? null,
        isGrooming: rType?.category === "grooming",
        bookedGroomingService: r.grooming_service_name,
        rules: rulesFor(rType?.id) as NonNullable<typeof rules>,
        rememberedPrices: ((extraRemembered ?? []) as { animal_id: string; service_name: string; price: number }[])
          .filter((p) => p.animal_id === r.animal_id)
          .map((p) => ({ service_name: p.service_name, price: Number(p.price) })),
        initialRetailRows: care.retailRows,
        careNote: care.careNote,
      });
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f6f8] dark:bg-slate-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <Link
          href="/reservations"
          className="text-[13px] font-medium text-[#8a91a0] transition-colors hover:text-indigo-600 dark:text-slate-500"
        >
          ← Check-in board
        </Link>
        <h1 className="mt-1 text-[26px] font-semibold leading-tight tracking-[-0.01em] text-[#15181d] dark:text-slate-50">
          Checkout —{" "}
          {extraDogs.length > 0
            ? [animal?.name ?? "Unknown", ...extraDogs.map((d) => d.animalName)].join(" + ")
            : animal?.name ?? "Unknown"}
        </h1>
        <p className="mt-1 text-[13px] text-[#8a91a0] dark:text-slate-500">
          {extraDogs.length > 0
            ? `One family bill — ${1 + extraDogs.length} dogs from ${animal?.parents?.first_name ?? "this"} ${
                animal?.parents?.last_name ?? "household"
              } check out together on one invoice · `
            : ""}
          {type?.name ?? "No reservation type"} · {units} {type?.rate_unit === "per_night" ? "night(s)" : "day(s)"} ·
          priced with rates/rules in effect {stayDateStr} (stay start), not today
        </p>
        {animal?.parents && (!savedCardRows || savedCardRows.length === 0) && (
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            No card on file for {animal.parents.first_name} yet — use &quot;+ Add a new card…&quot; in the Card
            Payment field below, or{" "}
            <Link href={`/parents/${animal.parents.id}`} className="underline">
              add one on their profile
            </Link>{" "}
            anytime.
          </p>
        )}

        <div className="mt-5">
          <CheckoutCalculator
            reservationId={id}
            facilityId={session!.facilityId}
            animalId={animal?.id ?? ""}
            parentId={animal?.parents?.id ?? null}
            animalName={animal?.name ?? "Animal"}
            baseRate={currentRate}
            rateUnit={type?.rate_unit ?? "per_night"}
            units={units}
            startDate={reservation.start_date}
            endDate={reservation.end_date}
            rules={rulesFor(type?.id) as unknown as Parameters<typeof CheckoutCalculator>[0]["rules"]}
            groomingItems={groomingItems ?? []}
            rememberedPrices={remembered ?? []}
            savedCards={savedCardRows ?? []}
            retailItems={retailCatalog.map((r) => ({ id: r.id, name: r.name, price: r.price, taxable: r.taxable }))}
            taxRate={taxRate}
            initialRetailRows={initialRetailRows}
            careNote={careNote}
            householdRank={householdRank}
            householdSize={householdSize}
            bookedGroomingService={(reservation.grooming_service_name as string | null) ?? null}
            isGroomingReservation={type?.category === "grooming"}
            extraDogs={extraDogs as unknown as Parameters<typeof CheckoutCalculator>[0]["extraDogs"]}
          />
        </div>
      </div>
    </main>
  );
}
