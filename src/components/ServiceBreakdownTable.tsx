const DOT_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-teal-400",
  "bg-orange-400",
  "bg-pink-400",
  "bg-amber-400",
  "bg-red-500",
  "bg-violet-400",
  "bg-slate-400",
];

// A real grid, not a wrapping inline row. Every cell is the same width and
// the count is right-aligned in its own column, so the numbers form a
// straight edge you can scan down instead of drifting with label length.
export default function ServiceBreakdownTable({
  breakdown,
}: {
  breakdown: { name: string; count: number }[];
}) {
  if (breakdown.length === 0) return null;
  const total = breakdown.reduce((sum, b) => sum + b.count, 0);

  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2 dark:border-slate-800">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Service mix
        </span>
        <span className="text-[12px] text-slate-500 dark:text-slate-400">
          Total <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{total}</span>
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {breakdown.map((b, i) => (
          <div
            key={b.name}
            className="flex items-center gap-2 border-b border-r border-slate-100 px-4 py-2 last:border-b-0 dark:border-slate-800/70"
          >
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT_COLORS[i % DOT_COLORS.length]}`} />
            <span
              className={`min-w-0 flex-1 truncate text-[13px] ${
                b.count > 0 ? "text-slate-600 dark:text-slate-300" : "text-slate-400 dark:text-slate-600"
              }`}
              title={b.name}
            >
              {b.name}
            </span>
            <span
              className={`shrink-0 text-[13px] tabular-nums ${
                b.count > 0
                  ? "font-semibold text-slate-900 dark:text-slate-100"
                  : "text-slate-300 dark:text-slate-700"
              }`}
            >
              {b.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
