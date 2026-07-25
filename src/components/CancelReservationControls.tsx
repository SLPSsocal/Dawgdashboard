"use client";

import { useState, useTransition } from "react";
import { cancelReservation, restoreReservation } from "@/app/reservations/actions";

export default function CancelReservationControls({
  reservationId,
  status,
  performedBy,
}: {
  reservationId: string;
  status: string;
  performedBy: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (status === "checked_out") return null;

  if (status === "cancelled") {
    return (
      <div>
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              try {
                await restoreReservation(reservationId, performedBy);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Failed to restore");
              }
            });
          }}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:border-slate-500 dark:border-slate-700 dark:hover:border-slate-500"
        >
          ↩️ Restore Reservation
        </button>
        {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          const reason = window.prompt("Reason for cancelling this reservation? (optional)");
          if (reason === null) return; // user hit Cancel on the prompt itself
          setError(null);
          startTransition(async () => {
            try {
              await cancelReservation(reservationId, reason.trim() || null, performedBy);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Failed to cancel");
            }
          });
        }}
        className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:border-red-500 dark:border-red-900 dark:text-red-400 dark:hover:border-red-700"
      >
        ✕ Cancel Reservation
      </button>
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
