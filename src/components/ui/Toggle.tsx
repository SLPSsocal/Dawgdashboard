// Shared on/off switch for settings rows.
//
// The previous inline version put the knob in an absolutely-positioned span
// with no left anchor and let the wrapping <form> size itself, so the control
// could overflow its own column and sit on top of the label next to it — the
// first letters of "Drove By", "Facebook" etc. disappeared behind the knob.
// Fixing it here rather than per-page:
//   - the track is a fixed 40x22 with shrink-0 so it can never be squeezed
//   - the knob is anchored with left-0.5 (not left-auto) and moves by a
//     translate that's derived from the track/knob size, so it always lands
//     inside the track
//   - the caller is expected to give this its own grid/flex column
const TRACK = "h-[22px] w-10"; // 40 x 22
const KNOB = "h-[18px] w-[18px]"; // 18, leaving 2px inset all round

export default function Toggle({
  checked,
  label,
  className = "",
}: {
  checked: boolean;
  /** Accessible name — the visible text lives in the row, not in here. */
  label: string;
  className?: string;
}) {
  return (
    <span
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`relative inline-flex shrink-0 items-center rounded-full transition-colors ${TRACK} ${
        checked
          ? "bg-emerald-500 dark:bg-emerald-500"
          : "bg-slate-300 dark:bg-slate-700"
      } ${className}`}
    >
      <span
        className={`absolute left-0.5 rounded-full bg-white shadow-sm transition-transform duration-150 ${KNOB} ${
          checked ? "translate-x-[18px]" : "translate-x-0"
        }`}
      />
    </span>
  );
}
