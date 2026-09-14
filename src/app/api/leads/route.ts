import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Webhook intake for website leads forwarded from the agency's GoHighLevel
// (LeadConnector) workflow — the site's "Request A Callback" form keeps
// feeding the agency CRM exactly as configured, and GHL POSTs a copy here so
// the same lead also lands in the dashboard's /leads inbox.
//
// Auth: ?key=<LEADS_WEBHOOK_KEY> (env). Payload shape from GHL varies with
// the workflow config, so mapping is deliberately liberal: known keys map to
// columns, everything else is preserved in notes so no field is ever lost.

export const dynamic = "force-dynamic";

type Dict = Record<string, unknown>;

const s = (v: unknown, max = 300) =>
  (typeof v === "string" || typeof v === "number" ? String(v).trim().slice(0, max) : "") || null;

function pick(body: Dict, re: RegExp): unknown {
  for (const [k, v] of Object.entries(body)) {
    if (re.test(k) && v != null && v !== "") return v;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const expected = process.env.LEADS_WEBHOOK_KEY;
  if (!expected) return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  const key = req.nextUrl.searchParams.get("key") ?? req.headers.get("x-webhook-key");
  if (key !== expected) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: Dict;
  try {
    const ct = req.headers.get("content-type") ?? "";
    body = ct.includes("json")
      ? ((await req.json()) as Dict)
      : Object.fromEntries((await req.formData()).entries());
  } catch {
    return NextResponse.json({ error: "unreadable payload" }, { status: 400 });
  }
  // GHL sometimes nests the contact under customData / contact / body.
  for (const nest of ["contact", "customData", "body"]) {
    const inner = body[nest];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) body = { ...(inner as Dict), ...body };
  }

  const fullName = s(body.full_name ?? body.fullName ?? body.name, 120);
  let first = s(body.first_name ?? body.firstName, 60);
  let last = s(body.last_name ?? body.lastName, 60);
  if (!first && fullName) {
    const parts = fullName.split(/\s+/);
    first = parts[0] ?? null;
    last = parts.slice(1).join(" ") || null;
  }
  const email = s(body.email, 200);
  const phone = s(body.phone ?? pick(body, /phone/i), 40);
  const petNames = s(pick(body, /pet.*name|pets?\b/i), 200);
  const petBreed = s(pick(body, /breed/i), 200);
  const message = s(pick(body, /message|comment|information|request|notes/i), 1500);
  const servicesRaw = pick(body, /service|interested/i);
  const services = Array.isArray(servicesRaw)
    ? servicesRaw.map((x) => String(x).slice(0, 60)).filter(Boolean)
    : typeof servicesRaw === "string" && servicesRaw
      ? servicesRaw.split(/\s*[,;]\s*/).map((x) => x.slice(0, 60)).filter(Boolean)
      : null;
  const returningRaw = String(pick(body, /returning|visited|new.?client/i) ?? "").toLowerCase();
  const returning = /yes|returning|true/.test(returningRaw) ? true : /no|new|false/.test(returningRaw) ? false : null;

  if (!first && !email && !phone) {
    return NextResponse.json({ error: "no usable contact fields" }, { status: 422 });
  }

  // Anything we didn't map gets appended to notes, so a renamed GHL field
  // degrades to "visible in notes" instead of silently vanishing.
  const mappedKeys = /first_?name|last_?name|full_?name|^name$|email|phone|pet|breed|message|comment|information|request|notes|service|interested|returning|visited|contact|customData|body|location|workflow|attribution|timestamp|date_created|id$/i;
  const extras = Object.entries(body)
    .filter(([k, v]) => !mappedKeys.test(k) && (typeof v === "string" || typeof v === "number") && String(v).trim())
    .map(([k, v]) => `${k}: ${String(v).slice(0, 120)}`)
    .slice(0, 10);
  const notes = [message, extras.length ? `— ${extras.join(" · ")}` : null].filter(Boolean).join("\n") || null;

  const facilitySlug = req.nextUrl.searchParams.get("facility") ?? "dd";
  const supabase = createClient();
  const { data: facility } = await supabase.from("facilities").select("id").eq("slug", facilitySlug).maybeSingle();
  if (!facility) return NextResponse.json({ error: "unknown facility" }, { status: 422 });

  const { error } = await supabase.from("leads").insert({
    facility_id: facility.id,
    first_name: first,
    last_name: last,
    email,
    phone,
    pet_names: petNames,
    pet_breed: petBreed,
    notes,
    returning_client: returning,
    services_interested: services,
    source: `website:${req.nextUrl.searchParams.get("source") ?? "ghl-webhook"}`,
    status: "new",
  });
  if (error) return NextResponse.json({ error: "insert failed" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
