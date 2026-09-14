"use server";

// Public lead intake for the marketing sites (dondoggos.com contact form).
// No session required — this is the one write an anonymous visitor can make.
// Everything lands in the /leads inbox (new → contacted → converted/closed).

import { createClient } from "@/lib/supabase/server";

export type InquiryState = { ok: boolean; error: string | null };

const MAX = 500;
const clean = (v: FormDataEntryValue | null, max = MAX) =>
  String(v ?? "")
    .trim()
    .slice(0, max) || null;

export async function submitInquiry(_prev: InquiryState, formData: FormData): Promise<InquiryState> {
  // Honeypot: real visitors never fill this hidden field; bots do.
  if (String(formData.get("company") ?? "").trim() !== "") {
    return { ok: true, error: null }; // pretend success, save nothing
  }

  const fullName = clean(formData.get("full_name"), 120) ?? "";
  const [first, ...rest] = fullName.split(/\s+/);
  const email = clean(formData.get("email"), 200);
  const phone = clean(formData.get("phone"), 40);
  const petNames = clean(formData.get("pet_names"), 200);
  const petBreed = clean(formData.get("pet_breed"), 200);
  const message = clean(formData.get("message"), 2000);
  const returning = String(formData.get("returning_client") ?? "");
  const services = formData
    .getAll("services")
    .map((s) => String(s).slice(0, 60))
    .filter(Boolean);
  const facilitySlug = clean(formData.get("facility"), 20) ?? "dd";
  const source = clean(formData.get("source"), 80) ?? "website";

  if (!first) return { ok: false, error: "Please tell us your name." };
  if (!email && !phone) return { ok: false, error: "Please add a phone number or email so we can reach you." };

  const supabase = createClient();
  const { data: facility } = await supabase
    .from("facilities")
    .select("id")
    .eq("slug", facilitySlug)
    .maybeSingle();
  if (!facility) return { ok: false, error: "Something went wrong — please call us instead." };

  const { error } = await supabase.from("leads").insert({
    facility_id: facility.id,
    first_name: first,
    last_name: rest.join(" ") || null,
    email,
    phone,
    pet_names: petNames,
    pet_breed: petBreed,
    notes: message,
    returning_client: returning === "yes" ? true : returning === "no" ? false : null,
    services_interested: services.length ? services : null,
    source: `website:${source}`,
    status: "new",
  });
  if (error) return { ok: false, error: "Something went wrong — please call us instead." };

  return { ok: true, error: null };
}
