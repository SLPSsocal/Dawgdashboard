import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import CheckoutCalculator from "@/components/CheckoutCalculator";

export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;

  const supabase = createClient();
  const { data: reservation } = await supabase
    .from("reservations")
    .select(
      `*, animals ( id, name, parent_id, parents ( id, first_name, last_name ) ),
       reservation_types ( id, name, base_rate, rate_unit )`
    )
    .eq("id", id)
    .maybeSingle();
  if (!reservation) notFound();

  const animal = reservation.animals as unknown as {
    id: string;
    name: string;
    parent_id: string;
    parents: { id: string; first_name: string; last_name: string } | null;
  } | null;
  const type = reservation.reservation_types as unknown as {
    id: string;
    name: string;
    base_rate: string;
    rate_unit: string;
  } | null;

  // Anchor every price lookup to when the STAY started, not today. A rate
  // hike or a retired discount rule next month must never change what an
  // already-in-progress (or even not-yet-checked-out) reservation is billed —
  // it should always reflect what was actually in effect when the animal
  // checked in.
  const stayDateStr = String(reservation.start_date).slice(0, 10);

  const [{ data: rateHistory }, { data: rules }, { data: groomingItems }, { data: remembered }] = await Promise.all([
    type
      ? supabase
          .from("reservation_type_rates")
          .select("rate, effective_date")
          .eq("reservation_type_id", type.id)
          .lte("effective_date", stayDateStr)
          .order("effective_date", { ascending: false })
          .limit(1)
      : Promise.resolve({ data: null }),
    supabase
      .from("pricing_rules")
      .select("id, reservation_type_id, label, rule_type, threshold, method, amount, effective_date, retired_date")
      .eq("facility_id", session!.facilityId)
      .lte("effective_date", stayDateStr)
      .or(type ? `reservation_type_id.eq.${type.id},reservation_type_id.is.null` : "reservation_type_id.is.null")
      .or(`retired_date.is.null,retired_date.gt.${stayDateStr}`),
    supabase.from("grooming_menu_items").select("name, min_price, max_price").eq("facility_id", session!.facilityId).eq("active", true).order("name"),
    animal
      ? supabase.from("grooming_service_prices").select("service_name, price").eq("animal_id", animal.id)
      : Promise.resolve({ data: null }),
  ]);

  const currentRate = rateHistory && rateHistory.length > 0 ? Number(rateHistory[0].rate) : Number(type?.base_rate ?? 0);

  const start = new Date(reservation.start_date);
  const end = new Date(reservation.end_date);
  const units = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        <a href="/reservations" className="text-sm text-neutral-400 underline dark:text-neutral-500">
          ← Check-in Board
        </a>
        <h1 className="mt-2 text-xl font-semibold">Checkout — {animal?.name ?? "Unknown"}</h1>
        <p className="text-sm text-neutral-400 dark:text-neutral-500">
          {type?.name ?? "No reservation type"} · {units} {type?.rate_unit === "per_night" ? "night(s)" : "day(s)"}
        </p>
        <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
          Priced using rates/rules in effect on {stayDateStr} (the stay&apos;s start date), not today&apos;s.
        </p>

        <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-4 sm:p-6 dark:border-neutral-800 dark:bg-neutral-900">
          <CheckoutCalculator
            reservationId={id}
            facilityId={session!.facilityId}
            animalId={animal?.id ?? ""}
            parentId={animal?.parents?.id ?? null}
            animalName={animal?.name ?? "Animal"}
            baseRate={currentRate}
            rateUnit={type?.rate_unit ?? "per_night"}
            units={units}
            rules={(rules ?? []) as unknown as Parameters<typeof CheckoutCalculator>[0]["rules"]}
            groomingItems={groomingItems ?? []}
            rememberedPrices={remembered ?? []}
          />
        </div>
      </div>
    </main>
  );
}
