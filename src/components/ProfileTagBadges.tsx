// Pure display — a small row of tag icons, each with a hover tooltip
// showing the tag name and any staff note. No client JS needed, so this can
// drop straight into server-rendered list/board rows next to a hyperlinked
// animal or parent name.
export default function ProfileTagBadges({
  tags,
  className,
}: {
  tags: { icon: string; name: string; note?: string | null }[];
  className?: string;
}) {
  if (tags.length === 0) return null;
  return (
    <span className={className ?? "inline-flex items-center gap-1"}>
      {tags.map((t, i) => (
        <span key={i} title={t.note ? `${t.name}: ${t.note}` : t.name} className="text-sm leading-none">
          {t.icon}
        </span>
      ))}
    </span>
  );
}
