import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import PurchaseRequestForm from "@/components/PurchaseRequestForm";
import PurchaseRequestPinGate from "@/components/PurchaseRequestPinGate";
import { PageHeader, PageShell } from "@/components/ui/Page";
import ThemeToggle from "@/components/ThemeToggle";
import Link from "next/link";
import {
  isPurchaseRequestUnlocked,
  purchaseRequestPinRequired,
} from "@/lib/purchaseRequestGate";
import { mapCatalogRow } from "@/lib/purchaseCatalog";

export default async function PurchaseRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const unlocked = await isPurchaseRequestUnlocked();
  if (purchaseRequestPinRequired() && !unlocked) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
        <div className="mb-6 flex justify-end">
          <ThemeToggle />
        </div>
        <PurchaseRequestPinGate error={error} />
      </main>
    );
  }

  const session = await getSession();
  const supabase = createClient();
  const { data: facilities, error: facilitiesError } = await supabase
    .from("facilities")
    .select("id, name, slug")
    .order("name");

  const { data: catalogRows, error: catalogError } = await supabase
    .from("purchase_catalog_items")
    .select("id, name, brand, typical_unit, pack_size, category, notes, sort_order")
    .eq("active", true)
    .order("sort_order", { ascending: true });

  const catalog = (catalogRows ?? []).map(mapCatalogRow);

  const requestedBy =
    session?.staffName && session.staffName !== "Staff" ? session.staffName : "";

  const form = (
    <PageShell width="lg">
      <PageHeader
        title="Purchase request"
        description="Pick a facility, then enter quantities on the supply list — like a paper inventory sheet. Only rows with a quantity are submitted."
        action={
          session ? (
            <Link
              href="/purchase-requests"
              className="text-[13px] font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
            >
              New requests →
            </Link>
          ) : undefined
        }
      />
      {facilitiesError && (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          Couldn&apos;t load facilities. Refresh and try again.
        </p>
      )}
      {catalogError && (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          Couldn&apos;t load the supply catalog. Apply{" "}
          <code className="font-mono text-[12px]">
            supabase/migrations/20260908180000_purchase_catalog.sql
          </code>{" "}
          in the Supabase SQL editor. {catalogError.message}
        </p>
      )}
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
        <PurchaseRequestForm
          facilities={facilities ?? []}
          catalog={catalog}
          defaultFacilityId={session?.facilityId}
          defaultRequestedBy={requestedBy}
          showQueueLink={Boolean(session)}
          hasAppHeader={Boolean(session)}
        />
      </div>
    </PageShell>
  );

  if (session) {
    return (
      <main className="min-h-screen bg-[#f5f6f8] dark:bg-slate-950">
        <FacilityHeader session={session} />
        {form}
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f6f8] dark:bg-slate-950">
      <header className="flex items-center justify-between px-4 py-3 sm:px-6">
        <span className="text-[13px] font-bold uppercase tracking-wide text-[#15181d] dark:text-slate-100">
          🐾 Dawg Dashboard
        </span>
        <ThemeToggle />
      </header>
      {form}
    </main>
  );
}
