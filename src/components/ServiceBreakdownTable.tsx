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

export default function ServiceBreakdownTable({
  breakdown,
}: {
  breakdown: { name: string; count: number }[];
}) {
  const total = breakdown.reduce((sum, b) => sum + b.count, 0);

  if (breakdown.length === 0) return null;

  return (
    <div className="flex max-h-72 flex-col rounded-xl border border-slate-300 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-700 dark:bg-slate-900">
      <h2 className="shrink-0 text-sm font-semibold text-slate-700 dark:text-slate-200">Breakdown by Service Type</h2>

      {/* Only this list scrolls — it never grows the stat-pill row beside it. */}
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto overflow-x-auto">
        <table className="w-full min-w-[280px] border-collapse text-sm">
          <thead className="sticky top-0 bg-white dark:bg-slate-900">
            <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:text-slate-500">
              <th className="py-2">Service</th>
              <th className="py-2 text-right">Count</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.map((b, i) => (
              <tr key={b.name} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="flex items-center gap-2 py-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${DOT_COLORS[i % DOT_COLORS.length]}`} />
                  {b.name}
                </td>
                <td className="py-2 text-right font-medium">{b.count || "—"}</td>
              </tr>
            ))}
            <tr className="sticky bottom-0 bg-slate-50 dark:bg-slate-800/50">
              <td className="py-2 font-semibold">Total</td>
              <td className="py-2 text-right font-semibold">{total}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
