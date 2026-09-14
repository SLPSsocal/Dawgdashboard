"use client";

// Route-level error boundary. Without this, any client-side exception showed
// Next's blank "Application error" page with zero information (Edilsa's
// report crash, Sep 14). This keeps staff in the app, shows the actual
// message so a screenshot of it is instantly diagnosable, and offers a
// one-tap recovery.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f6f8] p-6 dark:bg-slate-950">
      <div className="w-full max-w-md rounded-[14px] border border-[#e3e5ea] bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="text-3xl">🐾</div>
        <h1 className="mt-2 text-lg font-semibold text-[#15181d] dark:text-slate-100">
          Something broke on this page
        </h1>
        <p className="mt-1 text-sm text-[#565d6d] dark:text-slate-400">
          Your data is safe — this is a display error, not a lost record.
        </p>
        <p className="mt-3 break-words rounded-[10px] bg-red-50 px-3 py-2 text-left text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error.message || "Unknown client-side exception"}
          {error.digest ? ` · ref ${error.digest}` : ""}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-[10px] bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Try again
          </button>
          <a
            href="/reservations"
            className="rounded-[10px] border border-[#e3e5ea] px-4 py-2 text-sm font-medium text-[#565d6d] dark:border-slate-700 dark:text-slate-300"
          >
            Back to board
          </a>
        </div>
        <p className="mt-3 text-[11px] text-[#8a91a0] dark:text-slate-500">
          If this keeps happening, screenshot this box and send it via the 💬 button.
        </p>
      </div>
    </main>
  );
}
