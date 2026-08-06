const DOT_COLORS = [
  "bg-blue-500",
  "bg-green-500",
  "bg-teal-400",
  "bg-orange-400",
  "bg-pink-400",
  "bg-yellow-400",
  "bg-red-500",
  "bg-purple-400",
  "bg-slate-400",
];

// Was a ~280px-tall scrolling table with SERVICE/COUNT headers for a handful
// of numbers. Now a wrapping row of chips that costs ~60-90px, so the
// reservation tables move up the page.
export default function ServiceBreakdownTable({
  breakdown,
}: {
  breakdown: { name: string; count: number }[];
}) {
  if (breakdown.length === 0) return null;
  const total = breakdown.reduce((sum, b) => sum + b.count, 0);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        Service mix
      </span>
      {breakdown.map((b, i) => (
        <span key={b.name} className="inline-flex items-center gap-1.5 text-[13px]">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT_COLORS[i % DOT_COLORS.length]}`} />
          <span className={b.count > 0 ? "text-slate-600 dark:text-slate-300" : "text-slate-400 dark:text-slate-600"}>
            {b.name}
          </span>
          <span
            className={`tabular-nums ${
              b.count > 0
                ? "font-semibold text-slate-900 dark:text-slate-100"
                : "text-slate-300 dark:text-slate-700"
            }`}
          >
            {b.count}
          </span>
        </span>
      ))}
      <span className="ml-auto text-[13px] text-slate-500 dark:text-slate-400">
        Total <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{total}</span>
      </span>
    </div>
  );
}
