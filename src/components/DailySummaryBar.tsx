type Stat = { label: string; value: number; accent?: string };

export default function DailySummaryBar({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {stats.map((s) => (
        <div
          key={s.label}
          className={`flex flex-col items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900 ${s.accent ?? ""}`}
        >
          <div className="text-2xl font-semibold">{s.value}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">{s.label}</div>
        </div>
      ))}
    </div>
  );
}
