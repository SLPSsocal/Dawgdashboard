"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Public — no session/login required. This is reached only via a
// unguessable token link texted/emailed to a specific parent.
export async function signWaiver(token: string, formData: FormData) {
  const supabase = createClient();
  const typedName = String(formData.get("typed_name") ?? "").trim();
  const agree = formData.get("agree") === "on";

  if (!typedName || !agree) {
    redirect(`/sign/${token}?error=missing`);
  }

  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  const ip = fwd ? fwd.split(",")[0].trim() : "0.0.0.0";

  const { error } = await supabase
    .from("waiver_signatures")
    .update({
      status: "signed",
      signed_at: new Date().toISOString(),
      signature_typed_name: typedName,
      ip_address: ip,
    })
    .eq("token", token);

  if (error) redirect(`/sign/${token}?error=${encodeURIComponent(error.message)}`);

  redirect(`/sign/${token}`);
}
