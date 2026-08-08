"use client";

import { useEffect, useState } from "react";

// A single unlabelled emoji gave no way to tell which mode you were in — a
// user with dark mode left on from an earlier session read it as pages
// "randomly going black". Now it states the current mode in words, so the
// state is legible and one click undoes it.
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

  // Render a fixed-size placeholder until mounted so the header doesn't shift.
  if (!mounted) return <span className="inline-block h-8 w-[68px]" />;

  return (
    <button
      type="button"
      onClick={toggle}
      title={dark ? "Dark mode is on — click for light" : "Light mode is on — click for dark"}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2 text-[12px] font-medium text-slate-600 transition-colors hover:border-slate-400 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-500"
    >
      <span aria-hidden>{dark ? "🌙" : "☀️"}</span>
      <span className="hidden sm:inline">{dark ? "Dark" : "Light"}</span>
    </button>
  );
}
