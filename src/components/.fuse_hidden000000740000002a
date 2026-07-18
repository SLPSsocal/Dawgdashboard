"use client";

import { Fragment, useState, useTransition } from "react";
import { assignLodging } from "@/app/lodging/actions";

export type CalArea = {
  id: string;
  name: string;
  area_type: string;
  capacity: number;
};

export type CalReservation = {
  id: string;
  animalName: string;
  breed: string | null;
  status: string;
  typeName: string | null;
  lodgingAreaId: string | null;
  startDate: string;
  endDate: string;
};

const TYPE_LABELS: Record<string, string> = {
  cat_suite: "🐱 Cat Suites",
  dog_suite: "🐶 Dog Suites",
  xl_suite: "🐕 XL Suites",
  kennel: "Kennels",
  suite: "Suites",
  run: "Runs",
  daycare_pen: "Daycare Pens",
};

function typeLabel(t: string) {
  return TYPE_LABELS[t] ?? t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function dayLabel(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString([], { weekday: "short", day: "numeric" });
}

// Does this reservation occupy the given calendar day? Compares date-only,
// end date is exclusive (checkout day itself isn't occupied).
function occupiesDay(r: CalReservation, dayIso: string) {
  const day = dayIso;
  const start = r.startDate.slice(0, 10);
  const end = r.endDate.slice(0, 10);
  return day >= start && day < end;
}

export default function LodgingCalendar({
  areas,
  days,
  initialReservations,
}: {
  areas: CalArea[];
  days: string[];
  initialReservations: CalReservation[];
}) {
  const [reservations, setReservations] = useState(initialReservations);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overRow, setOverRow] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function move(reservationId: string, areaId: string | null) {
    setReservations((prev) =>
      prev.map((r) => (r.id === reservationId ? { ...r, lodgingAreaId: areaId } : r))
    );
    startTransition(() => {
      assignLodging(reservationId, areaId).catch(() => {
        setReservations(initialReservations);
      });
    });
  }

  // Group areas by area_type, in first-seen order.
  const groups: { type: string; areas: CalArea[] }[] = [];
  for (const a of areas) {
    let g = groups.find((g) => g.type === a.area_type);
    if (!g) {
      g = { type: a.area_type, areas: [] };
      groups.push(g);
    }
    g.areas.push(a);
  }

  const gridCols = "grid-cols-[140px_repeat(7,minmax(84px,1fr))]";

  function Chip({ r }: { r: CalReservation }) {
    const isSelected = selectedId === r.id;
    return (
      <div
        draggable
        onDragStart={(e) => {
          e.stopPropagation();
          setDragId(r.id);
        }}
        onDragEnd={() => setDragId(null)}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedId((cur) => (cur === r.id ? null : r.id));
        }}
        title={`${r.animalName} · ${r.typeName ?? "—"} · ${r.status === "checked_in" ? "checked in" : "expected"}`}
        className={`cursor-grab touch-manipulation truncate rounded-md border px-1.5 py-1 text-[11px] font-medium shadow-sm active:cursor-grabbing ${
          r.status === "checked_in"
            ? "border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300"
            : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
        } ${isSelected ? "ring-2 ring-neutral-900 dark:ring-neutral-100" : ""} ${dragId === r.id ? "opacity-40" : ""}`}
      >
        {r.animalName}
      </div>
    );
  }

  function Row({ areaId, label, capacity }: { areaId: string | null; label: string; capacity?: number }) {
    const key = areaId ?? "unassigned";
    const isOver = overRow === key;
    const rowProps = {
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        setOverRow(key);
      },
      onDragLeave: () => setOverRow((cur) => (cur === key ? null : cur)),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        if (dragId) move(dragId, areaId);
        setDragId(null);
        setOverRow(null);
      },
      onClick: () => {
        if (!selectedId) return;
        move(selectedId, areaId);
        setSelectedId(null);
      },
    };

    const cellsHere = days.map((d) => reservations.filter((r) => r.lodgingAreaId === areaId && occupiesDay(r, d)));
    const maxHere = Math.max(0, ...cellsHere.map((c) => c.length));
    const overCapacity = capacity != null && maxHere > capacity;

    return (
      <>
        <div
          {...rowProps}
          className={`sticky left-0 flex items-center justify-between gap-1 border-b border-r border-neutral-200 bg-white px-2 py-1.5 text-xs font-semibold dark:border-neutral-800 dark:bg-neutral-900 ${
            isOver ? "bg-neutral-100 dark:bg-neutral-800" : ""
          } ${selectedId ? "cursor-pointer" : ""} ${areaId === null ? "text-amber-600 dark:text-amber-400" : ""}`}
        >
          <span className="truncate">{label}</span>
          {capacity != null && (
            <span className={overCapacity ? "font-semibold text-red-500 dark:text-red-400" : "text-neutral-400 dark:text-neutral-500"}>
              {maxHere}/{capacity}
            </span>
          )}
        </div>
        {days.map((d, i) => (
          <div
            key={d}
            {...rowProps}
            className={`flex min-h-[46px] flex-col gap-1 border-b border-r border-neutral-100 p-1 last:border-r-0 dark:border-neutral-800 ${
              isOver ? "bg-neutral-100 dark:bg-neutral-800" : "bg-white dark:bg-neutral-900"
            } ${selectedId ? "cursor-pointer" : ""}`}
          >
            {cellsHere[i].map((r) => (
              <Chip key={r.id} r={r} />
            ))}
          </div>
        ))}
      </>
    );
  }

  return (
    <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-200 shadow-sm dark:border-neutral-800">
      <div className={`grid ${gridCols} min-w-[760px]`}>
        {/* Header row */}
        <div className="sticky left-0 z-10 border-b border-r border-neutral-200 bg-neutral-50 px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-400">
          Suite
        </div>
        {days.map((d) => (
          <div
            key={d}
            className="border-b border-r border-neutral-200 bg-neutral-50 px-2 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-neutral-500 last:border-r-0 dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-400"
          >
            {dayLabel(d)}
          </div>
        ))}

        {/* Unassigned row */}
        <Row areaId={null} label="⚠️ Unassigned" />

        {groups.map((g) => (
          <Fragment key={g.type}>
            <div
              className="border-b border-neutral-200 bg-neutral-100 px-2 py-1 text-xs font-semibold text-neutral-600 dark:border-neutral-800 dark:bg-neutral-800/60 dark:text-neutral-300"
              style={{ gridColumn: "1 / -1" }}
            >
              {typeLabel(g.type)}
            </div>
            {g.areas.map((a) => (
              <Row key={a.id} areaId={a.id} label={a.name} capacity={a.capacity} />
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
