"use client";

import { useRouter } from "next/navigation";

// Jump straight to any date instead of paging one day at a time with the
// arrows (Alan, Aug 19 — "like Gingr's calendar icon"). Native date input so
// the browser gives us a month/date picker for free on desktop and mobile.
export default function CalendarDateJump({ date, basePath }: { date: string; basePath: string }) {
  const router = useRouter();
  return (
    <label
      title="Jump to date"
      className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-300 px-2 py-1 hover:border-slate-500 dark:border-slate-700 dark:hover:border-slate-500"
    >
      <span aria-hidden>📅</span>
      <input
        key={date}
        type="date"
        defaultValue={date}
        onChange={(e) => {
          if (e.target.value) router.push(`${basePath}?date=${e.target.value}`);
        }}
        className="cursor-pointer bg-transparent text-sm outline-none dark:[color-scheme:dark]"
        aria-label="Jump to date"
      />
    </label>
  );
}
