import { createClient } from "@/lib/supabase/server";

export type AnimalHistoryField = "feeding_instructions" | "medications" | "grooming_notes";

export const ANIMAL_HISTORY_FIELD_LABELS: Record<AnimalHistoryField, string> = {
  feeding_instructions: "Eating Notes",
  medications: "Medication Notes",
  grooming_notes: "Grooming Notes",
};

// Logs a before/after for one of the animal fields a parent can edit through
// the pre-check-in form. We apply the parent's submission directly (no
// approval queue), so this history is what lets staff see exactly what
// changed instead of silently losing the old value.
export async function logAnimalFieldChange(
  animalId: string,
  field: AnimalHistoryField,
  oldValue: string | null,
  newValue: string | null,
  changedBy: string
) {
  if ((oldValue ?? "") === (newValue ?? "")) return; // no-op, nothing to log
  const supabase = createClient();
  const { error } = await supabase.from("animal_field_history").insert({
    animal_id: animalId,
    field,
    old_value: oldValue,
    new_value: newValue,
    changed_by: changedBy,
  });
  if (error) console.error("Failed to log animal field history", animalId, field, error.message);
}

export async function getAnimalFieldHistory(animalId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("animal_field_history")
    .select("id, field, old_value, new_value, changed_by, created_at")
    .eq("animal_id", animalId)
    .order("created_at", { ascending: false });
  return data ?? [];
}
