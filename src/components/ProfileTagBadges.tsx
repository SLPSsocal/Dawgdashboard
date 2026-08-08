// A bare emoji with only a hover tooltip is unreadable — staff had no way to
// know what a green flask next to a name meant, and touch devices get no
// hover at all. Two modes now:
//   variant="icon"  compact rows (tables/lists) — icon + native tooltip
//   variant="chip"  detail pages — icon + name, and the note underneath
export default function ProfileTagBadges({
  tags,
  className,
  variant = "icon",
}: {
  tags: { icon: string; name: string; note?: string | null }[];
  className?: string;
  variant?: "icon" | "chip";
}) {
  if (tags.length === 0) return null;

  if (variant === "chip") {
    return (
      <span className={className ?? "flex flex-wrap items-center gap-1.5"}>
        {tags.map((t, i) => (
          <span
            key={i}
            title={t.note ? `${t.name} — ${t.note}` : t.name}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[12px] text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <span className="leading-none">{t.icon}</span>
            <span>{t.name}</span>
            {t.note && <span className="text-slate-400 dark:text-slate-500">· {t.note}</span>}
          </span>
        ))}
      </span>
    );
  }

  return (
    <span className={className ?? "inline-flex items-center gap-1"}>
      {tags.map((t, i) => (
        <span
          key={i}
          title={t.note ? `${t.name} — ${t.note}` : t.name}
          aria-label={t.name}
          className="cursor-help text-sm leading-none"
        >
          {t.icon}
        </span>
      ))}
    </span>
  );
}
