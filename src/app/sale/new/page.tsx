import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import PageQuickActions from "@/components/PageQuickActions";
import WalkInSaleForm from "@/components/WalkInSaleForm";
import { getRetailCatalogForFacility } from "@/lib/retailPricing";

export default async function NewSalePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = createClient();
  const [retailCatalog, { data: parents }, { data: facilityRow }] = await Promise.all([
    getRetailCatalogForFacility(session!.facilityId),
    supabase.from("parents").select("id, first_name, last_name, phone, email").order("last_name"),
    supabase.from("facilities").select("tax_rate").eq("id", session!.facilityId).maybeSingle(),
  ]);

  const parentOptions = (parents ?? []).map((p) => ({
    id: p.id,
    name: `${p.first_name} ${p.last_name}`,
    phone: p.phone,
    email: p.email,
  }));

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <a href="/reservations" className="text-sm text-slate-400 underline dark:text-slate-500">
          ← Check-in Board
        </a>
        <h1 className="mt-2 text-xl font-semibold">Walk-in Sale</h1>
        <p className="text-sm text-slate-400 dark:text-slate-500">
          Ring up retail items on their own, no dog check-in required — {session!.facilityName}.
        </p>

        <div className="mt-3">
          <PageQuickActions session={session!} />
        </div>

        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
          <WalkInSaleForm
            facilityId={session!.facilityId}
            retailItems={retailCatalog.map((r) => ({ id: r.id, name: r.name, price: r.price, taxable: r.taxable }))}
            taxRate={Number(facilityRow?.tax_rate ?? 0)}
            parents={parentOptions}
          />
        </div>
      </div>
    </main>
  );
}
