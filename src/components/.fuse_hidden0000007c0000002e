const DOT_COLORS = [
  "bg-blue-500",
  "bg-green-500",
  "bg-teal-400",
  "bg-orange-400",
  "bg-pink-400",
  "bg-yellow-400",
  "bg-red-500",
  "bg-purple-400",
  "bg-neutral-400",
];

export default function ServiceBreakdownTable({
  breakdown,
}: {
  breakdown: { name: string; count: number }[];
}) {
  const total = breakdown.reduce((sum, b) => sum + b.count, 0);

  if (breakdown.length === 0) return null;

  return (
    <div className="mt-4 rounded-xl border border-neutral-300 bg-white p-4 shadow-sm sm:p-5 dark:border-neutral-700 dark:bg-neutral-900">
      <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">Breakdown by Service Type</h2>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[280px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:border-neutral-800 dark:text-neutral-500">
              <th className="py-2">Service</th>
              <th className="py-2 text-right">Count</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.map((b, i) => (
              <tr key={b.name} className="border-b border-neutral-100 last:border-0 dark:border-neutral-800">
                <td className="flex items-center gap-2 py-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${DOT_COLORS[i % DOT_COLORS.length]}`} />
                  {b.name}
                </td>
                <td className="py-2 text-right font-medium">{b.count || "—"}</td>
              </tr>
            ))}
            <tr className="bg-neutral-50 dark:bg-neutral-800/50">
              <td className="py-2 font-semibold">Total</td>
              <td className="py-2 text-right font-semibold">{total}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
