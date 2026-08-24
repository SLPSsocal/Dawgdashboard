"use client";

// Dawg assistant (BETA) — the ✨ floating launcher + drafting panel from the
// redesign. Type a booking in plain words, get a draft card back, approve it
// to create the real reservation. Nothing is created until Approve.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { draftFromText, approveDraft, type AssistantDraft } from "@/app/assistant/actions";

const SUGGESTIONS = [
  "book Bailey in a suite Fri through Mon, pickup 4pm",
  "daycare for Milo tomorrow, drop off 8am",
  "board Biscuit tonight through Thursday",
];

export default function DawgAssistant() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<AssistantDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isApproving, startApprove] = useTransition();
  const router = useRouter();

  function runDraft(input: string) {
    const t = input.trim();
    if (!t) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await draftFromText(t);
        if (res.error) {
          setError(res.error);
          setDraft(null);
        } else {
          setDraft(res.draft ?? null);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  function approve() {
    if (!draft) return;
    setError(null);
    startApprove(async () => {
      try {
        const { reservationId } = await approveDraft(draft);
        setOpen(false);
        setDraft(null);
        setText("");
        router.push(`/reservations/${reservationId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't create the reservation.");
      }
    });
  }

  function fmtDay(ymd: string) {
    return new Date(`${ymd}T12:00:00`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  }
  function fmtTime(hm: string) {
    const [h, m] = hm.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
  }

  const rowClass = "flex items-start justify-between gap-3 border-b border-[#edeff3] px-3 py-2.5 last:border-b-0 dark:border-slate-800";
  const rowLabel = "w-16 shrink-0 pt-0.5 text-[12px] text-[#8a91a0] dark:text-slate-500";

  return (
    <>
      {/* Floating launcher — sits above the support (💬) button. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Open Dawg assistant"
        title="Dawg assistant"
        className="fixed bottom-[84px] right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-xl text-white shadow-lg transition-transform hover:scale-105 hover:bg-indigo-700"
      >
        ✨
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/30 p-0 sm:p-5" onClick={() => setOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[14px] border border-[#e3e5ea] bg-white shadow-2xl sm:max-h-[85vh] sm:w-[420px] sm:rounded-[14px] dark:border-slate-700 dark:bg-slate-900"
          >
            {/* Head */}
            <div className="flex items-center justify-between border-b border-[#edeff3] px-4 py-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-indigo-50 text-sm dark:bg-indigo-950/50">✨</span>
                <span className="text-[15px] font-semibold text-[#15181d] dark:text-slate-100">Dawg assistant</span>
                <span className="rounded-full bg-[#f1f2f5] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#8a91a0] dark:bg-slate-800 dark:text-slate-400">
                  Beta
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close assistant"
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {/* Input */}
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    runDraft(text);
                  }
                }}
                rows={2}
                placeholder='Try: "book Zeus in suite 14 Fri through Mon, pickup 4pm"'
                className="w-full rounded-[10px] border border-[#e3e5ea] bg-[#f9fafb] px-3 py-2.5 text-sm text-[#15181d] placeholder:text-[#8a91a0] focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => runDraft(text)}
                  disabled={isPending || !text.trim()}
                  className="rounded-[10px] bg-indigo-600 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isPending ? "Drafting…" : "Draft it"}
                </button>
                <span className="text-[11px] text-[#8a91a0] dark:text-slate-500">Enter to draft · Shift+Enter for a new line</span>
              </div>

              {!draft && !error && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setText(s);
                        runDraft(s);
                      }}
                      className="truncate rounded-full border border-[#e3e5ea] bg-white px-3 py-1.5 text-[12px] text-[#565d6d] transition-colors hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              {error && (
                <div className="mt-3 rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                  {error}
                </div>
              )}

              {draft && (
                <div className="mt-4">
                  <div className="flex items-center gap-2">
                    <span className="rounded-[6px] bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">
                      Reservation
                    </span>
                    <span className="text-[15px] font-semibold text-[#15181d] dark:text-slate-100">Draft reservation</span>
                  </div>
                  <p className="mt-1 text-[12px] text-[#8a91a0] dark:text-slate-500">Nothing is created until you approve it.</p>

                  <div className="mt-3 overflow-hidden rounded-[10px] border border-[#e3e5ea] dark:border-slate-800">
                    <div className={rowClass}>
                      <span className={rowLabel}>Dog</span>
                      <span className="flex-1 text-right">
                        <span className="block text-sm font-semibold text-[#15181d] dark:text-slate-100">{draft.animalName}</span>
                        <span className="block text-[12px] text-[#8a91a0] dark:text-slate-500">{draft.animalSub}</span>
                      </span>
                    </div>
                    <div className={rowClass}>
                      <span className={rowLabel}>Service</span>
                      <span className="flex-1 text-right">
                        <span className="block text-sm font-semibold text-[#15181d] dark:text-slate-100">{draft.typeName}</span>
                        <span className="block text-[12px] text-[#8a91a0] dark:text-slate-500">{draft.typeSub}</span>
                      </span>
                    </div>
                    {draft.lodgingName && (
                      <div className={rowClass}>
                        <span className={rowLabel}>Lodging</span>
                        <span className="flex-1 text-right text-sm font-semibold text-[#15181d] dark:text-slate-100">
                          {draft.lodgingName}
                        </span>
                      </div>
                    )}
                    <div className={rowClass}>
                      <span className={rowLabel}>Arrive</span>
                      <span className="flex-1 text-right">
                        <span className="block text-sm font-semibold text-[#15181d] dark:text-slate-100">
                          {fmtDay(draft.startDate)}, {fmtTime(draft.dropOffTime)}
                        </span>
                        <span className="block text-[12px] text-[#8a91a0] dark:text-slate-500">drop-off</span>
                      </span>
                    </div>
                    <div className={rowClass}>
                      <span className={rowLabel}>Depart</span>
                      <span className="flex-1 text-right">
                        <span className="block text-sm font-semibold text-[#15181d] dark:text-slate-100">
                          {fmtDay(draft.endDate)}, {fmtTime(draft.pickUpTime)}
                        </span>
                        <span className="block text-[12px] text-[#8a91a0] dark:text-slate-500">
                          {draft.isOvernight ? `${draft.nights} night${draft.nights === 1 ? "" : "s"}` : "day visit"} · pick-up
                        </span>
                      </span>
                    </div>
                  </div>

                  {draft.advisories.map((a, i) => (
                    <div
                      key={i}
                      className={`mt-2 flex items-start gap-2 rounded-[10px] px-3 py-2 text-[13px] ${
                        a.level === "alert"
                          ? "border border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
                          : "border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"
                      }`}
                    >
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                      <span>{a.text}</span>
                    </div>
                  ))}

                  <div className="mt-2 flex items-baseline justify-between rounded-[10px] border border-[#e3e5ea] bg-[#f9fafb] px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950/40">
                    <span className="text-[12px] text-[#8a91a0] dark:text-slate-500">
                      Estimate{draft.estimateNote ? ` · ${draft.estimateNote}` : ""}
                    </span>
                    <span className="text-[22px] font-semibold tabular-nums text-[#15181d] dark:text-slate-50">
                      ${draft.estimate.toFixed(2)}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={approve}
                    disabled={isApproving}
                    className="mt-3 w-full rounded-[10px] bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {isApproving ? "Creating…" : "Approve & create reservation"}
                  </button>
                  <div className="mt-2 flex gap-2">
                    <a
                      href={`/reservations/new?animal_id=${draft.animalId}`}
                      className="flex-1 rounded-[10px] border border-[#e3e5ea] bg-white px-4 py-2 text-center text-sm font-medium text-[#565d6d] transition-colors hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    >
                      Open in form
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        setDraft(null);
                        setText("");
                      }}
                      className="rounded-[10px] px-4 py-2 text-sm font-medium text-[#8a91a0] hover:text-[#15181d] dark:text-slate-500 dark:hover:text-slate-200"
                    >
                      Discard
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] text-[#8a91a0] dark:text-slate-500">
                    Approving records it as you · assistant draft, so the change has an author in Notes History.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
