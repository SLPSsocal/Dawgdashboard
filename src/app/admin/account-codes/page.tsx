import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isOwnerUnlocked } from "@/lib/ownerGate";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import AdminGate from "@/components/AdminGate";
import AccountCodeBoard, { type AccountCode, type AssignableItem } from "@/components/AccountCodeBoard";
import { PageHeader, PageShell } from "@/components/ui/Page";
import { createAccountCode } from "./actions";

export default async function AccountCodesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const sp = await searchParams;
  const unlocked = await isOwnerUnlocked(session.facilityId);

  if (!unlocked) {
    return (
      <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <FacilityHeader session={session!} />
        <PageShell>
          <AdminGate facilityName={session!.facilityName} next="/admin/account-codes" error={sp.error} />
        </PageShell>
      </main>
    );
  }

  const supabase = createClient();
  const [{ data: codes }, { data: resTypes }, { data: groomingItems }, { data: retail }, { data: assignments }] =
    await Promise.all([
      supabase.from("account_codes").select("id, name").eq("active", true).order("sort_order"),
      supabase.from("reservation_types").select("id, name, facility_id").eq("active", true).order("name"),
      supabase.from("grooming_menu_items").select("id, name").eq("active", true).order("name"),
      supabase.from("retail_items").select("id, name").eq("active", true).order("name"),
      supabase.from("account_code_assignments").select("account_code_id, item_type, item_id"),
    ]);

  const assignedBy = new Map<string, string>();
  for (const a of ((assignments as { account_code_id: string; item_type: string; item_id: string }[]) ?? [])) {
    assignedBy.set(`${a.item_type}:${a.item_id}`, a.account_code_id);
  }

  const items: AssignableItem[] = [
    ...((resTypes as { id: string; name: string }[]) ?? []).map((r) => ({
      itemType: "reservation_type" as const,
      itemId: r.id,
      name: r.name,
      group: "Reservation Types",
      accountCodeId: assignedBy.get(`reservation_type:${r.id}`) ?? null,
    })),
    ...((groomingItems as { id: string; name: string }[]) ?? []).map((g) => ({
      itemType: "grooming_service" as const,
      itemId: g.id,
      name: g.name,
      group: "Grooming Services",
      accountCodeId: assignedBy.get(`grooming_service:${g.id}`) ?? null,
    })),
    ...((retail as { id: string; name: string }[]) ?? []).map((r) => ({
      itemType: "retail_item" as const,
      itemId: r.id,
      name: r.name,
      group: "Retail Items",
      accountCodeId: assignedBy.get(`retail_item:${r.id}`) ?? null,
    })),
  ];

  const unassignedCount = items.filter((i) => !i.accountCodeId).length;

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <FacilityHeader session={session!} />
      <PageShell width="lg">
        <PageHeader
          backHref="/admin"
          backLabel="Admin"
          title="Account Codes"
          description="Revenue buckets every service and item rolls up into. Assign each one so reports group the way your books do."
          action={
            <form action={createAccountCode} className="flex items-center gap-2">
              <input
                name="name"
                required
                placeholder="New account code…"
                className="h-9 w-48 rounded-lg border border-slate-200 px-3 text-[14px] dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
              />
              <button
                type="submit"
                className="inline-flex h-9 shrink-0 items-center rounded-lg bg-emerald-600 px-3.5 text-[13px] font-medium text-white hover:bg-emerald-700"
              >
                Add
              </button>
            </form>
          }
        />

        {unassignedCount > 0 && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            <strong>{unassignedCount}</strong>{" "}
            {unassignedCount === 1 ? "item isn't" : "items aren't"} assigned to an account code — they&apos;ll
            fall outside every by-code report until they are.
          </div>
        )}

        <AccountCodeBoard items={items} codes={(codes as AccountCode[]) ?? []} />
      </PageShell>
    </main>
  );
}
