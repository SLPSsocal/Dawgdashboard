import { createClient } from "@/lib/supabase/server";
import { loginWithPin } from "./actions";
import ThemeToggle from "@/components/ThemeToggle";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ facility?: string; error?: string }>;
}) {
  const { facility: facilitySlug, error } = await searchParams;
  const supabase = createClient();
  const { data: facilities } = await supabase
    .from("facilities")
    .select("id, name, slug")
    .order("name");

  const selected = facilities?.find((f) => f.slug === facilitySlug);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
      <div className="flex justify-end">
        <ThemeToggle />
      </div>
      <div className="text-center text-3xl">🐾</div>
      <h1 className="mt-2 text-center text-lg font-semibold">Staff Login</h1>

      {!selected ? (
        <div className="mt-8 flex flex-col gap-2">
          {(facilities ?? []).map((f) => (
            <a
              key={f.id}
              href={`/login?facility=${f.slug}`}
              className="rounded-lg border border-neutral-200 bg-white px-4 py-3 text-center font-medium hover:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-500"
            >
              {f.name}
            </a>
          ))}
        </div>
      ) : (
        <form action={loginWithPin} className="mt-8 flex flex-col gap-3">
          <input type="hidden" name="facilityId" value={selected.id} />
          <input type="hidden" name="facilitySlug" value={selected.slug} />
          <input type="hidden" name="facilityName" value={selected.name} />

          <div className="text-center text-sm text-neutral-500 dark:text-neutral-400">{selected.name}</div>

          {error && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-center text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
              {error === "invalid" ? "Name or PIN not recognized." : "Enter your name and PIN."}
            </div>
          )}

          <input
            name="staffName"
            placeholder="Your Name"
            required
            className="rounded-lg border border-neutral-300 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500"
          />
          <input
            name="pin"
            type="password"
            inputMode="numeric"
            placeholder="PIN"
            required
            className="rounded-lg border border-neutral-300 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500"
          />
          <button
            type="submit"
            className="mt-2 rounded-lg bg-neutral-900 px-4 py-3 font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
          >
            Unlock →
          </button>
          <a
            href="/login"
            className="text-center text-sm text-neutral-400 underline dark:text-neutral-500"
          >
            Wrong facility
          </a>
        </form>
      )}
    </main>
  );
}
