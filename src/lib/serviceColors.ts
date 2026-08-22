// Service-type → color mapping from the redesign (Check-in Board Redesign
// .dc.html): Dog Suites violet, Daycare Full Day blue, Half Day teal,
// Grooming pink, Evaluations amber, everything else gray. Dots, bars and
// chips all draw from this one map so the same service reads the same color
// everywhere.

export type ServiceTone = {
  dot: string; // solid dot / bar fill
  bar: string;
};

const TONES: [RegExp, ServiceTone][] = [
  [/dog suites|overnight/i, { dot: "bg-violet-600", bar: "bg-violet-600" }],
  [/full day/i, { dot: "bg-sky-600", bar: "bg-sky-600" }],
  [/half day/i, { dot: "bg-teal-600", bar: "bg-teal-600" }],
  [/groom/i, { dot: "bg-pink-600", bar: "bg-pink-600" }],
  [/eval/i, { dot: "bg-amber-600", bar: "bg-amber-600" }],
  [/cat/i, { dot: "bg-orange-500", bar: "bg-orange-500" }],
];

export function serviceTone(typeName: string | null | undefined): ServiceTone {
  for (const [re, tone] of TONES) if (typeName && re.test(typeName)) return tone;
  return { dot: "bg-slate-400", bar: "bg-slate-400" };
}
