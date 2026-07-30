"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function refresh(targetType: "animal" | "parent", targetId: string) {
  revalidatePath(`/${targetType}s/${targetId}`);
  revalidatePath(`/${targetType}s`);
  revalidatePath("/reservations");
  revalidatePath("/profile-tags");
}

export async function assignProfileTag(
  targetType: "animal" | "parent",
  targetId: string,
  formData: FormData
) {
  const tagId = String(formData.get("tag_id") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  const createdBy = String(formData.get("created_by") ?? "") || null;
  if (!tagId) return;

  const supabase = createClient();
  const { error } = await supabase.from("profile_tag_assignments").insert({
    tag_id: tagId,
    target_type: targetType,
    target_id: targetId,
    note,
    created_by: createdBy,
  });
  if (error) throw new Error(error.message);
  refresh(targetType, targetId);
}

export async function removeProfileTagAssignment(
  targetType: "animal" | "parent",
  targetId: string,
  assignmentId: string
) {
  const supabase = createClient();
  const { error } = await supabase.from("profile_tag_assignments").delete().eq("id", assignmentId);
  if (error) throw new Error(error.message);
  refresh(targetType, targetId);
}

// Catalog admin — matches the Referral Sources pattern: soft-retire, never
// hard-delete, so historical assignments keep their icon/name even if a tag
// gets retired later.
export async function createProfileTag(formData: FormData) {
  const applies_to = String(formData.get("applies_to") ?? "animal");
  const icon = String(formData.get("icon") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  if (!icon || !name) return;

  const supabase = createClient();
  const { error } = await supabase.from("profile_tags").insert({ applies_to, icon, name, description });
  if (error) throw new Error(error.message);
  revalidatePath("/profile-tags");
}

export async function setProfileTagActive(tagId: string, active: boolean) {
  const supabase = createClient();
  const { error } = await supabase.from("profile_tags").update({ active }).eq("id", tagId);
  if (error) throw new Error(error.message);
  revalidatePath("/profile-tags");
}
