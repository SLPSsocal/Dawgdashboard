import { createClient } from "@/lib/supabase/server";

// Each facility runs its own separate Helcim account, so a saved card and
// every charge must go through the token that matches the facility it
// belongs to — never a shared/global token.
const FACILITY_ENV_VAR: Record<string, string> = {
  how: "HELCIM_API_TOKEN_HOW",
  dd: "HELCIM_API_TOKEN_DD",
  fpi: "HELCIM_API_TOKEN_FPI",
  rw: "HELCIM_API_TOKEN_RW",
};

export async function getFacilitySlug(facilityId: string): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.from("facilities").select("slug").eq("id", facilityId).single();
  if (error || !data) throw new Error(`Could not resolve facility ${facilityId}`);
  return data.slug as string;
}

export function getHelcimToken(facilitySlug: string): string {
  const envVar = FACILITY_ENV_VAR[facilitySlug];
  const token = envVar ? process.env[envVar] : undefined;
  if (!token) {
    throw new Error(
      `No Helcim API token configured for facility "${facilitySlug}" (expected env var ${envVar ?? "?"}).`
    );
  }
  return token;
}

export async function getHelcimTokenForFacility(facilityId: string): Promise<string> {
  const slug = await getFacilitySlug(facilityId);
  return getHelcimToken(slug);
}
