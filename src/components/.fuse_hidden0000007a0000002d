"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    setMounted(true);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("dawg-theme", next ? "dark" : "light");
    } catch {
      // ignore (private browsing etc.)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle dark mode"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-300 text-sm dark:border-neutral-700"
    >
      {mounted ? (dark ? "☀️" : "🌙") : null}
    </button>
  );
}
