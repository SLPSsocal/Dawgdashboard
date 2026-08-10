// ============================================================================
// Grooming price estimation — shared by the help-widget chat estimator and
// any booking-flow hints.
//
// Two layers, in priority order:
//   1. Remembered price — what THIS dog was actually charged for THIS service
//      last time (grooming_service_prices). Always wins when present.
//   2. Historical model — blended ranges derived from ~4,400 real grooms
//      across Don Doggos, Riverwalk, and House of Woof Airtable records
//      (analyzed Aug 2026). Used for new dogs / new services.
// Add-on prices are shop defaults (rarely itemized in historical data).
// ============================================================================

export type Size = "S" | "M" | "L" | "XL";
export type CoatType = "double" | "curly" | "short" | "long" | "wiry";

export const SIZE_LABEL: Record<Size, string> = { S: "small", M: "medium", L: "large", XL: "x-large" };

// Blended base ranges [lo, hi] from actual billed history, by service & size.
export const BASE_PRICE: Record<"bath" | "groom", Record<Size, [number, number]>> = {
  bath: { S: [40, 60], M: [50, 80], L: [70, 110], XL: [90, 125] },
  groom: { S: [60, 80], M: [70, 95], L: [95, 135], XL: [130, 165] },
};

export const ADDONS: Record<string, { price: number; label: string }> = {
  nail: { price: 15, label: "Nail trim / dremel" },
  teeth: { price: 10, label: "Teeth brushing" },
  ear: { price: 12, label: "Ear cleaning" },
  gland: { price: 15, label: "Gland expression" },
  deshed: { price: 18, label: "De-shed / Furminator" },
  flea: { price: 15, label: "Flea bath" },
  medshampoo: { price: 12, label: "Medicated shampoo" },
  sani: { price: 12, label: "Sanitary trim" },
};

export const DEMATT: Record<"light" | "moderate" | "severe", number> = { light: 15, moderate: 30, severe: 50 };

// breed keyword -> [size, coat]
const D: CoatType = "double";
const C: CoatType = "curly";
export const BREEDS: Record<string, [Size, CoatType]> = {
  yorkie: ["S", C], yorkshire: ["S", C], maltese: ["S", C], "shih tzu": ["S", C], shihtzu: ["S", C],
  chihuahua: ["S", "short"], pomeranian: ["S", D], pom: ["S", D], papillon: ["S", "long"],
  "toy poodle": ["S", C], "mini poodle": ["S", C], "miniature poodle": ["S", C], havanese: ["S", C],
  bichon: ["S", C], pug: ["S", "short"], dachshund: ["S", "short"], doxie: ["S", "short"],
  boston: ["S", "short"], lhasa: ["S", C], cavalier: ["S", "long"], "french bulldog": ["S", "short"],
  frenchie: ["S", "short"], cockapoo: ["S", C], morkie: ["S", C], malshi: ["S", C], shorkie: ["S", C],
  westie: ["S", "wiry"], cairn: ["S", "wiry"], maltipoo: ["S", C],
  beagle: ["M", "short"], corgi: ["M", D], cocker: ["M", "long"], "cocker spaniel": ["M", "long"],
  sheltie: ["M", D], "mini schnauzer": ["S", "wiry"], "miniature schnauzer": ["S", "wiry"],
  schnauzer: ["M", "wiry"], "border collie": ["M", D], "australian shepherd": ["M", D], aussie: ["M", D],
  whippet: ["M", "short"], pit: ["M", "short"], pitbull: ["M", "short"], "pit bull": ["M", "short"],
  bulldog: ["M", "short"], basset: ["M", "short"], wheaten: ["M", C], vizsla: ["M", "short"],
  brittany: ["M", "long"], springer: ["M", "long"], "mini goldendoodle": ["M", C], "mini doodle": ["M", C],
  golden: ["L", D], "golden retriever": ["L", D], goldendoodle: ["L", C], doodle: ["L", C],
  labrador: ["L", "short"], lab: ["L", "short"], retriever: ["L", D], "german shepherd": ["L", D],
  gsd: ["L", D], husky: ["L", D], "siberian husky": ["L", D], boxer: ["L", "short"],
  doberman: ["L", "short"], dalmatian: ["L", "short"], "standard poodle": ["L", C], bernedoodle: ["L", C],
  aussiedoodle: ["L", C], labradoodle: ["L", C], samoyed: ["L", D], chow: ["L", D],
  weimaraner: ["L", "short"], collie: ["L", D], pointer: ["L", "short"], shepherd: ["L", D],
  "great pyrenees": ["XL", D], pyrenees: ["XL", D], newfoundland: ["XL", D], newfie: ["XL", D],
  "saint bernard": ["XL", D], "st bernard": ["XL", D], mastiff: ["XL", "short"], "great dane": ["XL", "short"],
  bernese: ["XL", D], sheepadoodle: ["XL", C], malamute: ["XL", D], leonberger: ["XL", D],
};

export function classifyBreed(breedText: string | null | undefined): { size: Size | null; coat: CoatType | null; matched: string | null } {
  const t = ` ${(breedText ?? "").toLowerCase()} `;
  for (const k of Object.keys(BREEDS).sort((a, b) => b.length - a.length)) {
    if (t.includes(` ${k} `) || t.includes(` ${k}s `) || t.includes(k)) {
      const [size, coat] = BREEDS[k];
      return { size, coat, matched: k };
    }
  }
  return { size: null, coat: null, matched: null };
}

export function sizeFromWeight(lbs: number): Size {
  return lbs < 15 ? "S" : lbs < 40 ? "M" : lbs < 70 ? "L" : "XL";
}

