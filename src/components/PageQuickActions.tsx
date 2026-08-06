import type { Session } from "@/lib/session";

// DEPRECATED — renders nothing.
//
// Navigation moved into <FacilityHeader /> (see AppNav). This used to emit a
// 12-button pill block into every page's content area, which is what pushed
// actual page content halfway down the screen. Kept as a no-op shim so the
// ~17 pages that still call it don't need touching in one pass; new pages
// should not use it, and remaining call sites can be deleted opportunistically.
export default async function PageQuickActions(_props: { session: Session }) {
  void _props;
  return null;
}
