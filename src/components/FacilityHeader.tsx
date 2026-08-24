import { logout } from "@/app/logout/actions";
import type { Session } from "@/lib/session";
import ThemeToggle from "@/components/ThemeToggle";
import CartButton from "@/components/CartButton";
import SupportWidget from "@/components/SupportWidget";
import DawgAssistant from "@/components/DawgAssistant";
import AppNav from "@/components/AppNav";
import Link from "next/link";

// Single ~56px app bar: identity left, consolidated nav in the middle, the
// one primary CTA plus account controls on the right. Navigation used to be a
// 12-pill block inside every page's content area, which pushed real data far
// below the fold — this reclaims that space for the whole app at once.
export default function FacilityHeader({ session }: { session: Session }) {
  return (
    <>
      {/* NOTE: no backdrop-blur here. A backdrop-filter creates a containing
          block for position:fixed descendants, which was clipping the support
          dialog to the header's 56px box instead of the viewport. */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-4 sm:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-[#15181d] hover:text-indigo-600 dark:text-slate-100 dark:hover:text-indigo-400"
        >
          {/* Logo chip from the redesign — indigo square with the facility initial. */}
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-[13px] font-bold normal-case text-white">
            {session.facilityName.charAt(0)}
          </span>
          <span className="hidden sm:inline">{session.facilityName}</span>
        </Link>

        <div className="min-w-0 flex-1">
          <AppNav />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* The single primary action in the product. */}
          <Link
            href="/reservations/new"
            className="inline-flex h-9 items-center rounded-[10px] bg-indigo-600 px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-indigo-700"
          >
            <span className="sm:hidden">+ Booking</span>
            <span className="hidden sm:inline">+ New booking</span>
          </Link>
          <CartButton />
          <ThemeToggle />
          <span className="hidden text-[13px] text-slate-500 lg:inline dark:text-slate-400">
            {session.staffName}
          </span>
          <form action={logout}>
            <button className="text-[13px] text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100">
              Log out
            </button>
          </form>
        </div>
      </div>
      </header>
      {/* Sibling of the header, not a child — so its fixed positioning is
          relative to the viewport. */}
      <SupportWidget staffName={session.staffName} facilityId={session.facilityId} />
      {/* ✨ assistant launcher — floats above the support button. */}
      <DawgAssistant />
    </>
  );
}
