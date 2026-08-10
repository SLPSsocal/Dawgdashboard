"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { recordAttempt, saveDeveloperNote } from "@/app/qa/actions";

// The QA Test Center: 75 seeded workflow tests staff walk through by hand.
// Tap PASS to record instantly; PARTIAL/FAIL/BLOCKED open a small form that
// requires what-happened + severity. Results are append-only history.

export type QaTest = {
  id: string;
  code: string;
  category: string;
  title: string;
  instructions: string | null;
  expected_result: string | null;
  sort_order: number;
  developer_note: string | null;
};

export type QaAttempt = {
  id: string;
  qaTestId: string;
  status: string;
  severity: string | null;
  testerName: string | null;
  device: string | null;
  browser: string | null;
  actualResult: string | null;
  createdAt: string;
  attachments: string[];
};

const STATUS_META: Record<string, { label: string; pill: string; dot: string }> = {
  not_tested: { label: "Not Tested", pill: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400", dot: "bg-slate-400" },
  pass: { label: "Pass", pill: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400", dot: "bg-emerald-500" },
  partial: { label: "Partial", pill: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400", dot: "bg-amber-500" },
  fail: { label: "Fail", pill: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400", dot: "bg-red-500" },
  blocked: { label: "Blocked", pill: "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-400", dot: "bg-violet-500" },
  needs_retest: { label: "Needs Retest", pill: "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-400", dot: "bg-sky-500" },
};

const SEVERITIES = ["P0", "P1", "P2", "P3"] as const;
const PROBLEM_STATUSES = new Set(["fail", "partial", "blocked", "needs_retest"]);

function detectDevice() {
  if (typeof navigator === "undefined") return "";
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  return "Other";
}
function detectBrowser() {
  if (typeof navigator === "undefined") return "";
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "Edge";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  if (/Firefox\//.test(ua)) return "Firefox";
  return "Other";
}

export default function QaTestCenter({
  tests,
  attempts,
  staffName,
}: {
  tests: QaTest[];
  attempts: QaAttempt[];
  staffName?: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [tester, setTester] = useState(staffName && staffName !== "Staff" ? staffName : "");
  useEffect(() => {
    const saved = window.localStorage.getItem("qa_tester_name");
    if (saved) setTester(saved);
  }, []);
  function rememberTester(v: string) {
    setTester(v);
    try {
      window.localStorage.setItem("qa_tester_name", v);
    } catch {}
  }

  // Filters
  const [category, setCategory] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [testerFilter, setTesterFilter] = useState("");
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [query, setQuery] = useState("");

  const [openTest, setOpenTest] = useState<string | null>(null);
  // The in-progress PARTIAL/FAIL/BLOCKED form (one at a time).
  const [reporting, setReporting] = useState<{ testId: string; status: "partial" | "fail" | "blocked" } | null>(null);
  const [note, setNote] = useState("");
  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number]>("P1");
  const [device, setDevice] = useState("");
  const [browser, setBrowser] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [devNoteFor, setDevNoteFor] = useState<string | null>(null);
  const [devNote, setDevNote] = useState("");

  useEffect(() => {
    setDevice(detectDevice());
    setBrowser(detectBrowser());
  }, []);

  const attemptsByTest = useMemo(() => {
    const m = new Map<string, QaAttempt[]>();
    for (const a of attempts) {
      const list = m.get(a.qaTestId) ?? [];
      list.push(a); // already newest-first
      m.set(a.qaTestId, list);
    }
    return m;
  }, [attempts]);

  const currentStatus = (testId: string) => attemptsByTest.get(testId)?.[0]?.status ?? "not_tested";
  const lastFailing = (testId: string) =>
    attemptsByTest.get(testId)?.find((a) => a.status === "fail" || a.status === "partial" || a.status === "blocked");

  const counts = useMemo(() => {
    const c: Record<string, number> = { not_tested: 0, pass: 0, partial: 0, fail: 0, blocked: 0, needs_retest: 0 };
    for (const t of tests) c[currentStatus(t.id)] = (c[currentStatus(t.id)] ?? 0) + 1;
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tests, attempts]);
  const completion = tests.length > 0 ? Math.round((counts.pass / tests.length) * 100) : 0;

  const testers = useMemo(
    () => Array.from(new Set(attempts.map((a) => a.testerName).filter((v): v is string => Boolean(v)))).sort(),
    [attempts]
  );
  const categories = useMemo(() => Array.from(new Set(tests.map((t) => t.category))), [tests]);

  const visible = tests.filter((t) => {
    const st = currentStatus(t.id);
    if (category && t.category !== category) return false;
    if (statusFilter && st !== statusFilter) return false;
    if (problemsOnly && !PROBLEM_STATUSES.has(st)) return false;
    if (severityFilter) {
      const f = lastFailing(t.id);
      if (!f || f.severity !== severityFilter) return false;
    }
    if (testerFilter && !(attemptsByTest.get(t.id) ?? []).some((a) => a.testerName === testerFilter)) return false;
    if (query) {
      const q = query.toLowerCase();
      const hay = `${t.code} ${t.category} ${t.title} ${t.instructions ?? ""} ${t.expected_result ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  function submitQuick(test: QaTest, status: "pass" | "needs_retest") {
    setError(null);
    startTransition(async () => {
      try {
        await recordAttempt(test.id, {
          status,
          testerName: tester || null,
          device,
          browser,
        });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save.");
      }
    });
  }

  async function submitReport(test: QaTest) {
    if (!reporting) return;
    if (!note.trim()) {
      setError("Describe what happened — required for a non-pass result.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      let urls: string[] = [];
      if (file) {
        const supabase = createClient();
        const ext = file.name.split(".").pop() || "png";
        const path = `qa/${test.code}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("support-uploads")
          .upload(path, file, { upsert: true, contentType: file.type });
        if (upErr) throw upErr;
        urls = [supabase.storage.from("support-uploads").getPublicUrl(path).data.publicUrl];
      }
      await recordAttempt(test.id, {
        status: reporting.status,
        severity,
        testerName: tester || null,
        device,
        browser,
        actualResult: note,
        attachmentUrls: urls,
      });
      setReporting(null);
      setNote("");
      setFile(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  async function copyBugReport(test: QaTest) {
    const f = lastFailing(test.id) ?? attemptsByTest.get(test.id)?.[0];
    const lines = [
      `**${test.code} — ${test.title}** (${test.category})`,
      f?.severity ? `Severity: ${f.severity}` : null,
      `Status: ${STATUS_META[currentStatus(test.id)].label}`,
      f?.actualResult ? `What happened: ${f.actualResult}` : null,
      f ? `Tested by ${f.testerName ?? "unknown"} on ${new Date(f.createdAt).toLocaleString()} (${[f.device, f.browser].filter(Boolean).join(", ")})` : null,
      test.instructions ? `Steps: ${test.instructions}` : null,
      test.expected_result ? `Expected: ${test.expected_result}` : null,
      ...(f?.attachments ?? []).map((u) => `Screenshot: ${u}`),
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(test.id);
      setTimeout(() => setCopied(null), 1500);
    } catch {}
  }

  function saveDevNote(test: QaTest) {
    startTransition(async () => {
      await saveDeveloperNote(test.id, devNote);
      setDevNoteFor(null);
      router.refresh();
    });
  }

  const inputCls =
    "rounded-lg border border-slate-300 bg-white px-2.5 text-[13px] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[19px] font-semibold leading-tight">QA Test Center</h1>
          <p className="text-[13px] text-slate-500 dark:text-slate-400">
            {tests.length} tests · {completion}% passing · results keep full history
          </p>
        </div>
        <input
          value={tester}
          onChange={(e) => rememberTester(e.target.value)}
          placeholder="Your name (recorded with results)"
          className={`h-9 w-56 ${inputCls}`}
        />
      </div>

      {/* Summary strip */}
      <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {(["not_tested", "pass", "partial", "fail", "blocked", "needs_retest"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(statusFilter === s ? "" : s)}
            className={`rounded-xl border px-2 py-2 text-left transition ${
              statusFilter === s
                ? "border-slate-900 dark:border-slate-100"
                : "border-slate-200 dark:border-slate-800"
            } bg-white dark:bg-slate-900`}
          >
            <div className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${STATUS_META[s].dot}`} />
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{STATUS_META[s].label}</span>
            </div>
            <div className="mt-0.5 text-[18px] font-semibold tabular-nums">{counts[s]}</div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search: feeding, payment, run card, mobile…"
          className={`h-9 min-w-[220px] flex-1 ${inputCls}`}
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={`h-9 ${inputCls}`}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} className={`h-9 ${inputCls}`}>
          <option value="">Any severity</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={testerFilter} onChange={(e) => setTesterFilter(e.target.value)} className={`h-9 ${inputCls}`}>
          <option value="">Any tester</option>
          {testers.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setProblemsOnly((p) => !p)}
          className={`h-9 rounded-lg px-3 text-[13px] font-medium ${
            problemsOnly
              ? "bg-red-600 text-white"
              : "border border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300"
          }`}
        >
          Problems only
        </button>
      </div>

      {error && <p className="mt-2 text-[13px] text-red-600 dark:text-red-400">{error}</p>}

      {/* Test list */}
      <div className="mt-3 flex flex-col gap-1.5">
        {visible.map((t) => {
          const st = currentStatus(t.id);
          const history = attemptsByTest.get(t.id) ?? [];
          const open = openTest === t.id;
          const failing = lastFailing(t.id);
          return (
            <div key={t.id} className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setOpenTest(open ? null : t.id)}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
              >
                <span className="w-16 shrink-0 text-[12px] font-semibold text-slate-400 dark:text-slate-500">{t.code}</span>
                <span className="min-w-0 flex-1 truncate text-[14px] text-slate-800 dark:text-slate-100">{t.title}</span>
                {failing?.severity && (
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {failing.severity}
                  </span>
                )}
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_META[st].pill}`}>
                  {STATUS_META[st].label}
                </span>
              </button>

              {open && (
                <div className="border-t border-slate-100 px-3 py-3 dark:border-slate-800">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    {t.category}
                  </div>
                  {t.instructions && (
                    <p className="mt-1 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">{t.instructions}</p>
                  )}
                  {t.expected_result && (
                    <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-slate-600 dark:text-slate-300">Expected:</span> {t.expected_result}
                    </p>
                  )}
                  {t.developer_note && (
                    <p className="mt-1.5 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-[12px] text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                      🛠 {t.developer_note}
                    </p>
                  )}

                  {/* Record result */}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => submitQuick(t, "pass")} className="h-9 rounded-lg bg-emerald-600 px-4 text-[13px] font-semibold text-white hover:bg-emerald-700">
                      PASS
                    </button>
                    {(["partial", "fail", "blocked"] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          setReporting({ testId: t.id, status: s });
                          setNote("");
                          setError(null);
                        }}
                        className={`h-9 rounded-lg px-4 text-[13px] font-semibold ${
                          reporting?.testId === t.id && reporting.status === s
                            ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                            : s === "fail"
                              ? "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-950/50 dark:text-red-300"
                              : s === "partial"
                                ? "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-950/50 dark:text-amber-300"
                                : "bg-violet-100 text-violet-700 hover:bg-violet-200 dark:bg-violet-950/50 dark:text-violet-300"
                        }`}
                      >
                        {s.toUpperCase()}
                      </button>
                    ))}
                    <button type="button" onClick={() => submitQuick(t, "needs_retest")} className="h-9 rounded-lg border border-sky-300 px-3 text-[13px] font-medium text-sky-700 dark:border-sky-800 dark:text-sky-300">
                      Mark for Retest
                    </button>
                    <button type="button" onClick={() => copyBugReport(t)} className="h-9 rounded-lg border border-slate-300 px-3 text-[13px] font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300">
                      {copied === t.id ? "Copied ✓" : "Copy Bug Report"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDevNoteFor(devNoteFor === t.id ? null : t.id);
                        setDevNote(t.developer_note ?? "");
                      }}
                      className="h-9 rounded-lg border border-slate-300 px-3 text-[13px] font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300"
                    >
                      🛠 Dev Note
                    </button>
                  </div>

                  {devNoteFor === t.id && (
                    <div className="mt-2 flex gap-2">
                      <input
                        value={devNote}
                        onChange={(e) => setDevNote(e.target.value)}
                        placeholder='e.g. "Fixed in commit a571b94 — retest"'
                        className={`h-9 flex-1 ${inputCls}`}
                      />
                      <button type="button" onClick={() => saveDevNote(t)} className="h-9 rounded-lg bg-slate-900 px-3 text-[13px] font-medium text-white dark:bg-slate-100 dark:text-slate-900">
                        Save
                      </button>
                    </div>
                  )}

                  {reporting?.testId === t.id && (
                    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/40">
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={2}
                        placeholder="What happened? (required)"
                        className={`w-full py-2 ${inputCls}`}
                      />
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <select value={severity} onChange={(e) => setSeverity(e.target.value as (typeof SEVERITIES)[number])} className={`h-9 ${inputCls}`}>
                          <option value="P0">P0 Critical</option>
                          <option value="P1">P1 High</option>
                          <option value="P2">P2 Medium</option>
                          <option value="P3">P3 Cosmetic</option>
                        </select>
                        <input value={device} onChange={(e) => setDevice(e.target.value)} placeholder="Device" className={`h-9 w-28 ${inputCls}`} />
                        <input value={browser} onChange={(e) => setBrowser(e.target.value)} placeholder="Browser" className={`h-9 w-28 ${inputCls}`} />
                        <label className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-slate-300 px-3 text-[13px] text-slate-600 dark:border-slate-700 dark:text-slate-300">
                          {file ? `📎 ${file.name.slice(0, 18)}` : "📎 Screenshot"}
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                        </label>
                        <button type="button" onClick={() => submitReport(t)} disabled={busy} className="h-9 rounded-lg bg-slate-900 px-4 text-[13px] font-semibold text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900">
                          {busy ? "Saving…" : `Save ${reporting.status.toUpperCase()}`}
                        </button>
                        <button type="button" onClick={() => setReporting(null)} className="h-9 px-2 text-[13px] text-slate-500 dark:text-slate-400">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Attempt history — newest first, never overwritten */}
                  {history.length > 0 && (
                    <div className="mt-3 border-t border-slate-100 pt-2 dark:border-slate-800">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                        History ({history.length})
                      </div>
                      <div className="mt-1.5 flex flex-col gap-1.5">
                        {history.map((a, i) => (
                          <div key={a.id} className="flex flex-wrap items-baseline gap-x-2 text-[12px]">
                            <span className="text-slate-400 dark:text-slate-500">#{history.length - i}</span>
                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_META[a.status]?.pill ?? ""}`}>
                              {STATUS_META[a.status]?.label ?? a.status}
                            </span>
                            {a.severity && <span className="font-bold text-slate-500 dark:text-slate-400">{a.severity}</span>}
                            <span className="text-slate-600 dark:text-slate-300">{a.testerName ?? "—"}</span>
                            <span className="text-slate-400 dark:text-slate-500">
                              {new Date(a.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                              {a.device ? ` · ${a.device}` : ""}
                              {a.browser ? ` / ${a.browser}` : ""}
                            </span>
                            {a.actualResult && <span className="w-full text-slate-500 dark:text-slate-400">“{a.actualResult}”</span>}
                            {a.attachments.map((u) => (
                              // eslint-disable-next-line @next/next/no-img-element
                              <a key={u} href={u} target="_blank" rel="noreferrer">
                                <img src={u} alt="" className="mt-1 h-14 rounded border border-slate-200 dark:border-slate-700" />
                              </a>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {visible.length === 0 && (
          <p className="mt-6 text-center text-[13px] text-slate-400 dark:text-slate-500">No tests match these filters.</p>
        )}
      </div>
    </div>
  );
}
