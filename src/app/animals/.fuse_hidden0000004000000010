"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

function str(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : null;
}

function num(formData: FormData, key: string): number | null {
  const s = str(formData, key);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function bool(formData: FormData, key: string): boolean {
  return formData.get(key) === "on";
}

export async function createAnimal(formData: FormData) {
  const supabase = createClient();

  const name = str(formData, "name");
  const parent_id = str(formData, "parent_id");
  if (!name || !parent_id) {
    const params = new URLSearchParams({ error: "missing_required" });
    if (parent_id) params.set("parent_id", parent_id);
    redirect(`/animals/new?${params.toString()}`);
  }

  const { data, error } = await supabase
    .from("animals")
    .insert({
      parent_id,
      name,
      species: str(formData, "species") ?? "dog",
      breed: str(formData, "breed"),
      size: str(formData, "size"),
      weight_lbs: num(formData, "weight_lbs"),
      birthdate: str(formData, "birthdate"),
      sex: str(formData, "sex"),
      fixed: formData.get("fixed") ? bool(formData, "fixed") : null,
      color_markings: str(formData, "color_markings"),
      owned_since_note: str(formData, "owned_since_note"),
      vet_name: str(formData, "vet_name"),
      vet_phone: str(formData, "vet_phone"),
      vaccination_expiry: str(formData, "vaccination_expiry"),
      medical_notes: str(formData, "medical_notes"),
      behavioral_notes: str(formData, "behavioral_notes"),
      feeding_instructions: str(formData, "feeding_instructions"),
      medications: str(formData, "medications"),
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect(`/animals/new?parent_id=${parent_id}&error=${encodeURIComponent(error?.message ?? "unknown")}`);
  }

  revalidatePath("/animals");
  revalidatePath(`/parents/${parent_id}`);
  redirect(`/animals/${data!.id}`);
}

export async function updateAnimal(animalId: string, formData: FormData) {
  const supabase = createClient();

  const name = str(formData, "name");
  if (!name) {
    redirect(`/animals/${animalId}?error=missing_required`);
  }

  const { data: current } = await supabase
    .from("animals")
    .select("parent_id")
    .eq("id", animalId)
    .single();

  const { error } = await supabase
    .from("animals")
    .update({
      name,
      species: str(formData, "species") ?? "dog",
      breed: str(formData, "breed"),
      size: str(formData, "size"),
      weight_lbs: num(formData, "weight_lbs"),
      birthdate: str(formData, "birthdate"),
      sex: str(formData, "sex"),
      fixed: formData.get("fixed") ? bool(formData, "fixed") : null,
      color_markings: str(formData, "color_markings"),
      owned_since_note: str(formData, "owned_since_note"),
      vet_name: str(formData, "vet_name"),
      vet_phone: str(formData, "vet_phone"),
      vaccination_expiry: str(formData, "vaccination_expiry"),
      medical_notes: str(formData, "medical_notes"),
      behavioral_notes: str(formData, "behavioral_notes"),
      feeding_instructions: str(formData, "feeding_instructions"),
      medications: str(formData, "medications"),
      active: bool(formData, "active"),
    })
    .eq("id", animalId);

  if (error) {
    redirect(`/animals/${animalId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/animals");
  revalidatePath(`/animals/${animalId}`);
  if (current?.parent_id) revalidatePath(`/parents/${current.parent_id}`);
  redirect(`/animals/${animalId}`);
}
