import type { Facility } from "@/lib/reports";

// Shared date-range + location bar for every admin report. Plain GET form so
// the current report state lives entirely in the URL — bookmarkable, and it
// works without JS (which also makes it trivially driveable by a QA agent).
export default function AdminReportControls({
  basePath,
  from,
  to,
  facilityId,
  facilities,
}: {
  basePath: string;
  from: string;
  to: string;
  facilityId: string | null;
  facilities: Facility[];
}) {
  return (
    <form
      action={basePath}
      method="get"
      className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
    >
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          From
        </span>
        <input
          type="date"
          name="from"
          defaultValue={from}
          className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        />
      </label>
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          To
        </span>
        <input
          type="date"
          name="to"
          defaultValue={to}
          className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        />
      </label>
      <label className="block min-w-[200px] flex-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Location
        </span>
        <select
          name="facility"
          defaultValue={facilityId ?? "all"}
          className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        >
          <option value="all">📍 All Locations</option>
          {facilities.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 dark:bg-slate-100 dark:text-slate-900"
      >
        Run Report
      </button>
    </form>
  );
}
