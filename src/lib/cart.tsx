"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type CartItem = {
  reservationId: string;
  animalId: string;
  animalName: string;
  parentId: string | null;
  parentName: string | null;
};

type CartContextValue = {
  items: CartItem[];
  add: (item: CartItem) => void;
  remove: (reservationId: string) => void;
  clear: () => void;
  has: (reservationId: string) => boolean;
  distinctParentCount: number;
};

const CartContext = createContext<CartContextValue | null>(null);

const STORAGE_KEY = "dawg-checkout-cart";

// Client-only, in-browser queue of dogs staff have flagged to check out
// together (e.g. a family picking up several dogs at once). Not synced to
// the database — it's a front-desk convenience, not a system of record.
export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {
      // ignore malformed storage
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // storage full/unavailable — cart just won't persist across reloads
    }
  }, [items, hydrated]);

  const add = useCallback((item: CartItem) => {
    setItems((prev) => (prev.some((i) => i.reservationId === item.reservationId) ? prev : [...prev, item]));
  }, []);

  const remove = useCallback((reservationId: string) => {
    setItems((prev) => prev.filter((i) => i.reservationId !== reservationId));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const has = useCallback((reservationId: string) => items.some((i) => i.reservationId === reservationId), [items]);

  const distinctParentCount = useMemo(
    () => new Set(items.map((i) => i.parentId ?? `__none_${i.reservationId}`)).size,
    [items]
  );

  const value = useMemo(
    () => ({ items, add, remove, clear, has, distinctParentCount }),
    [items, add, remove, clear, has, distinctParentCount]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
