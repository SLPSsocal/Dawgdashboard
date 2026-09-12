import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import DepositPanel from "@/components/DepositPanel";
import { estimateBooking } from "@/app/reservations/estimate-actions";
import { getPaidDeposits, getStoreCreditBalance } from "@/app/reservations/deposit-actions";
import { parseGroomingAddons } from "@/lib/groomingAddons";
import { parseDaycareDates, describeDaycareDates } from "@/lib/daycareAddon";
import { formatInZone, toDateTimeLocalInZone } from "@/lib/timezone";

// View Estimate for an existing reservation (Mark, Sep 10): the same numbers
// the booking form quoted and checkout will charge — WITHOUT starting the
// checkout — plus "Apply Payment": put a prepaid amount toward the full
// balance or a specific portion of it (Gingr's View Estimate → Apply
// Payment). Money taken here is a deposit (see deposit-actions.ts): it's
// applied automatically at checkout, and rolls into store credit if the
// stay is cancelled.

export default async function ReservationEstimatePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;

  const supabase = createClient();
  const { data: reservation } = await supabase
    .from("reservations")
    .select(
      `*, animals ( id, name, parent_id, parents ( id, first_name, last_name ) ),
       reservation_types ( id, name, category, rate_unit )`
    )
    .eq("id", id)
    .maybeSingle();
  if (!reservation) notFound();

  const animal = reservation.animals as unknown as {
    id: string;
    name: string;
    parent_id: string | null;
    parents: { id: string; first_name: string; last_name: string } | null;
  } | null;
  const type = reservation.reservation_types as unknown as {
    id: string;
    name: string;
    category: string | null;
    rate_unit: string | null;
  } | null;

  const { data: facilityRow } = await supabase
    .from("facilities")
    .select("timezone")
    .eq("id", reservation.facility_id)
    .maybeSingle();
  const tz: string = facilityRow?.timezone ?? "America/New_York";
  const startLocal = toDateTimeLocalInZone(reservation.start_date, tz); // YYYY-MM-DDTHH:MM
  const endLocal = toDateTimeLocalInZone(reservation.end_date, tz);
  const startYmd = startLocal.slice(0, 10);
  const endYmd = endLocal.slice(0, 10);
  const pickUpTime = endLocal.slice(11, 16);
  const isGrooming = type?.category === "grooming";
  const isSlot = isGrooming || type?.category === "evaluation";

  // Remembered grooming quote for this dog + service (same memory checkout uses).
  const { data: rememberedPrice } =
    animal && reservation.grooming_service_name
      ? await supabase
          .from("grooming_service_prices")
          .select("price")
          .eq("animal_id", animal.id)
          .eq("service_name", reservation.grooming_service_name)
          .maybeSingle()
      : { data: null };

  // Household rank — same derivation as checkout, so the additional-dog
  // rate lands on the same dog here as it will there.
  let primaryRank = 1;
  let householdSize = 1;
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
    const idx = ordered.findIndex(([aid]) => aid === animal.id);
    primaryRank = idx >= 0 ? idx + 1 : 1;
  }

  const daycareDates = parseDaycareDates((reservation as { daycare_dates?: unknown }).daycare_dates);
  const estimate = type
    ? await estimateBooking({
        facilityId: session!.facilityId,
        reservationTypeId: type.id,
        startDate: startYmd,
        endDate: isSlot ? startYmd : endYmd,
        pickUpTime: isSlot ? null : pickUpTime,
        dogNames: [animal?.name ?? "Dog"],
        groomingPrice: rememberedPrice?.price != null ? Number(rememberedPrice.price) : null,
        serviceName: reservation.grooming_service_name ?? null,
        groomingAddons: parseGroomingAddons((reservation as { grooming_addons?: unknown }).grooming_addons),
        daycareDates,
        primaryRank,
      }).catch(() => null)
    : null;

  const canDeposit = Boolean(animal?.parents) && (reservation.status === "booked" || reservation.status === "checked_in");
  const [paidDeposits, depositCards, storeCreditBalance] = canDeposit
    ? await Promise.all([
        getPaidDeposits([id]),
        supabase
          .from("payment_methods")
          .select("id, card_brand, last4")
          .eq("facility_id", reservation.facility_id)
          .eq("parent_id", animal!.parents!.id)
          .order("created_at", { ascending: false })
          .then((r) => r.data ?? []),
        getStoreCreditBalance(animal!.parents!.id, reservation.facility_id),
      ])
    : [[], [], 0];

  const total = estimate?.total ?? 0;
  const prepaid = Math.round(paidDeposits.reduce((s, d) => s + d.amount, 0) * 100) / 100;
  const balance = Math.max(0, Math.round((total - prepaid) * 100) / 100);
  const quickAmounts = [
    { label: "Full balance", amount: balance },
    ...(balance > 0 && total > 0 ? [{ label: "Half", amount: Math.round(balance * 50) / 100 }] : []),
    ...(estimate?.lines ?? []).filter((l) => l.amount > 0).map((l) => ({ label: l.label, amount: l.amount })),
  ];

  const card = "rounded-[14px] border border-[#e3e5ea] bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900";
  const sectionLabel = "text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8a91a0] dark:text-slate-500";

  return (
    <main className="min-h-screen bg-[#f5f6f8] dark:bg-slate-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <Link href="/reservations" className="text-[13px] font-medium text-[#8a91a0] transition-colors hover:text-indigo-600 dark:text-slate-500">
          ← Check-in board
        </Link>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-[#15181d] dark:text-slate-50">
              Estimate — {animal?.name ?? "Unknown"}
            </h1>
            <p className="mt-1 text-[13px] text-[#8a91a0] dark:text-slate-500">
              {type?.name ?? "No reservation type"} ·{" "}
              {formatInZone(reservation.start_date, tz, { month: "short", day: "numeric" })} →{" "}
              {formatInZone(reservation.end_date, tz, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              {estimate ? ` · ${estimate.units} ${estimate.unitLabel}${estimate.units === 1 ? "" : "s"}` : ""}
              {householdSize > 1 ? ` · dog #${primaryRank} of ${householdSize} from this household` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/reservations/${id}`}
              className="inline-flex h-9 items-center rounded-[10px] border border-[#e3e5ea] bg-white px-3.5 text-[13px] font-semibold text-[#565d6d] hover:border-[#c4c9d4] dark:border-slate-700 dark:bg-transparent dark:text-slate-300"
            >
              Edit reservation
            </Link>
            {reservation.status !== "checked_out" && reservation.status !== "cancelled" && (
              <Link
                href={`/reservations/${id}/checkout`}
                className="inline-flex h-9 items-center rounded-[10px] bg-indigo-600 px-3.5 text-[13px] font-semibold text-white hover:bg-indigo-700"
              >
                Go to checkout →
              </Link>
            )}
          </div>
        </div>

        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[1fr_400px]">
          <div className={card}>
            <div className="flex items-baseline justify-between">
              <span className={sectionLabel}>Estimated charges</span>
              <span className="text-[11px] text-[#8a91a0] dark:text-slate-500">Rates/rules in effect {startYmd} (stay start)</span>
            </div>
            {!estimate || estimate.lines.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                {isGrooming
                  ? "No quoted price on this appointment yet — set one on the reservation to see an estimate."
                  : "No rate is set for this service yet."}
              </p>
            ) : (
              <div className="mt-2">
                {estimate.lines.map((l, i) => (
                  <div key={i} className="flex justify-between gap-3 py-1 text-sm">
                    <span className={l.kind === "discount" ? "text-emerald-700 dark:text-emerald-400" : "text-[#565d6d] dark:text-slate-300"}>
                      {l.label}
                    </span>
                    <span className={`shrink-0 tabular-nums ${l.kind === "discount" ? "text-emerald-700 dark:text-emerald-400" : "text-[#15181d] dark:text-slate-100"}`}>
                      {l.amount < 0 ? "−" : ""}${Math.abs(l.amount).toFixed(2)}
                    </span>
                  </div>
                ))}
                <div className="mt-2 flex items-baseline justify-between border-t border-[#edeff3] pt-2.5 dark:border-slate-800">
                  <span className="font-semibold text-[#15181d] dark:text-slate-100">Estimated total</span>
                  <span className="text-[22px] font-semibold tabular-nums text-[#15181d] dark:text-slate-50">${total.toFixed(2)}</span>
                </div>
                {paidDeposits.length > 0 && (
                  <>
                    {paidDeposits.map((d) => (
                      <div key={d.invoiceId} className="flex justify-between gap-3 py-0.5 text-[13px] text-emerald-700 dark:text-emerald-400">
                        <span>
                          Prepaid · {d.method === "store_credit" ? "store credit" : d.method} ·{" "}
                          {new Date(d.paidAt ?? d.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                        </span>
                        <span className="tabular-nums">−${d.amount.toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="mt-1.5 flex items-baseline justify-between border-t border-dashed border-[#edeff3] pt-2 dark:border-slate-800">
                      <span className="font-semibold text-[#15181d] dark:text-slate-100">Balance remaining</span>
                      <span className="text-[22px] font-semibold tabular-nums text-[#15181d] dark:text-slate-50">${balance.toFixed(2)}</span>
                    </div>
                  </>
                )}
              </div>
            )}
            {estimate?.hint && <p className="mt-2 text-[12px] text-slate-500 dark:text-slate-400">{estimate.hint}</p>}
            {daycareDates.length > 0 && (
              <p className="mt-2 text-[12px] text-amber-700 dark:text-amber-400">☀️ Daycare days: {describeDaycareDates(daycareDates)}</p>
            )}
            <p className="mt-2 text-[11px] text-[#8a91a0] dark:text-slate-500">
              Before retail (house food, CBD …), tax, tips and any adjustments made at checkout. Nothing on this page
              checks the dog out.
            </p>
          </div>

          <aside className="lg:sticky lg:top-20">
            {canDeposit && animal?.parents ? (
              <DepositPanel
                className=""
                title="💵 Apply payment"
                reservationId={id}
                facilityId={reservation.facility_id}
                parentId={animal.parents.id}
                animalName={animal.name}
                staffName={session!.staffName}
                suggestedAmount={balance > 0 ? balance : null}
                estimateTotal={total > 0 ? total : null}
                deposits={paidDeposits}
                savedCards={depositCards}
                storeCreditBalance={storeCreditBalance}
                quickAmounts={quickAmounts}
              />
            ) : (
              <div className={card}>
                <span className={sectionLabel}>Apply payment</span>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  {reservation.status === "checked_out"
                    ? "This reservation is checked out — record payment on its invoice instead."
                    : reservation.status === "cancelled"
                      ? "Cancelled reservations can't take payments."
                      : "This dog has no parent on file, so there's no account to apply a payment to."}
                </p>
              </div>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}
