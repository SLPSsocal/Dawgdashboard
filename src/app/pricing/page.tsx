import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import PageQuickActions from "@/components/PageQuickActions";
import { addRate, addGroomingMenuItem, deleteGroomingMenuItem } from "./actions";

// Plain-language summary for the reference-only list on this page — actual
// creating/editing/retiring of rules happens on the separate Pricing Rules
// admin page, not here.
function describeRule(
  r: { label: string; rule_type: string; threshold: number | null; method: string; amount: number },
) {
  const amt = Number(r.amount);
  const amountLabel = r.method === "percent" ? `${Math.abs(amt)}%` : `$${Math.abs(amt).toFixed(2)}`;
  const direction = amt < 0 ? "discount" : "fee";
  if (r.rule_type === "multi_day_discount" && r.threshold != null) {
    return `${r.threshold}+ nights — ${amountLabel} ${direction}`;
  }
  if (r.rule_type === "additional_animal_discount" && r.threshold != null) {
    return `${r.threshold}+ dogs — ${amountLabel} ${direction}`;
  }
  return `${amountLabel} ${direction}`;
}

export default async function PricingPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = createClient();
  const facilityId = session!.facilityId;

  const [{ data: types }, { data: rates }, { data: rules }, { data: groomingItems }] = await Promise.all([
    supabase.from("reservation_types").select("id, name, category, base_rate, rate_unit").eq("facility_id", facilityId).eq("active", true).order("name"),
    supabase
      .from("reservation_type_rates")
      .select("id, reservation_type_id, rate, effective_date")
      .in("reservation_type_id", (await supabase.from("reservation_types").select("id").eq("facility_id", facilityId)).data?.map((t) => t.id) ?? [])
      .order("effective_date", { ascending: false }),
    supabase.from("pricing_rules").select("id, reservation_type_id, label, rule_type, threshold, method, amount, effective_date, active").eq("facility_id", facilityId).eq("active", true).order("label"),
    supabase.from("grooming_menu_items").select("id, name, min_price, max_price").eq("facility_id", facilityId).eq("active", true).order("name"),
  ]);

  const typeNameById = new Map((types ?? []).map((t) => [t.id, t.name]));

  // Most recent (<= today, or just most recent overall) rate per type.
  const currentRateByType = new Map<string, { rate: number; effective_date: string }>();
  for (const r of rates ?? []) {
    if (!currentRateByType.has(r.reservation_type_id)) {
      currentRateByType.set(r.reservation_type_id, { rate: Number(r.rate), effective_date: r.effective_date });
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="text-xl font-semibold">Pricing — {session!.facilityName}</h1>

        <div className="mt-3">
          <PageQuickActions session={session!} />
        </div>

        <p className="mt-3 text-sm text-slate-400 dark:text-slate-500">
          Rates and rules are effective-dated — updating or retiring one never touches reservations that
          started before the change. Checkout always uses whatever was in effect on the stay&apos;s start
          date, not today&apos;s. Each facility manages its own pricing independently.
        </p>

        {/* Rates */}
        <div className="mt-6 rounded-xl border border-slate-300 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Rates</h2>
          <div className="mt-3 flex flex-col gap-3">
            {(types ?? []).map((t) => {
              const current = currentRateByType.get(t.id);
              return (
                <details key={t.id} className="group rounded-lg border border-slate-200 dark:border-slate-800">
                  <summary className="flex cursor-pointer select-none list-none items-center justify-between px-3 py-2 text-sm">
                    <div>
                      <span className="font-medium">{t.name}</span>{" "}
                      <span className="text-slate-400 dark:text-slate-500">({t.category})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">
                        ${current ? current.rate.toFixed(2) : Number(t.base_rate).toFixed(2)} {t.rate_unit.replace("per_", "/")}
                      </span>
                      <span className="text-slate-400 transition-transform group-open:rotate-180 dark:text-slate-500">▾</span>
                    </div>
                  </summary>
                  <form action={addRate} className="flex flex-wrap items-end gap-2 border-t border-slate-100 px-3 py-3 dark:border-slate-800">
                    <input type="hidden" name="reservation_type_id" value={t.id} />
                    <label className="text-xs">
                      <span className="block text-slate-500 dark:text-slate-400">New Rate ($)</span>
                      <input
                        name="rate"
                        type="number"
                        step="0.01"
                        defaultValue={current?.rate ?? Number(t.base_rate)}
                        className="mt-1 w-28 rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                    </label>
                    <label className="text-xs">
                      <span className="block text-slate-500 dark:text-slate-400">Effective</span>
                      <input
                        name="effective_date"
                        type="date"
                        defaultValue={new Date().toISOString().slice(0, 10)}
                        className="mt-1 rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                    </label>
                    <button type="submit" className="rounded-md bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 text-xs font-medium text-white dark:bg-slate-100 dark:text-slate-900">
                      Save New Rate
                    </button>
                  </form>
                </details>
              );
            })}
          </div>
        </div>

        {/* Rules — reference only. Creating, editing, and retiring rules
            happens on the separate Pricing Rules admin page. */}
        <div className="mt-4 rounded-xl border border-slate-300 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Discount & Fee Rules</h2>
            <a href="/pricing/rules" className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">
              Manage Pricing Rules →
            </a>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {(rules ?? []).map((r) => (
              <div key={r.id} className="rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                <span className="font-medium">{r.label}</span>{" "}
                <span className="text-slate-400 dark:text-slate-500">
                  · {describeRule(r)}
                  {r.reservation_type_id ? ` · ${typeNameById.get(r.reservation_type_id)}` : ""}
                </span>
              </div>
            ))}
            {(rules ?? []).length === 0 && <p className="text-sm text-slate-400 dark:text-slate-500">No rules yet.</p>}
          </div>
        </div>

        {/* Grooming menu */}
        <div className="mt-4 rounded-xl border border-slate-300 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Grooming Menu</h2>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Reference price ranges — actual price depends on the dog. Checkout remembers what was
            actually charged per animal, per service, last time.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {(groomingItems ?? []).map((g) => (
              <div key={g.id} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                <span className="font-medium">{g.name}</span>
                <div className="flex items-center gap-3">
                  <span className="text-slate-500 dark:text-slate-400">
                    {g.min_price != null ? `$${g.min_price}${g.max_price && g.max_price !== g.min_price ? `–$${g.max_price}` : "+"}` : "—"}
                  </span>
                  <form action={deleteGroomingMenuItem.bind(null, g.id)}>
                    <button className="text-xs text-red-500 hover:underline dark:text-red-400">Remove</button>
                  </form>
                </div>
              </div>
            ))}
          </div>

          <form action={addGroomingMenuItem} className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
            <input type="hidden" name="facility_id" value={facilityId} />
            <label className="text-xs">
              <span className="block text-slate-500 dark:text-slate-400">Service</span>
              <input name="name" required placeholder="Bath and Brush" className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
            </label>
            <label className="text-xs">
              <span className="block text-slate-500 dark:text-slate-400">Min $</span>
              <input name="min_price" type="number" step="0.01" className="mt-1 w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
            </label>
            <label className="text-xs">
              <span className="block text-slate-500 dark:text-slate-400">Max $</span>
              <input name="max_price" type="number" step="0.01" className="mt-1 w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
            </label>
            <button type="submit" className="rounded-md bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 text-xs font-medium text-white dark:bg-slate-100 dark:text-slate-900">
              Add Service
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
