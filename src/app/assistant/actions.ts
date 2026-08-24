"use server";

// Dawg assistant — natural-language booking drafts (design: "Assistant (new)").
// Staff type "book zeus in suite 14 fri through mon, pickup 4pm" and get a
// DRAFT back: nothing is created until they hit Approve, which routes through
// the exact same createReservation the booking form uses.

import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { createReservation } from "@/app/reservations/actions";

export type AssistantDraft = {
  animalId: string;
  animalName: string;
  animalSub: string; // breed · parent
  typeId: string | null;
  typeName: string;
  typeSub: string; // $65 / night
  category: string | null;
  lodgingAreaId: string | null;
  lodgingName: string | null;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  dropOffTime: string; // HH:MM
  pickUpTime: string; // HH:MM
  nights: number;
  isOvernight: boolean;
  estimate: number;
  estimateNote: string | null;
  advisories: { level: "warn" | "alert"; text: string }[];
  sourceText: string;
};

const PT = "America/Los_Angeles";

function todayPT(): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: PT }).format(new Date());
  return new Date(`${ymd}T12:00:00`);
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6,
};

// Next occurrence of a weekday on/after `from` (today counts).
function nextWeekday(from: Date, dow: number, strictlyAfter = false): Date {
  const d = new Date(from);
  let diff = (dow - d.getDay() + 7) % 7;
  if (diff === 0 && strictlyAfter) diff = 7;
  d.setDate(d.getDate() + diff);
  return d;
}

function parseTime(m: RegExpMatchArray | null): string | null {
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2].replace(":", "")) : 0;
  const ampm = (m[3] ?? "").toLowerCase();
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  if (!ampm && h <= 7) h += 12; // "pickup 4" almost certainly means PM
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function parseDayToken(token: string, base: Date, after?: Date): Date | null {
  const t = token.trim().toLowerCase();
  if (t === "today" || t === "tonight") return new Date(base);
  if (t === "tomorrow" || t === "tmrw") {
    const d = new Date(base);
    d.setDate(d.getDate() + 1);
    return d;
  }
  if (t in WEEKDAYS) {
    const from = after ?? base;
    return nextWeekday(from, WEEKDAYS[t], Boolean(after));
  }
  // "aug 22" / "august 22" / "8/22"
  const md = t.match(/^([a-z]{3,9})\s+(\d{1,2})$/);
  if (md) {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const mi = months.findIndex((m) => md[1].startsWith(m));
    if (mi >= 0) {
      const d = new Date(base.getFullYear(), mi, Number(md[2]), 12);
      if (d < base) d.setFullYear(d.getFullYear() + 1);
      return d;
    }
  }
  const slash = t.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (slash) {
    const d = new Date(base.getFullYear(), Number(slash[1]) - 1, Number(slash[2]), 12);
    if (d < base) d.setFullYear(d.getFullYear() + 1);
    return d;
  }
  return null;
}

