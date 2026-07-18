import { logout } from "@/app/logout/actions";
import type { Session } from "@/lib/session";
import ThemeToggle from "@/components/ThemeToggle";

const modules = [
  { name: "Check-in", href: "/reservations" },
  { name: "Animals", href: "/animals" },
  { name: "Parents", href: "/parents" },
  { name: "Lodging", href: "/lodging" },
  { name: "Lodging Calendar", href: "/lodging/calendar" },
  { name: "Facility Calendar", href: "/facility-calendar" },
  { name: "Pricing", href: "/pricing" },
];

export default function FacilityHeader({ session }: { session: Session }) {
  return (
    <header className="border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
            {session.facilityName}
          </div>
          <div className="flex items-center gap-3 text-sm text-neutral-500 dark:text-neutral-400">
            <span className="hidden sm:inline">{session.staffName}</span>
            <ThemeToggle />
            <form action={logout}>
              <button className="underline">Log out</button>
            </form>
          </div>
        </div>
        <nav className="-mx-1 flex gap-1 overflow-x-auto text-sm">
          {modules.map((m) => (
            <a
              key={m.href}
              href={m.href}
              className="shrink-0 rounded-md px-2 py-1 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
            >
              {m.name}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
