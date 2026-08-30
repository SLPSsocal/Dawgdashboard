"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { assignSpecialist, rescheduleAppointment, saveGroomingPrice } from "@/app/facility-calendar/actions";
import { deleteAvailabilityBlock } from "@/app/blocks/actions";

export type Specialist = { id: string; name: string };

export type SpecialistBlock = {
  id: string;
  specialistId: string;
  startAt: string; // ISO
  endAt: string; // ISO
  reason: string | null;
};

export type ApptCard = {
  id: string;
  animalId?: string | null;
  animalName: string;
  breed: string | null;
  status: string;
  typeName: string | null;
  category: string | null;
  serviceName: string | null;
  specialistId: string | null;
  time: string; // ISO timestamp (start)
  endTime: string; // ISO timestamp (end) — falls back to a default block if equal to start
  /** Remembered price for this dog + service (grooming only). */
  price?: number | null;
};

// Vertical axis = time of day, earliest at top. Falls back to a default
// block length only for the (now rare) case a reservation has no real
// duration on it.
const DEFAULT_BLOCK_MIN = 45;
const PX_PER_MIN = 1.4;
const LANE_WIDTH = 200;

function minutesOfDay(iso: string) {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function durationOf(c: ApptCard) {
  const mins = (new Date(c.endTime).getTime() - new Date(c.time).getTime()) / 60000;
  return mins > 0 ? mins : DEFAULT_BLOCK_MIN;
}

// Groups a lane's cards into overlap clusters and assigns each card a
// column (col/of) within its cluster, so double-booked appointments render
// side-by-side instead of fully stacked on top of each other.
function layoutOverlaps(items: ApptCard[]) {
  const withRange = items
    .map((c) => {
      const start = minutesOfDay(c.time);
      return { c, start, end: start + durationOf(c) };
    })
    .sort((a, b) => a.start - b.start);

  const positioned: { c: ApptCard; col: number; of: number; overlap: boolean }[] = [];
  let cluster: typeof withRange = [];
  let clusterEnd = -Infinity;

  function flush() {
    if (cluster.length === 0) return;
    const overlap = cluster.length > 1;
    cluster.forEach((item, i) => positioned.push({ c: item.c, col: i, of: cluster.length, overlap }));
    cluster = [];
  }

  for (const item of withRange) {
    if (cluster.length === 0 || item.start < clusterEnd) {
      cluster.push(item);
      clusterEnd = Math.max(clusterEnd, item.end);
    } else {
      flush();
      cluster.push(item);
      clusterEnd = item.end;
    }
  }
  flush();
  return positioned;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function fmtHourMark(min: number) {
  const h = Math.floor(min / 60) % 24;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${ampm}`;
}

// 7:00 AM – 7:00 PM in 15-minute steps — same grid the booking form uses.
const TIME_SLOTS: { value: string; label: string }[] = (() => {
  const out: { value: string; label: string }[] = [];
  for (let min = 7 * 60; min <= 19 * 60; min += 15) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    out.push({
      value: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
      label: `${h12}:${String(m).padStart(2, "0")} ${ampm}`,
    });
  }
  return out;
})();

export default function FacilityCalendarBoard({
  specialists,
  cards: initialCards,
  blocks = [],
  facilityId,
}: {
  specialists: Specialist[];
  cards: ApptCard[];
  blocks?: SpecialistBlock[];
  facilityId?: string;
}) {
  const [cards, setCards] = useState(initialCards);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Tap-to-manage panel (Kath, Aug 30): clicking any appointment opens a
  // panel to edit its time, price, and groomer — or jump to the reservation.
  const [panelId, setPanelId] = useState<string | null>(null);
  const [panelTime, setPanelTime] = useState("09:00");
  const [panelPrice, setPanelPrice] = useState("");
  const [panelMsg, setPanelMsg] = useState<string | null>(null);
  const [panelBusy, setPanelBusy] = useState(false);
  const panelCard = cards.find((c) => c.id === panelId) ?? null;

  function openPanel(c: ApptCard) {
    setPanelId(c.id);
    const d = new Date(c.time);
    setPanelTime(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    setPanelPrice(c.price != null ? String(c.price) : "");
    setPanelMsg(null);
  }

  async function savePanelTime() {
    if (!panelCard) return;
    const [h, m] = panelTime.split(":").map(Number);
    const start = new Date(panelCard.time);
    start.setHours(h, m, 0, 0);
    const end = new Date(start.getTime() + durationOf(panelCard) * 60000);
    setPanelBusy(true);
    setPanelMsg(null);
    try {
      await rescheduleAppointment(panelCard.id, start.toISOString(), end.toISOString());
      setCards((prev) =>
        prev.map((c) => (c.id === panelCard.id ? { ...c, time: start.toISOString(), endTime: end.toISOString() } : c))
      );
      setPanelMsg("Time updated ✓");
    } catch (e) {
      setPanelMsg(e instanceof Error ? e.message : "Couldn't update the time.");
    } finally {
      setPanelBusy(false);
    }
  }

  async function savePanelPrice() {
    if (!panelCard || !facilityId || !panelCard.animalId || !panelCard.serviceName) return;
    const price = Number(panelPrice);
    if (!Number.isFinite(price) || price < 0) {
      setPanelMsg("Enter a valid price.");
      return;
    }
    setPanelBusy(true);
    setPanelMsg(null);
    try {
      await saveGroomingPrice(facilityId, panelCard.animalId, panelCard.serviceName, price);
      setCards((prev) => prev.map((c) => (c.id === panelCard.id ? { ...c, price } : c)));
      setPanelMsg("Price saved ✓ — it'll prefill at checkout.");
    } catch (e) {
      setPanelMsg(e instanceof Error ? e.message : "Couldn't save the price.");
    } finally {
      setPanelBusy(false);
    }
  }

  function move(reservationId: string, specialistId: string | null) {
    setCards((prev) => prev.map((c) => (c.id === reservationId ? { ...c, specialistId } : c)));
    startTransition(() => {
      assignSpecialist(reservationId, specialistId).catch(() => setCards(initialCards));
    });
  }

  const grooming = cards.filter((c) => c.category === "grooming");
  const evaluations = cards.filter((c) => c.category === "evaluation");
  const incoming = cards.filter((c) => c.category !== "grooming" && c.category !== "evaluation");

  const groomingCols: { id: string | null; name: string }[] = [
    { id: null, name: "Unassigned" },
    ...specialists.map((s) => ({ id: s.id, name: s.name })),
  ];

  // Time range: 7am–7pm by default, widened to fit anything outside that.
  const { rangeStart, rangeEnd } = useMemo(() => {
    let start = 7 * 60;
    let end = 19 * 60;
    for (const c of cards) {
      const m = minutesOfDay(c.time);
      start = Math.min(start, Math.floor(m / 60) * 60);
      end = Math.max(end, Math.ceil((m + durationOf(c)) / 60) * 60);
    }
    return { rangeStart: start, rangeEnd: end };
  }, [cards]);

  // Blackout overlay for a lane. Clamped to the visible range — an all-day
  // block starting at 00:00 shouldn't stretch the grid to midnight.
  function BlockOverlay({ b }: { b: SpecialistBlock }) {
    const startMin = Math.max(minutesOfDay(b.startAt), rangeStart);
    const endMinRaw = minutesOfDay(b.endAt);
    // end at 23:59 (all-day) clamps to bottom of visible range
    const endMin = Math.min(endMinRaw <= startMin ? rangeEnd : endMinRaw, rangeEnd);
    return (
      <div
        style={{
          position: "absolute",
          top: (startMin - rangeStart) * PX_PER_MIN,
          height: Math.max((endMin - startMin) * PX_PER_MIN, 24),
          left: 2,
          right: 2,
        }}
        title={b.reason ?? "Blocked"}
        className="z-[1] flex items-start justify-between gap-1 overflow-hidden rounded-md border border-slate-300 bg-slate-200/80 px-2 py-1 text-[11px] text-slate-600 [background-image:repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(100,116,139,0.15)_6px,rgba(100,116,139,0.15)_12px)] dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-300"
      >
        <span className="truncate font-medium">🚫 {b.reason ?? "Blocked"}</span>
        <button
          type="button"
          title="Remove block"
          aria-label="Remove block"
          onClick={(e) => {
            e.stopPropagation();
            if (!window.confirm("Remove this block?")) return;
            startTransition(() => {
              deleteAvailabilityBlock(b.id).catch(() => {});
            });
          }}
          className="shrink-0 rounded px-1 text-slate-400 hover:bg-slate-300/60 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-100"
        >
          ✕
        </button>
      </div>
    );
  }

  const gridHeight = (rangeEnd - rangeStart) * PX_PER_MIN;
  const hourMarks = useMemo(() => {
    const marks: number[] = [];
    for (let m = rangeStart; m <= rangeEnd; m += 60) marks.push(m);
    return marks;
  }, [rangeStart, rangeEnd]);

  function topFor(iso: string) {
    return (minutesOfDay(iso) - rangeStart) * PX_PER_MIN;
  }

  function TimeCard({
    c,
    draggable,
    col,
    of,
    overlap,
    warnOnOverlap,
  }: {
    c: ApptCard;
    draggable: boolean;
    col: number;
    of: number;
    overlap: boolean;
    warnOnOverlap: boolean;
  }) {
    const flagged = overlap && warnOnOverlap;
    // Side-by-side split when double-booked, instead of fully stacking and
    // hiding one appointment behind the other.
    const widthPct = 100 / of;
    return (
      <div
        draggable={draggable}
        onDragStart={
          draggable
            ? (e) => {
                e.stopPropagation();
                setDragId(c.id);
              }
            : undefined
        }
        onDragEnd={draggable ? () => setDragId(null) : undefined}
        onClick={(e) => {
          e.stopPropagation();
          // One click does both: opens the manage panel (time / price /
          // groomer / open reservation) and, on groomer lanes, arms the
          // tap-to-move flow that was already here.
          openPanel(c);
          if (draggable) setSelectedId((cur) => (cur === c.id ? null : c.id));
        }}
        title={flagged ? "Double-booked with another appointment for this specialist" : undefined}
        style={{
          position: "absolute",
          top: topFor(c.time),
          left: `calc(${col * widthPct}% + 3px)`,
          width: `calc(${widthPct}% - 6px)`,
          minHeight: durationOf(c) * PX_PER_MIN,
        }}
        className={`overflow-hidden rounded-[10px] border border-l-[3px] bg-white px-2 py-1 text-xs shadow-sm dark:bg-slate-900 ${
          c.category === "grooming"
            ? "border-l-pink-500"
            : c.category === "evaluation"
              ? "border-l-amber-500"
              : "border-l-violet-500"
        } ${draggable ? "cursor-grab touch-manipulation active:cursor-grabbing" : "cursor-pointer"} ${
          selectedId === c.id
            ? "border-indigo-500 ring-2 ring-indigo-500 dark:border-indigo-400 dark:ring-indigo-400"
            : flagged
              ? "border-red-400 ring-1 ring-red-400 dark:border-red-500 dark:ring-red-500"
              : "border-[#e3e5ea] dark:border-slate-700"
        } ${dragId === c.id ? "opacity-40" : ""}`}
      >
        <div className="flex items-center justify-between gap-1">
          <span className="truncate font-semibold text-[#15181d] dark:text-slate-100">
            {flagged && "⚠️ "}
            {c.animalName}
          </span>
          <span className="shrink-0 text-[10px] font-medium text-[#8a91a0] dark:text-slate-500">{fmtTime(c.time)}</span>
        </div>
        <div className="truncate text-[10px] text-[#8a91a0] dark:text-slate-500">
          {c.breed ?? "—"} · {c.serviceName ?? c.typeName ?? "—"} {c.status === "checked_in" ? "🟢" : ""}
        </div>
      </div>
    );
  }

  function Lane({
    colId,
    name,
    items,
    droppable,
    accent,
  }: {
    colId: string | null;
    name: string;
    items: ApptCard[];
    droppable: boolean;
    accent: string;
  }) {
    const key = colId ?? name;
    const isOver = droppable && overKey === key;
    // Overbooking is only a meaningful "conflict" once a real specialist is
    // assigned — the Unassigned column and read-only lanes (evaluations,
    // daycare/boarding) just render side-by-side without the warning color.
    const warnOnOverlap = droppable && colId !== null;
    const positioned = layoutOverlaps(items);
    return (
      <div className="flex shrink-0 flex-col" style={{ width: LANE_WIDTH }}>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-1 truncate rounded-t-[10px] border border-b-0 border-[#e3e5ea] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#15181d] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          <span className="truncate">
            {colId !== null && blocks.some((b) => b.specialistId === colId) && "🚫 "}
            {name}
          </span>
          <span className="shrink-0 rounded-full bg-[#f1f2f5] px-1.5 py-0.5 text-[11px] font-medium text-[#565d6d] dark:bg-slate-800 dark:text-slate-400">
            {items.length}
          </span>
        </div>
        <div
          onClick={
            droppable
              ? () => {
                  if (!selectedId) return;
                  move(selectedId, colId);
                  setSelectedId(null);
                }
              : undefined
          }
          onDragOver={
            droppable
              ? (e) => {
                  e.preventDefault();
                  setOverKey(key);
                }
              : undefined
          }
          onDragLeave={droppable ? () => setOverKey((cur) => (cur === key ? null : cur)) : undefined}
          onDrop={
            droppable
              ? (e) => {
                  e.preventDefault();
                  if (dragId) move(dragId, colId);
                  setDragId(null);
                  setOverKey(null);
                }
              : undefined
          }
          style={{ height: gridHeight }}
          className={`relative overflow-hidden rounded-b-[10px] border transition-colors ${accent} ${
            isOver ? "border-indigo-500 dark:border-indigo-400" : ""
          } ${droppable && selectedId ? "cursor-pointer" : ""}`}
        >
          {hourMarks.map((m) => (
            <div
              key={m}
              style={{ top: (m - rangeStart) * PX_PER_MIN }}
              className="absolute left-0 right-0 border-t border-slate-100 dark:border-slate-800/70"
            />
          ))}
          {colId !== null &&
            droppable &&
            blocks
              .filter((b) => b.specialistId === colId)
              .map((b) => <BlockOverlay key={b.id} b={b} />)}
          {positioned.map(({ c, col, of, overlap }) => (
            <TimeCard key={c.id} c={c} draggable={droppable} col={col} of={of} overlap={overlap} warnOnOverlap={warnOnOverlap} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] font-medium text-[#565d6d] dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-pink-500" /> Grooming ({grooming.length})
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Evaluations ({evaluations.length})
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-violet-500" /> Daycare + Boarding ({incoming.length})
        </span>
      </div>
      {specialists.length === 0 && (
        <p className="mb-2 text-xs text-amber-600 dark:text-amber-400">
          No specialist staff marked yet — add groomers on the Staff/Pricing setup to get named columns here.
        </p>
      )}
      {/* overflow-auto + bounded max-height (not just overflow-x-auto) so the
          specialist header row's sticky top-0 actually freezes — an
          x-only scroll container won't reliably stick to page scroll. */}
      <div className="flex max-h-[75vh] gap-3 overflow-auto pb-2">
        {/* Hour label rail */}
        <div className="flex shrink-0 flex-col" style={{ width: 46 }}>
          <div className="h-[30px]" />
          <div className="relative" style={{ height: gridHeight }}>
            {hourMarks.map((m) => (
              <div
                key={m}
                style={{ top: (m - rangeStart) * PX_PER_MIN }}
                className="absolute right-0 -translate-y-1/2 text-[11px] text-slate-400 dark:text-slate-500"
              >
                {fmtHourMark(m)}
              </div>
            ))}
          </div>
        </div>

        {groomingCols.map((col) => (
          <Lane
            key={col.id ?? "unassigned-grooming"}
            colId={col.id}
            name={col.name}
            items={grooming.filter((c) => c.specialistId === col.id)}
            droppable
            accent={
              col.id === null
                ? "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20"
                : "border-[#e3e5ea] bg-[#fafbfc] dark:border-slate-700 dark:bg-slate-900/40"
            }
          />
        ))}
        <Lane
          colId="evaluations"
          name="Evaluations"
          items={evaluations}
          droppable={false}
          accent="border-sky-200 bg-sky-50/50 dark:border-sky-900 dark:bg-sky-950/20"
        />
        <Lane
          colId="incoming"
          name="Daycare + Boarding"
          items={incoming}
          droppable={false}
          accent="border-[#e3e5ea] bg-violet-50/30 dark:border-slate-700 dark:bg-slate-900/40"
        />
      </div>

      {/* Manage panel — bottom sheet on phones, floating card on desktop. */}
      {panelCard && (
        <div className="fixed inset-x-0 bottom-0 z-50 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[360px]">
          <div className="rounded-t-2xl border border-[#e3e5ea] bg-white p-4 shadow-2xl sm:rounded-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold text-[#15181d] dark:text-slate-100">
                  {panelCard.animalName}
                  {panelCard.status === "checked_in" && <span className="ml-1.5 text-[12px]">🟢 here</span>}
                </div>
                <div className="truncate text-[12px] text-[#8a91a0] dark:text-slate-500">
                  {panelCard.breed ?? "—"} · {panelCard.serviceName ?? panelCard.typeName ?? "—"} ·{" "}
                  {fmtTime(panelCard.time)}–{fmtTime(panelCard.endTime)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPanelId(null);
                  setSelectedId(null);
                }}
                aria-label="Close"
                className="shrink-0 rounded-md px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-xs">
                <span className="block text-[#8a91a0] dark:text-slate-500">Time</span>
                <div className="mt-1 flex gap-1.5">
                  <select
                    value={panelTime}
                    onChange={(e) => setPanelTime(e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    {TIME_SLOTS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={panelBusy}
                    onClick={savePanelTime}
                    className="rounded-lg bg-indigo-600 px-2.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    Set
                  </button>
                </div>
              </label>
              {panelCard.category === "grooming" && panelCard.animalId && panelCard.serviceName && facilityId ? (
                <label className="text-xs">
                  <span className="block text-[#8a91a0] dark:text-slate-500">Price ($)</span>
                  <div className="mt-1 flex gap-1.5">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={panelPrice}
                      onChange={(e) => setPanelPrice(e.target.value)}
                      placeholder="0.00"
                      className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      disabled={panelBusy}
                      onClick={savePanelPrice}
                      className="rounded-lg bg-indigo-600 px-2.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                </label>
              ) : (
                <div className="text-xs text-[#8a91a0] dark:text-slate-500">
                  <span className="block">Price</span>
                  <p className="mt-2">Set at checkout for this type.</p>
                </div>
              )}
            </div>

            {panelCard.category === "grooming" && (
              <label className="mt-2 block text-xs">
                <span className="block text-[#8a91a0] dark:text-slate-500">Groomer</span>
                <select
                  value={panelCard.specialistId ?? ""}
                  onChange={(e) => {
                    const sid = e.target.value || null;
                    move(panelCard.id, sid);
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="">Unassigned</option>
                  {specialists.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {panelMsg && (
              <p className="mt-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {panelMsg}
              </p>
            )}

            <Link
              href={`/reservations/${panelCard.id}`}
              className="mt-3 flex h-9 items-center justify-center rounded-[10px] border border-[#e3e5ea] text-[13px] font-semibold text-[#565d6d] transition-colors hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-300"
            >
              Open full reservation →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
