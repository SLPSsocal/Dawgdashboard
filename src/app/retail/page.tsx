import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import PageQuickActions from "@/components/PageQuickActions";
import { createRetailItem, updateRetailItem, retireRetailItem, reactivateRetailItem, setFacilityPrice, updateTaxRate } from "./actions";

export default async function RetailPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { error } = await searchParams;

  const supabase = createClient();
  const [{ data: items }, { data: overrides }, { data: facility }] = await Promise.all([
    supabase.from("retail_items").select("id, name, sku, category, base_price, taxable, active").order("name"),
    supabase.from("retail_item_facility_prices").select("retail_item_id, price").eq("facility_id", session!.facilityId),
    supabase.from("facilities").select("tax_rate").eq("id", session!.facilityId).maybeSingle(),
  ]);

  const overrideMap = new Map((overrides ?? []).map((o) => [o.retail_item_id as string, Number(o.price)]));
  const active = (items ?? []).filter((i) => i.active);
  const retired = (items ?? []).filter((i) => !i.active);

  const updateTaxWithFacility = updateTaxRate.bind(null, session!.facilityId);

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="text-xl font-semibold">Items for Sale</h1>
        <p className="text-sm text-slate-400 dark:text-slate-500">
          One shared catalog across all facilities. Add items below; edit any field right in the table and hit{" "}
          <span className="font-medium text-slate-600 dark:text-slate-300">Save</span>. Set a price override if{" "}
          {session!.facilityName} charges differently than the base price. Items and packages show up at checkout
          and on walk-in sales.
        </p>

        <div className="mt-3">
          <PageQuickActions session={session!} />
        </div>

        {error && (
          <div className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
            {error === "missing_name" ? "Item name is required." : error}
          </div>
        )}

        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Sales Tax — {session!.facilityName}</h2>
          <form action={updateTaxWithFacility} className="mt-2 flex items-end gap-2">
            <label className="block">
              <span className="text-xs text-slate-500 dark:text-slate-400">Tax Rate (%)</span>
              <input
                type="number"
                step="0.001"
                name="tax_rate"
                defaultValue={facility?.tax_rate ?? 0}
                className="mt-1 w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
            <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 dark:bg-slate-100 dark:text-slate-900">
              Save
            </button>
          </form>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Applied automatically to taxable items during checkout and walk-in sales.
          </p>
        </div>

        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Add Item</h2>
          <form action={createRetailItem} className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs text-slate-500 dark:text-slate-400">Name *</span>
              <input name="name" required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-500 dark:text-slate-400">SKU</span>
              <input name="sku" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-500 dark:text-slate-400">Category</span>
              <select name="category" defaultValue="retail" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                <option value="retail">Retail item</option>
                <option value="package">Package</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-slate-500 dark:text-slate-400">Base Price</span>
              <input type="number" step="0.01" name="base_price" defaultValue={0} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
            </label>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="taxable" defaultChecked />
              Taxable
            </label>
            <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 sm:w-fit dark:bg-slate-100 dark:text-slate-900">
              Add Item
            </button>
          </form>
        </div>

        <div className="mt-6 rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <h2 className="px-4 pt-4 text-sm font-semibold text-slate-700 dark:text-slate-200 sm:px-6">Catalog</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500">
                <tr>
                  <th className="px-4 py-2 sm:px-6">Name</th>
                  <th className="px-2 py-2">Category</th>
                  <th className="px-2 py-2">Base Price</th>
                  <th className="px-2 py-2">Tax</th>
                  <th className="px-2 py-2">{session!.facilityName} Price</th>
                  <th className="px-4 py-2 sm:px-6"></th>
                </tr>
              </thead>
              <tbody>
                {active.map((item) => {
                  const override = overrideMap.get(item.id);
                  const setPriceWithIds = setFacilityPrice.bind(null, session!.facilityId, item.id);
                  const editFormId = `edit-${item.id}`;
                  // Every base field is editable in place; inputs in different
                  // cells share one form via the form="…" attribute (tables
                  // can't nest a single <form> across cells).
                  return (
                    <tr key={item.id} className="border-b border-slate-100 dark:border-slate-800/60">
                      <td className="px-4 py-2 sm:px-6">
                        <form action={updateRetailItem.bind(null, item.id)} id={editFormId} />
                        <input
                          name="name"
                          form={editFormId}
                          defaultValue={item.name}
                          required
                          className="w-full min-w-[140px] rounded border border-transparent px-2 py-1 text-sm font-medium hover:border-slate-300 focus:border-indigo-400 focus:outline-none dark:bg-slate-900 dark:hover:border-slate-700"
                        />
                        <input
                          name="sku"
                          form={editFormId}
                          defaultValue={item.sku ?? ""}
                          placeholder="SKU"
                          className="mt-0.5 w-full min-w-[140px] rounded border border-transparent px-2 py-0.5 text-xs text-slate-400 hover:border-slate-300 focus:border-indigo-400 focus:outline-none dark:bg-slate-900 dark:hover:border-slate-700"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <select
                          name="category"
                          form={editFormId}
                          defaultValue={item.category}
                          className="rounded border border-slate-300 bg-white px-1.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        >
                          <option value="retail">Retail</option>
                          <option value="package">Package</option>
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          step="0.01"
                          name="base_price"
                          form={editFormId}
                          defaultValue={Number(item.base_price).toFixed(2)}
                          className="w-20 rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input type="checkbox" name="taxable" form={editFormId} defaultChecked={item.taxable} title="Taxable" />
                      </td>
                      <td className="px-2 py-2">
                        <form action={setPriceWithIds} className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.01"
                            name="price"
                            defaultValue={override ?? ""}
                            placeholder={`$${Number(item.base_price).toFixed(2)}`}
                            className="w-20 rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                          />
                          <button type="submit" className="text-xs text-indigo-600 underline dark:text-indigo-400">
                            Set
                          </button>
                        </form>
                      </td>
                      <td className="px-4 py-2 text-right sm:px-6">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="submit"
                            form={editFormId}
                            className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700"
                            title="Save changes to name, SKU, category, base price, taxable"
                          >
                            Save
                          </button>
                          <form action={retireRetailItem.bind(null, item.id)}>
                            <button type="submit" className="text-xs text-red-500 underline dark:text-red-400" title="Hides it from checkout/sale pickers without deleting history">
                              Retire
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {active.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-400 dark:text-slate-500 sm:px-6">
                      No items yet — add your first one above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {retired.length > 0 && (
            <details className="border-t border-slate-200 px-4 py-3 dark:border-slate-800 sm:px-6">
              <summary className="cursor-pointer text-xs font-medium text-slate-400 dark:text-slate-500">
                Retired items ({retired.length})
              </summary>
              <div className="mt-2 flex flex-col gap-1">
                {retired.map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-400 dark:text-slate-500">{item.name}</span>
                    <form action={reactivateRetailItem.bind(null, item.id)}>
                      <button type="submit" className="text-xs text-indigo-600 underline dark:text-indigo-400">
                        Reactivate
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>
    </main>
  );
}