export async function draftFromText(text: string): Promise<{ draft?: AssistantDraft; error?: string }> {
  const session = await getSession();
  if (!session) return { error: "Not signed in." };
  const supabase = createClient();
  const lower = text.toLowerCase();

  // ---- who -------------------------------------------------------------
  const { data: animals } = await supabase
    .from("animals")
    .select(
      "id, name, breed, alert_note, rabies_expiration, distemper_expiration, bordetella_expiration, parents ( first_name, last_name )"
    )
    .eq("active", true);
  type ARow = {
    id: string;
    name: string;
    breed: string | null;
    alert_note: string | null;
    rabies_expiration: string | null;
    distemper_expiration: string | null;
    bordetella_expiration: string | null;
    parents: { first_name: string; last_name: string } | null;
  };
  const rows = (animals as unknown as ARow[]) ?? [];
  // Longest name match wins ("Zeus Jr" beats "Zeus").
  const matches = rows
    .filter((a) => a.name && new RegExp(`\\b${a.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(lower))
    .sort((a, b) => b.name.length - a.name.length);
  const dog = matches[0];
  if (!dog) {
    return {
      error:
        "I couldn't find a dog by name in that. Try including the dog's name exactly as it's saved — e.g. \"book Bailey Fri through Mon\".",
    };
  }
  if (matches.length > 1 && matches[1].name.toLowerCase() === dog.name.toLowerCase()) {
    const list = matches
      .filter((m) => m.name.toLowerCase() === dog.name.toLowerCase())
      .map((m) => `${m.name} (${m.parents ? `${m.parents.first_name} ${m.parents.last_name}` : "no parent"})`)
      .join(", ");
    return { error: `More than one ${dog.name}: ${list}. Add the parent's last name and I'll match it — or use Open in form.` };
  }

  // ---- what ------------------------------------------------------------
  const { data: types } = await supabase
    .from("reservation_types")
    .select("id, name, category, rate_unit, base_rate, requires_lodging")
    .eq("facility_id", session.facilityId)
    .eq("active", true);
  type TRow = { id: string; name: string; category: string | null; rate_unit: string | null; base_rate: number | null; requires_lodging: boolean | null };
  const trows = (types as unknown as TRow[]) ?? [];
  const wantsDaycare = /\b(daycare|day care|half day|full day)\b/.test(lower);
  const wantsGrooming = /\bgroom/.test(lower);
  let type: TRow | undefined;
  if (wantsGrooming) type = trows.find((t) => t.category === "grooming");
  else if (wantsDaycare) type = trows.find((t) => t.category === "daycare" || /day\s*care|full day/i.test(t.name));
  if (!type) type = trows.find((t) => t.rate_unit === "per_night") ?? trows[0];
  if (!type) return { error: "No reservation types are set up for this facility yet." };
  const isOvernight = type.rate_unit === "per_night";

  // Current rate (rate history first, base_rate fallback — same as checkout).
  const { data: rateRows } = await supabase
    .from("reservation_type_rates")
    .select("rate, effective_date")
    .eq("reservation_type_id", type.id)
    .order("effective_date", { ascending: false });
  const base = todayPT();

  // ---- when ------------------------------------------------------------
  const dayTokenRe =
    "today|tonight|tomorrow|tmrw|sunday|sun|monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat|[a-z]{3,9}\\s+\\d{1,2}|\\d{1,2}\\/\\d{1,2}";
  const rangeRe = new RegExp(`\\b(${dayTokenRe})\\s*(?:through|thru|to|till|until|-|–)\\s*(${dayTokenRe})\\b`, "i");
  const range = lower.match(rangeRe);
  let start: Date | null = null;
  let end: Date | null = null;
  if (range) {
    start = parseDayToken(range[1], base);
    if (start) end = parseDayToken(range[2], base, start);
  } else {
    const single = lower.match(new RegExp(`\\b(${dayTokenRe})\\b`, "i"));
    if (single) start = parseDayToken(single[1], base);
  }
  if (!start) start = new Date(base);
  if (!end) {
    end = new Date(start);
    if (isOvernight) end.setDate(end.getDate() + 1);
  }
  const startYmd = ymd(start);
  const endYmd = ymd(end);
  const nights = Math.max(
    isOvernight ? 1 : 0,
    Math.round((new Date(`${endYmd}T12:00:00`).getTime() - new Date(`${startYmd}T12:00:00`).getTime()) / 86400000)
  );

  const pick = parseTime(lower.match(/pick\s*-?\s*up\s*(?:at\s*|around\s*)?(\d{1,2})(:\d{2})?\s*(am|pm)?/i));
  const drop = parseTime(lower.match(/drop\s*-?\s*off\s*(?:at\s*|around\s*)?(\d{1,2})(:\d{2})?\s*(am|pm)?/i));
  const dropOffTime = drop ?? "09:00";
  const pickUpTime = pick ?? "12:00";

  const rate =
    rateRows && rateRows.length > 0
      ? Number(
          (rateRows.find((r) => String(r.effective_date).slice(0, 10) <= startYmd) ?? rateRows[rateRows.length - 1])
            .rate
        )
      : Number(type.base_rate ?? 0);

  // ---- where -----------------------------------------------------------
  let lodgingAreaId: string | null = null;
  let lodgingName: string | null = null;
  const suiteM = lower.match(/(?:suite|kennel|run|room)\s*#?\s*([a-z0-9]+)/i);
  if (type.requires_lodging || suiteM) {
    const { data: areas } = await supabase
      .from("lodging_areas")
      .select("id, name")
      .eq("facility_id", session.facilityId)
      .eq("active", true);
    if (suiteM && areas) {
      const hit =
        areas.find((a) => a.name.toLowerCase() === `suite ${suiteM[1]}`) ??
        areas.find((a) => a.name.toLowerCase().endsWith(` ${suiteM[1]}`)) ??
        areas.find((a) => a.name.toLowerCase().includes(suiteM[1]));
      if (hit) {
        lodgingAreaId = hit.id;
        lodgingName = hit.name;
      }
    }
  }

  // ---- advisories ------------------------------------------------------
  const advisories: { level: "warn" | "alert"; text: string }[] = [];
  if (isOvernight && pickUpTime > "12:15") {
    const { data: ruleRows } = await supabase
      .from("pricing_rules")
      .select("label, amount, rule_type")
      .eq("facility_id", session.facilityId)
      .eq("rule_type", "flat_fee");
    const late = (ruleRows ?? []).find((r) => /late\s*check[- ]?out/i.test(r.label));
    advisories.push({
      level: "warn",
      text: late
        ? `Pick-up after 12:15 PM adds the $${Number(late.amount).toFixed(0)} late fee at checkout.`
        : "Pick-up is after the 12:15 PM cutoff — the late check-out fee will apply at checkout.",
    });
  }
  const vax: [string, string | null][] = [
    ["Rabies", dog.rabies_expiration],
    ["Distemper", dog.distemper_expiration],
    ["Bordetella", dog.bordetella_expiration],
  ];
  const parentFirst = dog.parents?.first_name ?? "the parent";
  for (const [label, exp] of vax) {
    if (!exp) continue;
    const e = String(exp).slice(0, 10);
    const nice = new Date(`${e}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric" });
    if (e < startYmd) advisories.push({ level: "alert", text: `${label} expired ${nice}. Ask ${parentFirst} for an updated record before this stay.` });
    else if (e <= endYmd) advisories.push({ level: "alert", text: `${label} expires ${nice} — mid-stay. Ask ${parentFirst} for an updated record.` });
  }
  if (dog.alert_note) advisories.push({ level: "alert", text: `❗ ${dog.alert_note}` });

  // ---- estimate --------------------------------------------------------
  const units = isOvernight ? nights : 1;
  let estimate = rate * units;
  let estimateNote: string | null = null;
  const { data: mdRules } = await supabase
    .from("pricing_rules")
    .select("label, amount, method, threshold, rule_type")
    .eq("facility_id", session.facilityId)
    .eq("rule_type", "multi_day_discount");
  const eligible = (mdRules ?? [])
    .filter((r) => units >= (r.threshold ?? Infinity))
    .sort((a, b) => (b.threshold ?? 0) - (a.threshold ?? 0))[0];
  if (eligible) {
    const disc = eligible.method === "percent" ? estimate * (Number(eligible.amount) / 100) : Number(eligible.amount);
    estimate += disc; // discount amounts are stored negative
    estimateNote = eligible.label;
  }

  return {
    draft: {
      animalId: dog.id,
      animalName: dog.name,
      animalSub: [dog.breed, dog.parents ? `${dog.parents.first_name} ${dog.parents.last_name}` : null]
        .filter(Boolean)
        .join(" · "),
      typeId: type.id,
      typeName: type.name,
      typeSub: `$${rate.toFixed(0)} / ${isOvernight ? "night" : "day"}`,
      category: type.category,
      lodgingAreaId,
      lodgingName,
      startDate: startYmd,
      endDate: endYmd,
      dropOffTime,
      pickUpTime,
      nights: units,
      isOvernight,
      estimate: Math.round(estimate * 100) / 100,
      estimateNote,
      advisories,
      sourceText: text,
    },
  };
}

export async function approveDraft(draft: AssistantDraft): Promise<{ reservationId: string }> {
  const session = await getSession();
  if (!session) throw new Error("Not signed in.");
  // Approving records it with an author — the change shows in Notes History
  // as "<staff> · assistant draft", never as an anonymous robot edit.
  const { reservationId } = await createReservation({
    facilityId: session.facilityId,
    animalId: draft.animalId,
    reservationTypeId: draft.typeId,
    lodgingAreaId: draft.lodgingAreaId,
    startDate: draft.startDate,
    startTime: draft.dropOffTime || null,
    endDate: draft.isOvernight || draft.endDate !== draft.startDate ? draft.endDate : draft.startDate,
    endTime: draft.pickUpTime || null,
    durationMinutes: null,
    specialistId: null,
    serviceName: null,
    belongings: null,
    notes: `Assistant draft: "${draft.sourceText}"`,
    bookingGroupId: null,
    performedBy: `${session.staffName ?? "Staff"} · assistant draft`,
  });
  return { reservationId };
}
