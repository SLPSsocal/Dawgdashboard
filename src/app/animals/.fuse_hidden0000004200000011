"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function setAnimalPhoto(animalId: string, photoUrl: string) {
  const supabase = createClient();
  const { error } = await supabase.from("animals").update({ photo_url: photoUrl }).eq("id", animalId);
  if (error) throw new Error(error.message);
  revalidatePath(`/animals/${animalId}`);
  revalidatePath("/animals");
  revalidatePath("/reservations");
}
