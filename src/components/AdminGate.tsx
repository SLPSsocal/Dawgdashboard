import { unlockAdmin } from "@/app/admin/actions";

// PIN prompt shown in place of any admin report until the owner cookie is set.
export default function AdminGate({
  facilityName,
  next,
  error,
}: {
  facilityName: string;
  next: string;
  error?: string;
}) {
  return (
    <div className="mx-auto mt-10 max-w-sm rounded-xl border border-slate-300 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
      <h1 className="text-lg font-semibold">🔒 Admin Reports</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Enter the Owner PIN for {facilityName} to view reports across all locations.
      </p>
      {error === "invalid" && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
          That PIN didn&apos;t match.
        </p>
      )}
      <form action={unlockAdmin} className="mt-4 flex flex-col gap-3">
        <input type="hidden" name="next" value={next} />
        <input
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          required
          placeholder="Owner PIN"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        />
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 dark:bg-slate-100 dark:text-slate-900"
        >
          Unlock
        </button>
      </form>
    </div>
  );
}
