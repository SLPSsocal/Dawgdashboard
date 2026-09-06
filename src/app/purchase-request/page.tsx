import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import PurchaseRequestForm from "@/components/PurchaseRequestForm";
import { PageHeader, PageShell } from "@/components/ui/Page";
import Link from "next/link";

export default async function PurchaseRequestPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/purchase-request");

  const supabase = createClient();
  const { data: facilities } = await supabase
    .from("facilities")
    .select("id, name, slug")
    .order("name");

  const requestedBy =
    session.staffName && session.staffName !== "Staff" ? session.staffName : "";

  return (
    <main className="min-h-screen bg-[#f5f6f8] dark:bg-slate-950">
      <FacilityHeader session={session} />
      <PageShell width="md">
        <PageHeader
          title="Purchase request"
          description="Ask purchasing for supplies. Add every item on this page — one request, many rows."
          action={
            <Link
              href="/purchase-requests"
              className="text-[13px] font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
            >
              New requests →
            </Link>
          }
        />
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
          <PurchaseRequestForm
            facilities={facilities ?? []}
            defaultFacilityId={session.facilityId}
            defaultRequestedBy={requestedBy}
          />
        </div>
      </PageShell>
    </main>
  );
}
