"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

function str(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : null;
}

function bool(formData: FormData, key: string): boolean {
  return formData.get(key) === "on";
}

function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length ? digits : null;
}

function normalizeEmail(email: string | null): string | null {
  return email ? email.trim().toLowerCase() : null;
}

// Checks the existing parents table for a phone or email match (normalized
// so formatting differences like "(555) 123-4567" vs "5551234567" still
// catch a duplicate) — excludes excludeId so editing an existing parent
// doesn't flag itself as a dupe of itself.
async function findDuplicateParent(
  supabase: ReturnType<typeof createClient>,
  phone: string | null,
  email: string | null,
  excludeId?: string
): Promise<boolean> {
  const normPhone = normalizePhone(phone);
  const normEmail = normalizeEmail(email);
  if (!normPhone && !normEmail) return false;

  let query = supabase.from("parents").select("id, phone, email");
  if (excludeId) query = query.neq("id", excludeId);
  const { data } = await query;

  return (data ?? []).some((p) => {
    const pPhone = normalizePhone(p.phone);
    const pEmail = normalizeEmail(p.email);
    return (normPhone && pPhone === normPhone) || (normEmail && pEmail === normEmail);
  });
}

export async function createParent(formData: FormData) {
  const supabase = createClient();

  const first_name = str(formData, "first_name");
  const last_name = str(formData, "last_name");
  const email = str(formData, "email");
  const phone = str(formData, "phone");
  const referral_source = str(formData, "referral_source");
  const emergency_contact_name = str(formData, "emergency_contact_name");
  const emergency_contact_phone = str(formData, "emergency_contact_phone");
  if (
    !first_name ||
    !last_name ||
    !email ||
    !phone ||
    !referral_source ||
    !emergency_contact_name ||
    !emergency_contact_phone
  ) {
    redirect("/parents/new?error=missing_required");
  }

  if (await findDuplicateParent(supabase, phone, email)) {
    redirect("/parents/new?error=duplicate");
  }

  const { data, error } = await supabase
    .from("parents")
    .insert({
      first_name,
      last_name,
      email,
      phone,
      address: str(formData, "address"),
      emergency_contact_name,
      emergency_contact_phone,
      emergency_contact_2_name: str(formData, "emergency_contact_2_name"),
      emergency_contact_2_phone: str(formData, "emergency_contact_2_phone"),
      referral_source,
      social_media_handle: str(formData, "social_media_handle"),
      notes: str(formData, "notes"),
      email_opt_out: bool(formData, "email_opt_out"),
      sms_opt_out: bool(formData, "sms_opt_out"),
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
  const email = str(formData, "email");
  const phone = str(formData, "phone");
  const referral_source = str(formData, "referral_source");
  const emergency_contact_name = str(formData, "emergency_contact_name");
  const emergency_contact_phone = str(formData, "emergency_contact_phone");
  if (
    !first_name ||
    !last_name ||
    !email ||
    !phone ||
    !referral_source ||
    !emergency_contact_name ||
    !emergency_contact_phone
  ) {
    redirect(`/parents/${parentId}?error=missing_required`);
  }

  if (await findDuplicateParent(supabase, phone, email, parentId)) {
    redirect(`/parents/${parentId}?error=duplicate`);
  }

  const { error } = await supabase
    .from("parents")
    .update({
      first_name,
      last_name,
      email,
      phone,
      address: str(formData, "address"),
      emergency_contact_name,
      emergency_contact_phone,
      emergency_contact_2_name: str(formData, "emergency_contact_2_name"),
      emergency_contact_2_phone: str(formData, "emergency_contact_2_phone"),
      referral_source,
      social_media_handle: str(formData, "social_media_handle"),
      notes: str(formData, "notes"),
      email_opt_out: bool(formData, "email_opt_out"),
      sms_opt_out: bool(formData, "sms_opt_out"),
    })
    .eq("id", parentId);

  if (error) {
    redirect(`/parents/${parentId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/parents");
  revalidatePath(`/parents/${parentId}`);
  redirect(`/parents/${parentId}`);
}
