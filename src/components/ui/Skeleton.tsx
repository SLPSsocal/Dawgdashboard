// Shown instantly by Next's loading.tsx while a server page streams, so a
// navigation reads as "already happening" rather than a frozen screen.
export default function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="mx-auto max-w-[1600px] animate-pulse px-4 py-5 sm:px-6">
      <div className="h-5 w-48 rounded bg-slate-200 dark:bg-slate-800" />
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 rounded-xl bg-slate-200 dark:bg-slate-800" />
        ))}
      </div>
      <div className="mt-2 h-16 rounded-xl bg-slate-200 dark:bg-slate-800" />
      <div className="mt-3 h-9 rounded-lg bg-slate-200 dark:bg-slate-800" />
      <div className="mt-3 space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-11 rounded-lg bg-slate-200 dark:bg-slate-800" />
        ))}
      </div>
    </div>
  );
}
