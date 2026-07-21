// Converts a wall-clock date+time as experienced in a given IANA timezone
// into the correct UTC Date. Needed because our server runs in UTC — naively
// doing `new Date("2026-07-23T08:00:00")` stores that 8:00 AM as if it were
// UTC, which is wrong for any facility not literally in UTC (this is exactly
// what caused grooming/evaluation appointment times to show hours off from
// what staff actually picked — 8:00 AM Pacific got stored as 8:00 AM UTC and
// displayed back as 1:00 AM).
export function zonedTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  // Treat the wall-clock string as if it were UTC to get a starting instant.
  const naiveUtc = new Date(`${dateStr}T${timeStr}:00Z`);

  // Ask what that instant's wall-clock time looks like in the target zone,
  // then re-parse that as UTC. The gap between the two instants is exactly
  // the zone's offset at this date (correctly handles DST either way).
  const parts = naiveUtc.toLocaleString("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const m = parts.match(/(\d+)\/(\d+)\/(\d+),?\s*(\d+):(\d+):(\d+)/);
  if (!m) return naiveUtc;
  const [, month, day, year, hour, minute, second] = m;
  const hourNum = Number(hour) % 24; // some locales render midnight as "24:00"
  const zonedAsUtc = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), hourNum, Number(minute), Number(second))
  );

  const offsetMs = naiveUtc.getTime() - zonedAsUtc.getTime();
  return new Date(naiveUtc.getTime() + offsetMs);
}
