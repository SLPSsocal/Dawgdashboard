import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import PageQuickActions from "@/components/PageQuickActions";
import { createProfileTag, setProfileTagActive } from "./actions";

type Tag = { id: string; applies_to: string; icon: string; name: string; description: string | null; active: boolean };

function TagGroup({ title, tags }: { title: string; tags: Tag[] }) {
  const active = tags.filter((t) => t.active);
  const disabled = tags.filter((t) => !t.active);
  return (
    <div className="rounded-xl border border-slate-300 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
        {title} <span className="font-normal text-slate-400 dark:text-slate-500">({active.length} enabled)</span>
      </h2>
      <div className="mt-3 flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
        {[...active, ...disabled].map((t) => (
          <div key={t.id} className="flex items-center justify-between gap-3 py-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-lg">{t.icon}</span>
              <span className={t.active ? "" : "text-slate-400 line-through dark:text-slate-600"}>{t.name}</span>
              {t.description && (
                <span className="text-xs text-slate-400 dark:text-slate-500">— {t.description}</span>
              )}
            </div>
            <form action={setProfileTagActive.bind(null, t.id, !t.active)}>
              <button
                type="submit"
                aria-label={t.active ? "Disable" : "Enable"}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                  t.active ? "bg-green-500" : "bg-slate-300 dark:bg-slate-700"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    t.active ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </form>
          </div>
        ))}
        {tags.length === 0 && <p className="py-4 text-sm text-slate-400 dark:text-slate-500">No tags yet.</p>}
      </div>
    </div>
  );
}

export default async function ProfileTagsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = createClient();
  const { data: tags } = await supabase
    .from("profile_tags")
    .select("id, applies_to, icon, name, description, active")
    .order("name");

  const all = (tags as unknown as Tag[]) ?? [];
  const animalTags = all.filter((t) => t.applies_to === "animal");
  const parentTags = all.filter((t) => t.applies_to === "parent");

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="text-xl font-semibold">Profile Tags</h1>
        <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">
          Icons staff can attach to a dog or parent profile — shown next to their name on lists and the check-in
          board so a quick glance surfaces things like &quot;dog aggressive&quot; or &quot;picky eater&quot;.
          Shared across all facilities. Disabling a tag removes it going forward; dogs/parents that already have it
          keep showing it.
        </p>

        <div className="mt-3">
          <PageQuickActions session={session!} />
        </div>

        <div className="mt-6 flex flex-col gap-4">
          <TagGroup title="🐾 Animal Tags" tags={animalTags} />
          <TagGroup title="👤 Parent Tags" tags={parentTags} />

          <div className="rounded-xl border border-slate-300 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">+ Add a Tag</h2>
            <form action={createProfileTag} className="mt-3 flex flex-wrap items-end gap-2">
              <label className="text-xs">
                <span className="block text-slate-500 dark:text-slate-400">Icon</span>
                <input
                  name="icon"
                  required
                  placeholder="🐾"
                  className="mt-1 w-16 rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
              <label className="text-xs">
                <span className="block text-slate-500 dark:text-slate-400">Applies To</span>
                <select
                  name="applies_to"
                  defaultValue="animal"
                  className="mt-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="animal">Animal</option>
                  <option value="parent">Parent</option>
                </select>
              </label>
              <label className="flex-1 text-xs">
                <span className="block text-slate-500 dark:text-slate-400">Name</span>
                <input
                  name="name"
                  required
                  placeholder="e.g. Nail Trim Only"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
              <label className="flex-1 text-xs">
                <span className="block text-slate-500 dark:text-slate-400">Description (optional)</span>
                <input
                  name="description"
                  placeholder="What this is for"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
              <button
                type="submit"
                className="rounded-lg bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"
              >
                + Add
              </button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
