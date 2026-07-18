import { redirect } from "next/navigation";

// The same-day Kanban lodging board was retired — the Lodging Calendar
// (week view) is now the single place to assign/reassign suites, and it
// also has the "+ Add Lodging Area" form that used to live here. This
// redirect exists so old links/bookmarks to /lodging still land somewhere.
export default function LodgingPage() {
  redirect("/lodging/calendar");
}
