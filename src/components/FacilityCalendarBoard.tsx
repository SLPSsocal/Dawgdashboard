"use client";

import { useMemo, useState, useTransition } from "react";
import { assignSpecialist } from "@/app/facility-calendar/actions";

export type Specialist = { id: string; name: string };

export type ApptCard = {
  id: string;
  animalName: string;
  breed: string | null;
  status: string;
  typeName: string | null;
  category: string | null;
  specialistId: string | null;
  time: string; // ISO timestamp
};

// No per-reservation-type duration data exists yet, so every card renders as
// a fixed-height block anchored at its start time. Vertical axis = time of
// day, earliest at top.
const DEFAULT_BLOCK_MIN = 45;
const PX_PER_MIN = 1.4;
const LANE_WIDTH = 200;

function minutesOfDay(iso: string) {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
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

export default function FacilityCalendarBoard({
  specialists,
  cards: initialCards,
}: {
  specialists: Specialist[];
  cards: ApptCard[];
}) {
  const [cards, setCards] = useState(initialCards);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();

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
      end = Math.max(end, Math.ceil((m + DEFAULT_BLOCK_MIN) / 60) * 60);
    }
    return { rangeStart: start, rangeEnd: end };
  }, [cards]);

  const gridHeight = (rangeEnd - rangeStart) * PX_PER_MIN;
  const hourMarks = useMemo(() => {
    const marks: number[] = [];
    for (let m = rangeStart; m <= rangeEnd; m += 60) marks.push(m);
    return marks;
  }, [rangeStart, rangeEnd]);

  function topFor(iso: string) {
    return (minutesOfDay(iso) - rangeStart) * PX_PER_MIN;
  }

  function TimeCard({ c, draggable }: { c: ApptCard; draggable: boolean }) {
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
        onClick={
          draggable
            ? (e) => {
                e.stopPropagation();
                setSelectedId((cur) => (cur === c.id ? null : c.id));
              }
            : undefined
        }
        style={{
          position: "absolute",
          top: topFor(c.time),
          left: 3,
          right: 3,
          minHeight: DEFAULT_BLOCK_MIN * PX_PER_MIN,
        }}
        className={`overflow-hidden rounded-md border bg-white px-2 py-1 text-xs shadow-sm dark:bg-slate-900 ${
          draggable ? "cursor-grab touch-manipulation active:cursor-grabbing" : ""
        } ${
          selectedId === c.id
            ? "border-slate-900 ring-2 ring-slate-900 dark:border-slate-100 dark:ring-slate-100"
            : "border-slate-200 dark:border-slate-700"
        } ${dragId === c.id ? "opacity-40" : ""}`}
      >
        <div className="flex items-center justify-between gap-1">
          <span className="truncate font-medium">{c.animalName}</span>
          <span className="shrink-0 text-[10px] text-slate-400 dark:text-slate-500">{fmtTime(c.time)}</span>
        </div>
        <div className="truncate text-[10px] text-slate-400 dark:text-slate-500">
          {c.breed ?? "—"} · {c.typeName ?? "—"} {c.status === "checked_in" ? "🟢" : ""}
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
    return (
      <div className="flex shrink-0 flex-col" style={{ width: LANE_WIDTH }}>
        <div className="sticky top-0 z-10 truncate rounded-t-lg border border-b-0 border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold dark:border-slate-700 dark:bg-slate-900">
          {name} <span className="font-normal text-slate-400 dark:text-slate-500">({items.length})</span>
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
          className={`relative overflow-hidden rounded-b-lg border transition-colors ${accent} ${
            isOver ? "border-slate-900 dark:border-slate-100" : ""
          } ${droppable && selectedId ? "cursor-pointer" : ""}`}
        >
          {hourMarks.map((m) => (
            <div
              key={m}
              style={{ top: (m - rangeStart) * PX_PER_MIN }}
              className="absolute left-0 right-0 border-t border-slate-100 dark:border-slate-800/70"
            />
          ))}
          {items.map((c) => (
            <TimeCard key={c.id} c={c} draggable={droppable} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3">
      {specialists.length === 0 && (
        <p className="mb-2 text-xs text-amber-600 dark:text-amber-400">
          No specialist staff marked yet — add groomers on the Staff/Pricing setup to get named columns here.
        </p>
      )}
      <div className="flex gap-3 overflow-x-auto pb-2">
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
                ? "border-amber-300 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20"
                : "border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40"
            }
          />
        ))}
        <Lane
          colId="evaluations"
          name="Evaluations"
          items={evaluations}
          droppable={false}
          accent="border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/20"
        />
        <Lane
          colId="incoming"
          name="Daycare + Boarding"
          items={incoming}
          droppable={false}
          accent="border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40"
        />
      </div>
    </div>
  );
}
