import { serviceTone } from "@/lib/serviceColors";

// Redesign: Service Mix as labeled progress bars (colored per service type)
// with the count right-aligned. Types at zero collapse into a one-line
// footer instead of occupying grid cells.
export default function ServiceBreakdownTable({
  breakdown,
}: {
  breakdown: { name: string; count: number }[];
}) {
  if (breakdown.length === 0) return null;
  const total = breakdown.reduce((sum, b) => sum + b.count, 0);
  const active = breakdown.filter((b) => b.count > 0).sort((a, b) => b.count - a.count);
  const zeroCount = breakdown.length - active.length;
  const max = Math.max(1, ...active.map((b) => b.count));

  return (
    <div className="flex h-full flex-col rounded-[14px] border border-[#e3e5ea] bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[#8a91a0] dark:text-slate-500">
          Service Mix
        </span>
        <span className="text-[12.5px] text-[#565d6d] dark:text-slate-400">
          {total} reservation{total === 1 ? "" : "s"} today
        </span>
      </div>

      <div className="mt-2.5 flex flex-col gap-2">
        {active.map((b) => (
          <div key={b.name} className="flex items-center gap-3">
            <span className="w-36 shrink-0 truncate text-[13px] text-[#15181d] dark:text-slate-200" title={b.name}>
              {b.name.replace(/^Overnight Hotel \| /, "").replace(/^Daycare \| /, "Daycare ")}
            </span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-[#edeff3] dark:bg-slate-800">
              <span
                className={`block h-full rounded-full ${serviceTone(b.name).bar}`}
                style={{ width: `${Math.max(6, Math.round((b.count / max) * 100))}%` }}
              />
            </span>
            <span className="w-6 shrink-0 text-right text-[13px] font-semibold tabular-nums text-[#15181d] dark:text-slate-100">
              {b.count}
            </span>
          </div>
        ))}
        {active.length === 0 && (
          <p className="py-2 text-[13px] text-[#8a91a0] dark:text-slate-500">Nothing on the books yet today.</p>
        )}
      </div>

      {zeroCount > 0 && (
        <p className="mt-auto pt-2 text-[12px] text-[#8a91a0] dark:text-slate-500">
          + {zeroCount} service type{zeroCount === 1 ? "" : "s"} at 0
        </p>
      )}
    </div>
  );
}
