type Stat = { label: string; value: number; accent?: string };

// One connected strip with hairline dividers instead of five separate tiles —
// same information, roughly a third of the height, and it reads as a single
// operational summary rather than five competing cards.
export default function DailySummaryBar({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-2 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white sm:grid-cols-3 sm:divide-y-0 lg:grid-cols-5 dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
      {stats.map((s, i) => (
        <div
          key={s.label}
          className={`flex items-baseline gap-2 px-4 py-2.5 ${
            i > 0 ? "sm:border-l sm:border-slate-200 sm:dark:border-slate-800" : ""
          }`}
        >
          <span className="text-[20px] font-semibold leading-none tabular-nums text-slate-900 dark:text-slate-50">
            {s.value}
          </span>
          <span className="truncate text-[12px] text-slate-500 dark:text-slate-400">{s.label}</span>
        </div>
      ))}
    </div>
  );
}
