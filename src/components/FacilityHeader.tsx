import { logout } from "@/app/logout/actions";
import type { Session } from "@/lib/session";

const modules = [
  { name: "Check-in", href: "/reservations" },
  { name: "Animals", href: "/animals" },
  { name: "Parents", href: "/parents" },
  { name: "Lodging", href: "/lodging" },
];

export default function FacilityHeader({ session }: { session: Session }) {
  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-neutral-400">
            {session.facilityName}
          </div>
          <nav className="mt-1 flex gap-4 text-sm">
            {modules.map((m) => (
              <a key={m.href} href={m.href} className="text-neutral-600 hover:text-neutral-900">
                {m.name}
              </a>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-neutral-500">
          <span>{session.staffName}</span>
          <form action={logout}>
            <button className="underline">Log out</button>
          </form>
        </div>
      </div>
    </header>
  );
}
