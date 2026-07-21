import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signWaiver } from "./actions";

export default async function SignPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;

  const supabase = createClient();
  const { data: sig } = await supabase
    .from("waiver_signatures")
    .select("id, status, signer_name, signed_at, signature_typed_name, waivers ( title, body_html )")
    .eq("token", token)
    .maybeSingle();

  if (!sig) notFound();

  const waiver = sig.waivers as unknown as { title: string; body_html: string } | null;
  const signWithToken = signWaiver.bind(null, token);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-xl font-semibold">{waiver?.title ?? "Waiver"}</h1>

        {sig.status === "signed" ? (
          <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-400">
            Signed by {sig.signature_typed_name} on{" "}
            {sig.signed_at ? new Date(sig.signed_at).toLocaleString() : ""}. Thanks — you&apos;re all set.
          </div>
        ) : (
          <>
            <div
              className="mt-6 max-w-none rounded-lg border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 [&_a]:text-indigo-600 [&_a]:underline [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h4]:mt-3 [&_h4]:font-semibold [&_p]:mb-3"
              dangerouslySetInnerHTML={{ __html: waiver?.body_html ?? "" }}
            />
            {error && (
              <div className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
                Please type your full name and check the box to confirm.
              </div>
            )}
            <form
              action={signWithToken}
              className="mt-6 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <label className="block">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Type your full legal name</span>
                <input
                  name="typed_name"
                  defaultValue={sig.signer_name ?? ""}
                  required
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="agree" required className="mt-0.5" />
                <span>
                  I have read this agreement in its entirety and agree to its terms. Typing my name above and
                  checking this box serves as my electronic signature.
                </span>
              </label>
              <button
                type="submit"
                className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 sm:w-fit dark:bg-slate-100 dark:text-slate-900"
              >
                Sign Agreement
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
