"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

function str(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : null;
}

export async function createParent(formData: FormData) {
  const supabase = createClient();

  const first_name = str(formData, "first_name");
  const last_name = str(formData, "last_name");
  if (!first_name || !last_name) {
    redirect("/parents/new?error=missing_name");
  }

  const { data, error } = await supabase
    .from("parents")
    .insert({
      first_name,
      last_name,
      email: str(formData, "email"),
      phone: str(formData, "phone"),
      address: str(formData, "address"),
      emergency_contact_name: str(formData, "emergency_contact_name"),
      emergency_contact_phone: str(formData, "emergency_contact_phone"),
      referral_source: str(formData, "referral_source"),
      social_media_handle: str(formData, "social_media_handle"),
      notes: str(formData, "notes"),
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect(`/parents/new?error=${encodeURIComponent(error?.message ?? "unknown")}`);
  }

  revalidatePath("/parents");
  redirect(`/parents/${data!.id}`);
}

export async function updateParent(parentId: string, formData: FormData) {
  const supabase = createClient();

  const first_name = str(formData, "first_name");
  const last_name = str(formData, "last_name");
  if (!first_name || !last_name) {
    redirect(`/parents/${parentId}?error=missing_name`);
  }

  const { error } = await supabase
    .from("parents")
    .update({
      first_name,
      last_name,
      email: str(formData, "email"),
      phone: str(formData, "phone"),
      address: str(formData, "address"),
      emergency_contact_name: str(formData, "emergency_contact_name"),
      emergency_contact_phone: str(formData, "emergency_contact_phone"),
      referral_source: str(formData, "referral_source"),
      social_media_handle: str(formData, "social_media_handle"),
      notes: str(formData, "notes"),
    })
    .eq("id", parentId);

  if (error) {
    redirect(`/parents/${parentId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/parents");
  revalidatePath(`/parents/${parentId}`);
  redirect(`/parents/${parentId}`);
}
