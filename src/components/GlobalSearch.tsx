"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { globalSearch, type SearchHit } from "@/app/search/actions";

// Header search box: type a dog, parent, phone or email → jump to the
// profile. Desktop shows the input inline; phones get a 🔍 button that
// drops the same box below the header. "/" focuses it from anywhere.
export default function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      globalSearch(q)
        .then((h) => {
          setHits(h);
          setActive(0);
        })
        .catch(() => setHits([]))
        .finally(() => setLoading(false));
    }, 180);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") {
        e.preventDefault();
        (inputRef.current ?? mobileInputRef.current)?.focus();
        if (!inputRef.current) setMobileOpen(true);
      }
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (mobileOpen) setTimeout(() => mobileInputRef.current?.focus(), 30);
  }, [mobileOpen]);

  function go(h: SearchHit) {
    setOpen(false);
    setMobileOpen(false);
    setQuery("");
    setHits([]);
    router.push(h.href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, Math.max(hits.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      if (hits[active]) go(hits[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setMobileOpen(false);
      (e.target as HTMLInputElement).blur();
    }
  }

  const showList = open && query.trim().length >= 2;

  const list = showList && (
    <div className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
      {hits.length === 0 && (
        <p className="px-3 py-3 text-[13px] text-slate-400 dark:text-slate-500">{loading ? "Searching…" : "No dogs or parents match."}</p>
      )}
      {hits.map((h, i) => (
        <button
          key={`${h.kind}:${h.id}`}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            go(h);
          }}
          onMouseEnter={() => setActive(i)}
          className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] ${
            i === active ? "bg-indigo-50 dark:bg-slate-800" : ""
          }`}
        >
          <span
            className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[12px] ${
              h.kind === "animal"
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"
            }`}
            aria-hidden
          >
            {h.kind === "animal" ? "🐶" : "👤"}
          </span>
          <span className="min-w-0 flex-1">
            <span className={`font-medium ${h.kind === "animal" && h.inactive ? "text-slate-400 line-through" : "text-slate-800 dark:text-slate-100"}`}>
              {h.name}
            </span>
            {h.sub && <span className="ml-1.5 truncate text-slate-400 dark:text-slate-500">{h.sub}</span>}
          </span>
          <span className="shrink-0 text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {h.kind === "animal" ? "dog" : "parent"}
          </span>
        </button>
      ))}
    </div>
  );

  const inputClass =
    "h-9 w-full rounded-[10px] border border-[#e3e5ea] bg-[#f5f6f8] pl-8 pr-3 text-[13px] text-slate-800 placeholder:text-[#8a91a0] focus:border-indigo-300 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:bg-slate-950";

  return (
    <>
      {/* Desktop */}
      <div ref={wrapRef} className="relative hidden w-[200px] shrink-0 md:block lg:w-[240px]">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-[#8a91a0]" aria-hidden>
          🔍
        </span>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Find a dog or parent…  /"
          aria-label="Search dogs and parents"
          className={inputClass}
        />
        {list}
      </div>

      {/* Mobile: icon in the header, box drops in below it */}
      <button
        type="button"
        onClick={() => setMobileOpen((o) => !o)}
        aria-label="Search"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 md:hidden dark:text-slate-300 dark:hover:bg-slate-800"
      >
        🔍
      </button>
      {mobileOpen && (
        <div className="fixed inset-x-0 top-14 z-40 border-b border-slate-200 bg-white p-3 shadow-md md:hidden dark:border-slate-800 dark:bg-slate-900">
          <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-[#8a91a0]" aria-hidden>
              🔍
            </span>
            <input
              ref={mobileInputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onKeyDown={onKeyDown}
              placeholder="Find a dog or parent…"
              aria-label="Search dogs and parents"
              className={inputClass}
            />
            {list}
          </div>
        </div>
      )}
    </>
  );
}
