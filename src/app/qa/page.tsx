import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import FacilityHeader from "@/components/FacilityHeader";
import QaTestCenter, { type QaAttempt, type QaTest } from "@/components/QaTestCenter";

// Staff-only by construction: this app has no customer accounts at all —
// the only customer-facing routes are tokenized forms (/precheckin, /sign),
// and this page sits behind the same staff session as everything else.
export default async function QaPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = createClient();
  const [{ data: tests }, { data: attempts }, { data: attachments }] = await Promise.all([
    supabase
      .from("qa_tests")
      .select("id, code, category, title, instructions, expected_result, sort_order, developer_note")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("qa_test_attempts")
      .select("id, qa_test_id, status, severity, tester_name, device, browser, actual_result, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("qa_test_attachments").select("qa_test_attempt_id, file_url"),
  ]);

  const attachByAttempt = new Map<string, string[]>();
  for (const a of attachments ?? []) {
    const list = attachByAttempt.get(a.qa_test_attempt_id) ?? [];
    list.push(a.file_url);
    attachByAttempt.set(a.qa_test_attempt_id, list);
  }

  const attemptRows: QaAttempt[] = (attempts ?? []).map((a) => ({
    id: a.id,
    qaTestId: a.qa_test_id,
    status: a.status,
    severity: a.severity,
    testerName: a.tester_name,
    device: a.device,
    browser: a.browser,
    actualResult: a.actual_result,
    createdAt: a.created_at,
    attachments: attachByAttempt.get(a.id) ?? [],
  }));

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <FacilityHeader session={session!} />
      <div className="mx-auto max-w-[1100px] px-4 py-5 sm:px-6">
        <QaTestCenter
          tests={(tests ?? []) as QaTest[]}
          attempts={attemptRows}
          staffName={session!.staffName}
        />
      </div>
    </main>
  );
}
