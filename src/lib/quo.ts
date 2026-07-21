import { createClient } from "@/lib/supabase/server";

// Quo (formerly OpenPhone) SMS sending. Not wired up with real API keys yet
// — each facility gets its own Quo number + key, the same per-facility
// pattern already used for Helcim (HELCIM_API_TOKEN_<SLUG> env vars). Once
// a facility's QUO_API_KEY_<SLUG> is set and its quo_phone_number is filled
// in, this starts actually sending with no other code changes needed.
function envKeyForSlug(slug: string) {
  return `QUO_API_KEY_${slug.toUpperCase()}`;
}

export async function sendQuoSms(
  facilityId: string,
  toPhone: string,
  body: string
): Promise<{ sent: boolean; reason?: string }> {
  const supabase = createClient();
  const { data: facility } = await supabase
    .from("facilities")
    .select("slug, quo_phone_number")
    .eq("id", facilityId)
    .maybeSingle();
  if (!facility) return { sent: false, reason: "Facility not found" };

  const apiKey = process.env[envKeyForSlug(facility.slug)];
  if (!apiKey || !facility.quo_phone_number) {
    return { sent: false, reason: "Texting isn't connected for this facility yet" };
  }
  if (!toPhone) return { sent: false, reason: "No phone number on file" };

  try {
    const res = await fetch("https://api.quo.com/v1/messages", {
      method: "POST",
      headers: { Authorization: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ from: facility.quo_phone_number, to: [toPhone], content: body }),
    });
    if (!res.ok) return { sent: false, reason: `Quo error (${res.status})` };
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : "Network error" };
  }
}
