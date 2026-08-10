"use client";

import { useRef, useState } from "react";
import { getEstimatorContext } from "@/app/estimator/actions";
import {
  parseRequest,
  buildQuote,
  classifyBreed,
  sizeFromWeight,
  type Quote,
  type Size,
} from "@/lib/groomingEstimator";

type Msg =
  | { who: "user"; text: string }
  | { who: "bot"; text?: string; quote?: Quote; header?: string; footnote?: string };

const CHIPS = [
  "goldendoodle full groom + teeth + nails",
  "husky bath, deshed",
  "shih tzu haircut, matted",
];

// Chat-style grooming price estimator. Type a dog + service in plain
// English; if the dog is in the database with a remembered price for that
// service, that exact price is quoted first — otherwise it estimates from
// the facility menu or the cross-facility historical model.
export default function GroomingEstimator() {
  const [msgs, setMsgs] = useState<Msg[]>([
    { who: "bot", text: "Tell me the dog and the service — I'll quote it. Known dogs get their actual last price." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  function push(m: Msg) {
    setMsgs((s) => [...s, m]);
    setTimeout(() => scrollRef.current?.scrollTo({ top: 999999, behavior: "smooth" }), 50);
  }

  async function send(text?: string) {
    const raw = (text ?? input).trim();
    if (!raw || busy) return;
    setInput("");
    push({ who: "user", text: raw });
    setBusy(true);
    try {
      const parsed = parseRequest(raw);
      const ctx = await getEstimatorContext(raw);

      // Enrich size/coat from the dog's own profile when the message didn't say.
      if (ctx.dog) {
        const fromProfile = classifyBreed(ctx.dog.breed);
        if (!parsed.size && ctx.dog.weightLbs) parsed.size = sizeFromWeight(ctx.dog.weightLbs);
        if (!parsed.size && fromProfile.size) parsed.size = fromProfile.size;
        if (!parsed.size && ctx.dog.size) {
          const s = ctx.dog.size.toLowerCase();
          parsed.size = (s.startsWith("s") ? "S" : s.startsWith("m") ? "M" : s.startsWith("x") ? "XL" : "L") as Size;
        }
        if (!parsed.coat && fromProfile.coat) parsed.coat = fromProfile.coat;
      }

      if (!parsed.svc && !parsed.size && !parsed.breed && parsed.addons.length === 0 && !parsed.dematt && !ctx.dog) {
        push({
          who: "bot",
          text: 'I didn\'t catch a dog or service. Try "husky bath and nails", "55 lb doodle full groom", or a dog\'s name like "haircut for Feeny".',
        });
        return;
      }

      const svc = parsed.svc ?? (parsed.addons.length && !parsed.dematt ? "bath" : "groom");
      const svcMatcher = svc === "groom" ? /full\s*groom|haircut|hair\s*cut/i : /bath/i;

      // 1) remembered price for this dog + service
      let remembered: number | null = null;
      let rememberedWhen: string | null = null;
      if (ctx.dog) {
        const hit = ctx.remembered.find((r) => svcMatcher.test(r.service_name));
        if (hit?.price != null) {
          remembered = Number(hit.price);
          rememberedWhen = hit.updated_at ? new Date(hit.updated_at).toLocaleDateString() : null;
        }
      }

      // 2) facility menu range fallback
      let menuRange: [number, number] | null = null;
      const menuHit = ctx.menu.find((m) => svcMatcher.test(m.name));
      if (menuHit && menuHit.min_price != null && menuHit.max_price != null) {
        menuRange = [Number(menuHit.min_price), Number(menuHit.max_price)];
      }

      const quote = buildQuote(parsed, { remembered, menuRange, dogName: ctx.dog?.name ?? null });

      const header = ctx.dog
        ? `${ctx.dog.name}${ctx.dog.parentName ? ` (${ctx.dog.parentName})` : ""}${ctx.dog.breed ? ` · ${ctx.dog.breed}` : ""}`
        : undefined;
      const footnote =
        quote.basis === "remembered"
          ? `Base = what ${ctx.dog?.name} was actually charged last time${rememberedWhen ? ` (${rememberedWhen})` : ""}. Add-ons are shop defaults.`
          : quote.basis === "menu"
            ? "Base = this facility's menu range for the service. Add-ons are shop defaults."
            : "Base = historical range from ~4,400 real grooms across the facilities. Add-ons are shop defaults.";

      push({ who: "bot", quote, header, footnote });
    } catch {
      push({ who: "bot", text: "Something went wrong looking that up — try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto pr-1" style={{ minHeight: 220, maxHeight: 380 }}>
        {msgs.map((m, i) =>
          m.who === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-indigo-600 px-3 py-2 text-sm text-white">
                {m.text}
              </div>
            </div>
          ) : (
            <div key={i} className="flex">
              <div className="max-w-[88%] rounded-2xl rounded-tl-sm border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">
                {m.text && <p className="text-slate-700 dark:text-slate-200">{m.text}</p>}
                {m.quote && (
                  <div>
                    {m.header && (
                      <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">{m.header}</p>
                    )}
                    <p className="mt-0.5 text-2xl font-bold text-slate-900 dark:text-white">
                      {m.quote.lo === m.quote.hi ? `$${m.quote.lo}` : `$${m.quote.lo}–$${m.quote.hi}`}
                    </p>
                    <div className="mt-2 border-t border-slate-200 pt-2 dark:border-slate-700">
                      {m.quote.lines.map((l, j) => (
                        <div key={j} className="flex justify-between gap-4 py-0.5 text-xs">
                          <span className="text-slate-600 dark:text-slate-300">{l.label}</span>
                          <span className="text-slate-400 dark:text-slate-500">{l.amount}</span>
                        </div>
                      ))}
                    </div>
                    {m.quote.assumptions.length > 0 && (
                      <p className="mt-1.5 text-[11px] italic text-slate-400 dark:text-slate-500">
                        {m.quote.assumptions.join(" · ")}
                      </p>
                    )}
                    {m.quote.flags.map((f, j) => (
                      <p
                        key={j}
                        className={`mt-1.5 rounded-md border-l-2 px-2 py-1 text-[11px] ${
                          f.kind === "rec"
                            ? "border-green-500 bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-300"
                            : "border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
                        }`}
                      >
                        {f.text}
                      </p>
                    ))}
                    {m.footnote && (
                      <p className="mt-1.5 text-[10px] italic text-slate-400 dark:text-slate-500">{m.footnote}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        )}
        {msgs.length === 1 && (
          <div className="flex flex-wrap gap-1.5">
            {CHIPS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => send(c)}
                className="rounded-full border border-slate-300 px-2.5 py-1 text-[11px] text-slate-500 hover:border-indigo-500 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-400"
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder='e.g. "haircut for Feeny" or "husky bath + deshed"'
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
        <button
          type="button"
          onClick={() => send()}
          disabled={busy}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
        >
          {busy ? "…" : "Quote"}
        </button>
      </div>
    </div>
  );
}
