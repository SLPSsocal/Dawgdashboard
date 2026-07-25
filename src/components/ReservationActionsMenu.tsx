"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  checkInReservation,
  deleteReservation,
  undoCheckIn,
  undoCheckOut,
  cancelReservation,
  restoreReservation,
} from "@/app/reservations/actions";
import { useCart } from "@/lib/cart";

export default function ReservationActionsMenu({
  reservationId,
  animalId,
  animalName,
  parentId,
  parentName,
  status,
  performedBy,
}: {
  reservationId: string;
  animalId: string;
  animalName?: string;
  parentId: string | null;
  parentName?: string | null;
  status: string;
  performedBy?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const cart = useCart();
  const inCart = cart.has(reservationId);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function run(action: () => Promise<void>) {
    setOpen(false);
    startTransition(() => {
      action();
    });
  }

  function Divider() {
    return <div className="my-1 border-t border-slate-100 dark:border-slate-800" />;
  }

  function LinkItem({ href, icon, label }: { href: string; icon: string; label: string }) {
    return (
      <a
        href={href}
        className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
      >
        <span>{icon}</span>
        {label}
      </a>
    );
  }

  function ActionItem({
    icon,
    label,
    onClick,
    danger,
  }: {
    icon: string;
    label: string;
    onClick: () => void;
    danger?: boolean;
  }) {
    return (
      <button
        onClick={onClick}
        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800 ${
          danger ? "text-red-600 dark:text-red-400" : ""
        }`}
      >
        <span>{icon}</span>
        {label}
      </button>
    );
  }

  function StubItem({ icon, label, reason }: { icon: string; label: string; reason: string }) {
    return (
      <div
        title={reason}
        className="flex cursor-not-allowed items-center gap-2 px-3 py-2 text-sm text-slate-300 dark:text-slate-600"
      >
        <span>{icon}</span>
        {label}
        <span className="ml-auto text-[10px] uppercase tracking-wide">soon</span>
      </div>
    );
  }

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:border-slate-500 dark:border-slate-700 dark:hover:border-slate-500"
      >
        ⋮
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <LinkItem href={`/reservations/${reservationId}`} icon="🕐" label="Edit Reservation" />
          <StubItem icon="📦" label="Add to Reservation" reason="Needs a services/line-items model — not built yet" />
          <LinkItem href={`/animals/${animalId}`} icon="🐾" label="Edit Animal" />
          {parentId && <LinkItem href={`/parents/${parentId}`} icon="👤" label="Edit Parent" />}

          <Divider />
          <StubItem icon="💲" label="Buy Store Credit" reason="Needs Helcim payment integration — not built yet" />
          <LinkItem href={`/animals/${animalId}`} icon="🛡️" label="Manage Immunizations" />
          <LinkItem href={`/reservations/${reservationId}/incidents/new`} icon="⚠️" label="New Incident" />
          <LinkItem href={`/reservations/${reservationId}/report-card/new`} icon="❤️" label="New Report Card" />

          <Divider />
          {status !== "checked_out" && status !== "cancelled" && (
            <ActionItem
              icon={inCart ? "🛒" : "🛒"}
              label={inCart ? "Remove from Cart" : "Add to Cart"}
              onClick={() => {
                setOpen(false);
                if (inCart) {
                  cart.remove(reservationId);
                } else {
                  cart.add({
                    reservationId,
                    animalId,
                    animalName: animalName ?? "Unknown",
                    parentId,
                    parentName: parentName ?? null,
                  });
                }
              }}
            />
          )}
          {status === "checked_out" ? (
            <ActionItem icon="↩️" label="Undo Check Out" onClick={() => run(() => undoCheckOut(reservationId, performedBy))} />
          ) : status === "checked_in" ? (
            <ActionItem icon="↩️" label="Undo Check In" onClick={() => run(() => undoCheckIn(reservationId, performedBy))} />
          ) : status === "cancelled" ? (
            <ActionItem icon="↩️" label="Restore Reservation" onClick={() => run(() => restoreReservation(reservationId, performedBy))} />
          ) : (
            <ActionItem icon="✅" label="Check In" onClick={() => run(() => checkInReservation(reservationId, performedBy))} />
          )}
          {status !== "checked_out" && status !== "cancelled" && (
            <ActionItem
              icon="✕"
              label="Cancel Reservation"
              danger
              onClick={() => {
                const reason = window.prompt("Reason for cancelling this reservation? (optional)");
                if (reason === null) return;
                run(() => cancelReservation(reservationId, reason.trim() || null, performedBy));
              }}
            />
          )}
          <ActionItem
            icon="🗑️"
            label="Delete Reservation"
            danger
            onClick={() => {
              if (confirm("Delete this reservation? This can't be undone.")) {
                run(() => deleteReservation(reservationId));
              }
            }}
          />

          <Divider />
          <LinkItem href={`/reservations/${reservationId}/checkout`} icon="💲" label="View Estimate / Checkout" />
          <LinkItem href={`/reservations/${reservationId}`} icon="📋" label="View Reservation Details" />
          <LinkItem href={`/reservations/${reservationId}/run-card`} icon="🖨️" label="Print Run Card" />
          <StubItem icon="✉️" label="Ready for Pickup Email" reason="Needs an email provider connected — not built yet" />
          <StubItem icon="📱" label="Ready for Pickup SMS" reason="Needs an SMS provider connected — not built yet" />
        </div>
      )}
    </div>
  );
}
