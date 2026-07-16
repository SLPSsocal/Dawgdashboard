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
        <h1 className="text-xl font-semibold">Parents</h1>
        <p className="text-sm text-neutral-400">Shared across all facilities</p>

        {(!parents || parents.length === 0) && (
          <p className="mt-8 text-sm text-neutral-400">No parents yet.</p>
        )}

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(parents ?? []).map((p) => (
            <div key={p.id} className="rounded-lg border border-neutral-200 bg-white p-4">
              <div className="font-medium">{p.first_name} {p.last_name}</div>
              <div className="text-sm text-neutral-500">{p.phone ?? "—"} · {p.email ?? "—"}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
