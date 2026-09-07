import { createClient } from "@/lib/supabase/server";
import { loginQuick } from "./actions";
import ThemeToggle from "@/components/ThemeToggle";

// TEMPORARY: PIN entry is paused during build-out — see loginQuick in
// ./actions.ts. This page is just a facility picker for now.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next } = await searchParams;
  const supabase = createClient();
  const { data: facilities } = await supabase
    .from("facilities")
    .select("id, name, slug")
    .order("name");

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
      <div className="flex justify-end">
        <ThemeToggle />
      </div>
      <div className="text-center text-3xl">🐾</div>
      <h1 className="mt-2 text-center text-lg font-semibold">Pick a Facility</h1>
      <p className="mt-1 text-center text-xs text-slate-400 dark:text-slate-500">
        PIN login is paused during build-out
      </p>

      <div className="mt-8 flex flex-col gap-2">
        {(facilities ?? []).map((f) => (
          <form key={f.id} action={loginQuick}>
            <input type="hidden" name="facilityId" value={f.id} />
            <input type="hidden" name="facilitySlug" value={f.slug} />
            <input type="hidden" name="facilityName" value={f.name} />
            {next ? <input type="hidden" name="next" value={next} /> : null}
            <button
              type="submit"
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-center font-medium hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-500"
            >
              {f.name}
            </button>
          </form>
        ))}
      </div>
    </main>
  );
}
