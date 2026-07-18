"use client";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="print:hidden rounded-lg bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"
    >
      🖨️ Print
    </button>
  );
}
