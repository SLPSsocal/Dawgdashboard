import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { setSession } from "@/lib/session";

// Dedicated QA/agent access route. A single GET request — no JS, no form,
// no multi-step click flow — authenticates and lands the caller in the app
// exactly the way a normal facility-picker login would, so every other page
// in the app treats it as an ordinary staff session (dawg_session cookie)
// and needs zero special-casing. This is what makes "direct navigation to
// any internal page" and "no redirect loop through /login" work for free.
//
// Safety properties:
// - Off by default: if QA_ACCESS_TOKEN isn't set in the environment, the
//   route 404s as if it doesn't exist.
// - Token is compared with a constant-time check, never logged, and never
//   committed to the repo.
// - The facility is always the one pinned by QA_FACILITY_SLUG server-side —
//   the `facility` query param is cosmetic only and cannot be used to log
//   into a different, non-QA facility.
// - `redirect` must be a same-origin relative path (never an absolute URL
//   or protocol-relative "//..."), so this can't be turned into an open
//   redirect that ships the session cookie off-site.
export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Compare against itself anyway so a length mismatch doesn't return
    // measurably faster than a same-length wrong guess.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

// Resolve the candidate against the real request origin and compare origins,
// rather than pattern-matching the string. String checks are not sufficient:
// the URL parser treats "\" as "/" for http(s), so "/\evil.com" survives a
// naive startsWith("/") + startsWith("//") + includes("://") filter and then
// resolves to https://evil.com/.
function safeRedirectUrl(raw: string | null, requestUrl: string): URL {
  const fallback = new URL("/reservations", requestUrl);
  if (!raw) return fallback;
  let target: URL;
  try {
    target = new URL(raw, requestUrl);
  } catch {
    return fallback;
  }
  return target.origin === new URL(requestUrl).origin ? target : fallback;
}

export async function GET(request: NextRequest) {
  const configuredToken = process.env.QA_ACCESS_TOKEN;
  if (!configuredToken) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const suppliedToken = searchParams.get("token") ?? "";

  if (!safeEqual(suppliedToken, configuredToken)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const facilitySlug = process.env.QA_FACILITY_SLUG || "dd";

  const supabase = createClient();
  const { data: facility, error } = await supabase
    .from("facilities")
    .select("id, name, slug")
    .eq("slug", facilitySlug)
    .maybeSingle();

  if (error || !facility) {
    return new NextResponse("QA facility not configured", { status: 500 });
  }

  await setSession({
    staffId: "",
    staffName: "QA Agent",
    facilityId: facility.id,
    facilitySlug: facility.slug,
    facilityName: facility.name,
    isQa: true,
  });

  const target = safeRedirectUrl(searchParams.get("redirect"), request.url);
  const response = NextResponse.redirect(target);
  // Belt-and-braces: a 307 carrying Set-Cookie is already non-cacheable by
  // spec and by Vercel's edge, but state it explicitly.
  response.headers.set("Cache-Control", "no-store, private");
  return response;
}
