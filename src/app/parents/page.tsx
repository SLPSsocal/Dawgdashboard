import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";

export default async function ParentsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Shared table — same reasoning as Animals.
  const supabase = createClient();
  const { data: parents } = await supabase
    .from("parents")
    .select("id, first_name, last_name, phone, email")
    .order("last_name");

  return (
    <main className="min-h-screen bg-neutral-50">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Parents</h1>
            <p className="text-sm text-neutral-400">Shared across all facilities</p>
          </div>
          <a
            href="/parents/new"
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
          >
            + New Parent
          </a>
        </div>

        {(!parents || parents.length === 0) && (
          <p className="mt-8 text-sm text-neutral-400">No parents yet.</p>
        )}

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(parents ?? []).map((p) => (
            <a
              key={p.id}
              href={`/parents/${p.id}`}
              className="rounded-lg border border-neutral-200 bg-white p-4 hover:border-neutral-400"
            >
              <div className="font-medium">{p.first_name} {p.last_name}</div>
              <div className="text-sm text-neutral-500">{p.phone ?? "—"} · {p.email ?? "—"}</div>
            </a>
          ))}
        </div>
      </div>
    </main>
  );
}
