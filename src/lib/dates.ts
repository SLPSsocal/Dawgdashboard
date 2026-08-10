// Facility-local (Pacific) calendar-date helpers.
//
// Comparing `iso.slice(0, 10)` compares UTC dates, and 5:00 PM PT is already
// past midnight UTC — so a 9-to-5 daycare visit read as "ends tomorrow" and
// evening departures inflated the Overnight count (QA finding). All boards
// should compare LOCAL calendar days instead.
const PT = "America/Los_Angeles";

/** YYYY-MM-DD of an ISO timestamp in facility-local time. */
export function ymdLocal(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PT }).format(new Date(iso));
}

/** Today's YYYY-MM-DD in facility-local time. */
export function todayLocal(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PT }).format(new Date());
}
