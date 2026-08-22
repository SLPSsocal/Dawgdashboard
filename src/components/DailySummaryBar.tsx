type Stat = {
  label: string;
  value: number;
  /** Tailwind bg-* class for the status dot. */
  dot?: string;
  /** The emphasized cell (Total Today in the redesign). */
  highlight?: boolean;
  accent?: string; // legacy, unused
};

// Redesign: one connected card of stat cells — colored dot + uppercase label
// on top, large number beneath. The Total cell gets a soft accent wash and an
// accent underline.
export default function DailySummaryBar({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-[14px] border border-[#e3e5ea] bg-white sm:grid-cols-3 lg:grid-cols-5 dark:border-slate-800 dark:bg-slate-900">
      {stats.map((s, i) => (
        <div
          key={s.label}
          className={`relative flex flex-col gap-1.5 px-4 py-3 ${
            i > 0 ? "border-l border-[#edeff3] dark:border-slate-800" : ""
          } ${s.highlight ? "bg-indigo-50/70 dark:bg-indigo-950/30" : ""}`}
        >
          <span className="flex items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide text-[#8a91a0] dark:text-slate-500">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.dot ?? "bg-slate-400"}`} />
            {s.label}
          </span>
          <span className="text-[26px] font-bold leading-none tabular-nums text-[#15181d] dark:text-slate-50">
            {s.value}
          </span>
          {s.highlight && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-indigo-600" />}
        </div>
      ))}
    </div>
  );
}
