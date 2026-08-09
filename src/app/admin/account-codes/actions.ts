"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";

export type ItemType = "reservation_type" | "grooming_service" | "retail_item";

/** Moves an item into a code. Unique(item_type,item_id) makes this a move. */
export async function assignToAccountCode(
  itemType: ItemType,
  itemId: string,
  accountCodeId: string
) {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = createClient();
  const { error } = await supabase
    .from("account_code_assignments")
    .upsert(
      { account_code_id: accountCodeId, item_type: itemType, item_id: itemId },
      { onConflict: "item_type,item_id" }
    );
  if (error) throw new Error(error.message);
  revalidatePath("/admin/account-codes");
}

export async function unassignFromAccountCode(itemType: ItemType, itemId: string) {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = createClient();
  const { error } = await supabase
    .from("account_code_assignments")
    .delete()
    .eq("item_type", itemType)
    .eq("item_id", itemId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/account-codes");
}

export async function createAccountCode(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/admin/account-codes");

  const supabase = createClient();
  const { data: maxRow } = await supabase
    .from("account_codes")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("account_codes").insert({
    name,
    facility_id: null, // shared across locations, like the seeded set
    sort_order: (maxRow?.sort_order ?? 0) + 10,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/account-codes");
  redirect("/admin/account-codes");
}

export async function renameAccountCode(id: string, formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  if (name) {
    const supabase = createClient();
    const { error } = await supabase.from("account_codes").update({ name }).eq("id", id);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/admin/account-codes");
  redirect("/admin/account-codes");
}

/** Only allowed when empty — otherwise items would silently lose their bucket. */
export async function deleteAccountCode(id: string) {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = createClient();
  const { count } = await supabase
    .from("account_code_assignments")
    .select("id", { count: "exact", head: true })
    .eq("account_code_id", id);

  if ((count ?? 0) > 0) {
    throw new Error("Move its items to another code first — this one isn't empty.");
  }
  const { error } = await supabase.from("account_codes").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/account-codes");
}
