import { logout } from "@/app/logout/actions";
import type { Session } from "@/lib/session";
import ThemeToggle from "@/components/ThemeToggle";
import CartButton from "@/components/CartButton";

// Slim identity strip only — nav/quick-actions moved into page content via
// <PageQuickActions/> so this doesn't eat vertical space on every page.
export default function FacilityHeader({ session }: { session: Session }) {
  return (
    <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto grid max-w-5xl grid-cols-3 items-center gap-3 px-4 py-2 sm:px-6">
        <div />
        <a
          href="/"
          className="justify-self-center text-sm font-semibold uppercase tracking-wide text-slate-700 hover:text-indigo-600 dark:text-slate-200 dark:hover:text-indigo-400"
        >
          {session.facilityName}
        </a>
        <div className="flex items-center justify-self-end gap-3 text-sm text-slate-500 dark:text-slate-400">
          <span className="hidden sm:inline">{session.staffName}</span>
          <CartButton />
          <ThemeToggle />
          <form action={logout}>
            <button className="underline">Log out</button>
          </form>
        </div>
      </div>
    </header>
  );
}