export type ParsedRequest = {
  svc: "bath" | "groom" | null;
  size: Size | null;
  coat: CoatType | null;
  breed: string | null;
  addons: string[];
  dematt: "light" | "moderate" | "severe" | null;
};

export function parseRequest(raw: string): ParsedRequest {
  const t = " " + raw.toLowerCase().replace(/[,.]/g, " ") + " ";
  const { size: bSize, coat, matched } = classifyBreed(t);
  let size = bSize;

  const w = t.match(/(\d{1,3})\s*(?:lb|lbs|pound)/);
  if (w) size = sizeFromWeight(Number(w[1]));
  if (/\b(x-?large|xl|extra large|giant)\b/.test(t)) size = "XL";
  else if (/\blarge\b/.test(t)) size = size ?? "L";
  else if (/\bmedium\b/.test(t)) size = size ?? "M";
  else if (/\bsmall\b|\btiny\b/.test(t)) size = size ?? "S";

  let svc: ParsedRequest["svc"] = null;
  if (/full groom|haircut|hair cut|\bcut\b|shave|trim down|clip/.test(t)) svc = "groom";
  else if (/bath|wash|tidy/.test(t)) svc = "bath";

  const addons: string[] = [];
  if (/nail|dremel/.test(t)) addons.push("nail");
  if (/teeth|dental/.test(t)) addons.push("teeth");
  if (/\bear\b|ears/.test(t)) addons.push("ear");
  if (/gland|express/.test(t)) addons.push("gland");
  if (/furminat|de-?shed|deshed|blow ?out/.test(t)) addons.push("deshed");
  if (/flea/.test(t)) addons.push("flea");
  if (/medicated|oatmeal|itch/.test(t)) addons.push("medshampoo");
  if (/sanitary|\bsani\b/.test(t)) addons.push("sani");

  let dematt: ParsedRequest["dematt"] = null;
  if (/de-?matt|dematt|matted|matting|\bmats\b|knots|pelted/.test(t)) {
    dematt = /severe|bad|heavy|pelted/.test(t) ? "severe" : /moderate|some/.test(t) ? "moderate" : "light";
  }
  return { svc, size, coat, breed: matched, addons, dematt };
}

export type QuoteLine = { label: string; amount: string };
export type QuoteFlag = { kind: "rec" | "warn"; text: string };
export type Quote = {
  lo: number;
  hi: number;
  lines: QuoteLine[];
  flags: QuoteFlag[];
  assumptions: string[];
  basis: "remembered" | "menu" | "model";
};

// remembered: what this exact dog paid for this service last time (wins).
// menuRange: this facility's configured [min,max] for the service, if set.
export function buildQuote(
  p: ParsedRequest,
  opts: { remembered?: number | null; menuRange?: [number, number] | null; dogName?: string | null } = {}
): Quote {
  const assumptions: string[] = [];
  const svc = p.svc ?? (p.addons.length && !p.dematt ? "bath" : "groom");
  if (!p.svc) assumptions.push(`assumed ${svc === "groom" ? "full groom" : "bath & tidy"}`);
  const size = p.size ?? "M";
  if (!p.size && !opts.remembered) assumptions.push("assumed medium size — give a breed or weight to sharpen");

  let baseLo: number, baseHi: number;
  let basis: Quote["basis"];
  if (opts.remembered != null) {
    baseLo = baseHi = opts.remembered;
    basis = "remembered";
  } else if (opts.menuRange) {
    [baseLo, baseHi] = opts.menuRange;
    basis = "menu";
  } else {
    [baseLo, baseHi] = BASE_PRICE[svc][size];
    basis = "model";
  }

  const svcLabel = svc === "groom" ? "Full groom / haircut" : "Bath & tidy";
  const lines: QuoteLine[] = [
    {
      label:
        basis === "remembered"
          ? `${svcLabel} — ${opts.dogName ?? "this dog"}'s last charged price`
          : `${svcLabel} (${SIZE_LABEL[size]})`,
      amount: baseLo === baseHi ? `$${baseLo}` : `$${baseLo}–$${baseHi}`,
    },
  ];
  let lo = baseLo, hi = baseHi;
  for (const id of p.addons) {
    const a = ADDONS[id];
    if (!a) continue;
    lo += a.price; hi += a.price;
    lines.push({ label: `+ ${a.label}`, amount: `$${a.price}` });
  }
  if (p.dematt) {
    const d = DEMATT[p.dematt];
    lo += d; hi += d;
    lines.push({ label: `+ De-matting (${p.dematt})`, amount: `$${d}` });
  }

  const flags: QuoteFlag[] = [];
  if (p.coat === "double") {
    flags.push({ kind: "rec", text: "Double-coated breed — recommend the Furminator/de-shed and never shave." });
    if (!p.addons.includes("deshed")) flags.push({ kind: "warn", text: "De-shed (+$18) not included — usually worth adding for this coat." });
  }
  if (p.coat === "curly") {
    flags.push({ kind: "rec", text: "Curly coat — mats fast; a full groom every 4–6 weeks avoids de-matting fees." });
    if (svc === "bath") flags.push({ kind: "warn", text: "Bath-only won't fix matting on a curly coat — may need a full groom." });
  }
  if (size === "XL" && basis !== "remembered") flags.push({ kind: "warn", text: "X-large / heavy coat — expect the top of the range." });
  if (p.dematt === "severe") flags.push({ kind: "warn", text: "Severe matting can exceed this — often billed per 15-min block." });

  return { lo, hi, lines, flags, assumptions, basis };
}
