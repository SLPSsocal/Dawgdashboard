"use client";

import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { submitSupportTicket } from "@/app/support/actions";

type Point = { x: number; y: number };

const MAX_CANVAS_WIDTH = 480;

// Floating "report an issue" widget, present on every page via FacilityHeader.
// Captures a name, a message, an optional plain file attachment, and an
// optional screenshot the staff member can mark up with a red pencil before
// sending. For now submissions just land in support_tickets (viewable at
// /support) — once the Slack channel/AI triage exists, this is the row
// that'll get forwarded there.
export default function SupportWidget({
  staffName,
  facilityId,
}: {
  staffName: string;
  facilityId: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(staffName);
  const [message, setMessage] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Screenshot markup state
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgElRef = useRef<HTMLImageElement | null>(null);
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number } | null>(null);
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const drawingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);

  function resetForm() {
    setName(staffName);
    setMessage("");
    setAttachment(null);
    setError(null);
    setDone(false);
    setCanvasSize(null);
    setStrokes([]);
    imgElRef.current = null;
  }

  function loadImage(file: File) {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_CANVAS_WIDTH / img.naturalWidth);
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      imgElRef.current = img;
      setCanvasSize({ w, h });
      setStrokes([]);
    };
    img.src = URL.createObjectURL(file);
  }

  // Redraw the base image plus every stroke any time either changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgElRef.current;
    if (!canvas || !img || !canvasSize) return;
    canvas.width = canvasSize.w;
    canvas.height = canvasSize.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvasSize.w, canvasSize.h);
    ctx.drawImage(img, 0, 0, canvasSize.w, canvasSize.h);
    ctx.strokeStyle = "#dc2626";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const stroke of strokes) {
      if (stroke.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (const p of stroke.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
  }, [canvasSize, strokes]);

  // The canvas is capped with maxWidth:100%, so on a narrow screen its CSS
  // size is smaller than its bitmap size. Without scaling by that ratio the
  // ink lands offset from the cursor.
  function getPos(e: ReactPointerEvent<HTMLCanvasElement>): Point {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width ? canvas.width / rect.width : 1;
    const scaleY = rect.height ? canvas.height / rect.height : 1;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!canvasSize) return;
    // Pointer capture is best-effort — it throws if the pointer is already
    // released, which must not take the whole widget down.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* non-fatal */
    }
    drawingRef.current = true;
    setStrokes((s) => [...s, [getPos(e)]]);
  }
  function handlePointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const pos = getPos(e);
    setStrokes((s) => {
      // A move can arrive before the opening stroke has committed, or after
      // Undo/Remove emptied the list while the pointer was still down. Start
      // a fresh stroke instead of spreading undefined (which threw a
      // client-side exception and blanked the whole page).
      if (s.length === 0) return [[pos]];
      const next = [...s];
      const last = next[next.length - 1] ?? [];
      next[next.length - 1] = [...last, pos];
      return next;
    });
  }
  function handlePointerUp() {
    drawingRef.current = false;
  }

  function undoStroke() {
    setStrokes((s) => s.slice(0, -1));
  }
  function clearScreenshot() {
    imgElRef.current = null;
    setCanvasSize(null);
    setStrokes([]);
  }

  // Paste-to-attach a screenshot straight from the clipboard (e.g. after
  // Cmd+Shift+4 on Mac or Win+Shift+S on Windows), no save-to-disk needed.
  function handlePaste(e: ReactClipboardEvent) {
    const items = Array.from(e.clipboardData?.items ?? []);
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) loadImage(file);
        e.preventDefault();
        break;
      }
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!message.trim()) {
      setError("Please describe the issue.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const supabase = createClient();
      let screenshotUrl: string | null = null;
      let attachmentUrl: string | null = null;

      if (canvasRef.current && canvasSize) {
        const canvasEl = canvasRef.current;
        const blob: Blob | null = await new Promise((resolve) => canvasEl.toBlob((b) => resolve(b), "image/png"));
        if (blob) {
          const path = `${facilityId}/${Date.now()}-screenshot.png`;
          const { error: upErr } = await supabase.storage
            .from("support-uploads")
            .upload(path, blob, { contentType: "image/png" });
          if (upErr) throw upErr;
          screenshotUrl = supabase.storage.from("support-uploads").getPublicUrl(path).data.publicUrl;
        }
      }

      if (attachment) {
        const ext = attachment.name.split(".").pop() || "dat";
        const path = `${facilityId}/${Date.now()}-attachment.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("support-uploads")
          .upload(path, attachment, { contentType: attachment.type || "application/octet-stream" });
        if (upErr) throw upErr;
        attachmentUrl = supabase.storage.from("support-uploads").getPublicUrl(path).data.publicUrl;
      }

      await submitSupportTicket({
        staffName: name,
        message,
        screenshotUrl,
        attachmentUrl,
        pageUrl: pathname,
      });

      setDone(true);
      setTimeout(() => {
        setOpen(false);
        resetForm();
      }, 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Report an issue"
        className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-xl text-white shadow-lg hover:bg-indigo-700 dark:bg-slate-100 dark:text-slate-900"
      >
        💬
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div
            onPaste={handlePaste}
            className="flex max-h-[92vh] w-full flex-col overflow-y-auto rounded-t-2xl border border-slate-200 bg-white p-4 shadow-xl sm:max-w-md sm:rounded-2xl sm:p-6 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">🐾 Report an Issue</h2>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  resetForm();
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Something broken or confusing? Let us know — this goes straight to the team.
            </p>

            {done ? (
              <div className="mt-6 rounded-lg bg-green-50 px-4 py-6 text-center text-sm font-medium text-green-700 dark:bg-green-950/30 dark:text-green-400">
                ✅ Thanks — we&apos;ve got it and will follow up if needed.
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
                {error && (
                  <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400">
                    {error}
                  </div>
                )}

                <label className="block">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Your Name</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">What&apos;s going on?</span>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    required
                    rows={4}
                    placeholder="What happened, what page were you on, what did you expect instead…"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>

                <div>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Screenshot (optional)</span>
                  <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                    Upload an image or paste one you already copied (Cmd/Ctrl+V), then draw on it to point out the
                    problem.
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) loadImage(file);
                    }}
                  />

                  {!canvasSize ? (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-2 w-full rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-xs text-slate-400 hover:border-slate-500 dark:border-slate-700 dark:hover:border-slate-500"
                    >
                      📎 Click to upload, or paste a screenshot here
                    </button>
                  ) : (
                    <div className="mt-2">
                      <canvas
                        ref={canvasRef}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerLeave={handlePointerUp}
                        className="touch-none rounded-lg border border-slate-300 dark:border-slate-700"
                        style={{ width: canvasSize.w, height: canvasSize.h, maxWidth: "100%", cursor: "crosshair" }}
                      />
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                        <span className="text-slate-400 dark:text-slate-500">✏️ Draw to mark up</span>
                        <button
                          type="button"
                          onClick={undoStroke}
                          disabled={strokes.length === 0}
                          className="rounded-md border border-slate-300 px-2 py-1 hover:border-slate-500 disabled:opacity-40 dark:border-slate-700 dark:hover:border-slate-500"
                        >
                          Undo
                        </button>
                        <button
                          type="button"
                          onClick={clearScreenshot}
                          className="rounded-md border border-slate-300 px-2 py-1 hover:border-slate-500 dark:border-slate-700 dark:hover:border-slate-500"
                        >
                          Remove screenshot
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Attach a file (optional)</span>
                  <div>
                    <input
                      ref={attachInputRef}
                      type="file"
                      className="hidden"
                      onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
                    />
                    <button
                      type="button"
                      onClick={() => attachInputRef.current?.click()}
                      className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:border-slate-500 dark:border-slate-700 dark:hover:border-slate-500"
                    >
                      {attachment ? `📄 ${attachment.name}` : "📄 Choose File"}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-2 w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
                >
                  {submitting ? "Sending…" : "Send"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
