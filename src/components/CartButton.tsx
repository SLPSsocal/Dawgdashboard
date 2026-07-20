"use client";

import { useEffect, useRef, useState } from "react";
import { useCart } from "@/lib/cart";

export default function CartButton() {
  const { items, remove, clear, distinctParentCount } = useCart();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const mixedParents = distinctParentCount > 1;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative inline-flex items-center rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm hover:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-500"
        aria-label="Checkout cart"
      >
        🛒
        {items.length > 0 && (
          <span
            className={`absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${
              mixedParents ? "bg-red-500" : "bg-indigo-600"
            }`}
          >
            {items.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Checkout Cart</h3>
            {items.length > 0 && (
              <button type="button" onClick={clear} className="text-xs text-slate-400 underline hover:text-slate-600 dark:hover:text-slate-200">
                Clear
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
              Empty. Add dogs from the check-in board (⋮ menu → Add to Cart) to queue up a group checkout.
            </p>
          ) : (
            <>
              {mixedParents && (
                <p className="mt-2 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-400">
                  ⚠️ These dogs belong to different parent accounts — double check before charging one card for
                  all of them.
                </p>
              )}
              <div className="mt-2 flex flex-col gap-1">
                {items.map((i) => (
                  <div key={i.reservationId} className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                    <a href={`/reservations/${i.reservationId}/checkout`} className="min-w-0 flex-1">
                      <div className="truncate font-medium">{i.animalName}</div>
                      <div className="truncate text-xs text-slate-400 dark:text-slate-500">{i.parentName ?? "No parent on file"}</div>
                    </a>
                    <button
                      type="button"
                      onClick={() => remove(i.reservationId)}
                      className="shrink-0 text-xs text-red-500 hover:underline dark:text-red-400"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                Tap a dog to open its checkout screen. Cart is just a queue for your own visibility — each dog
                still checks out on its own screen.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
