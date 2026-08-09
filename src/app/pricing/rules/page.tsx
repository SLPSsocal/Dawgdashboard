import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import { addPricingRule, retirePricingRule } from "../actions";
import Link from "next/link";

// Admin-only screen for creating, editing, and retiring pricing rules — the
// main Pricing page only shows a plain-language reference list of what's
// active, no editing controls, per request.
export default async function PricingRulesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = createClient();
  const facilityId = session!.facilityId;

  const [{ data: types }, { data: rules }] = await Promise.all([
    supabase.from("reservation_types").select("id, name, category").eq("facility_id", facilityId).eq("active", true).order("name"),
    supabase
      .from("pricing_rules")
      .select("id, reservation_type_id, label, rule_type, threshold, method, amount, effective_date, active")
      .eq("facility_id", facilityId)
      .eq("active", true)
      .order("label"),
  ]);

  const typeNameById = new Map((types ?? []).map((t) => [t.id, t.name]));

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">Pricing Rules — {session!.facilityName}</h1>
          <Link href="/pricing" className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">
            ← Back to Pricing
          </Link>
        </div>

        <p className="mt-3 text-sm text-slate-400 dark:text-slate-500">
          <span className="font-medium text-slate-500 dark:text-slate-400">Retire</span> turns a rule off for
          new checkouts starting today — it does not delete it. Any stay that already started while the rule
          was active keeps being priced with it, so past and in-progress checkouts are never affected.
        </p>

        <div className="mt-4 rounded-xl border border-slate-300 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-col gap-2">
            {(rules ?? []).map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                <div>
                  <span className="font-medium">{r.label}</span>{" "}
                  <span className="text-slate-400 dark:text-slate-500">
                    · {r.reservation_type_id ? typeNameById.get(r.reservation_type_id) : "All types"} ·{" "}
                    {r.method === "percent" ? `${r.amount}%` : `$${r.amount}`}
                    {r.threshold != null ? ` (threshold ${r.threshold})` : ""} · effective {r.effective_date}
                  </span>
                </div>
                <form action={retirePricingRule.bind(null, r.id)}>
                  <button
                    title="Stops this rule from applying to new checkouts. Stays in effect for any reservation whose stay already started — it's never deleted."
                    className="text-xs text-red-500 hover:underline dark:text-red-400"
                  >
                    Retire
                  </button>
                </form>
              </div>
            ))}
            {(rules ?? []).length === 0 && <p className="text-sm text-slate-400 dark:text-slate-500">No rules yet.</p>}
          </div>

          <form action={addPricingRule} className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4 sm:grid-cols-3 dark:border-slate-800">
            <input type="hidden" name="facility_id" value={facilityId} />
            <label className="col-span-2 text-xs sm:col-span-1">
              <span className="block text-slate-500 dark:text-slate-400">Applies To</span>
              <select name="reservation_type_id" className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                <option value="">All types (facility-wide)</option>
                {(types ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="col-span-2 text-xs sm:col-span-1">
              <span className="block text-slate-500 dark:text-slate-400">Label</span>
              <input name="label" required placeholder="5-Night Package" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
            </label>
            <label className="text-xs">
              <span className="block text-slate-500 dark:text-slate-400">Rule Type</span>
              <select name="rule_type" className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                <option value="multi_day_discount">Multi-day/night discount</option>
                <option value="additional_animal_discount">Additional dog discount</option>
                <option value="flat_fee">Flat fee</option>
              </select>
            </label>
            <label className="text-xs">
              <span className="block text-slate-500 dark:text-slate-400">Threshold</span>
              <input name="threshold" type="number" step="1" placeholder="5" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
            </label>
            <label className="text-xs">
              <span className="block text-slate-500 dark:text-slate-400">Method</span>
              <select name="method" className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                <option value="dollar">Dollar</option>
                <option value="percent">Percent</option>
              </select>
            </label>
            <label className="text-xs">
              <span className="block text-slate-500 dark:text-slate-400">Amount</span>
              <input name="amount" type="number" step="0.01" required placeholder="-5 (discount) or 40 (fee)" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
            </label>
            <label className="text-xs">
              <span className="block text-slate-500 dark:text-slate-400">Effective</span>
              <input
                name="effective_date"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <button type="submit" className="col-span-2 rounded-md bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 text-xs font-medium text-white sm:col-span-3 sm:w-fit dark:bg-slate-100 dark:text-slate-900">
              Add Rule
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
