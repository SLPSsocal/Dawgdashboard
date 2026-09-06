import { unlockPurchaseRequest } from "@/app/purchase-request/actions";

export default function PurchaseRequestPinGate({ error }: { error?: string }) {
  return (
    <div className="mx-auto w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Purchase request</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Enter the shared staff PIN to add a supply request.
      </p>
      {error === "invalid" && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
          That PIN didn&apos;t match.
        </p>
      )}
      <form action={unlockPurchaseRequest} className="mt-4 flex flex-col gap-3">
        <input
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          required
          placeholder="PIN"
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-[15px] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        />
        <button
          type="submit"
          className="h-11 rounded-[10px] bg-indigo-600 text-[14px] font-semibold text-white hover:bg-indigo-700"
        >
          Continue
        </button>
      </form>
    </div>
  );
}
