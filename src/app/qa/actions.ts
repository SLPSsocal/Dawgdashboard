"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Append-only: every result is a new attempt row, so a later PASS never
// erases the FAIL that preceded it — the spec's core requirement.
export async function recordAttempt(
  qaTestId: string,
  payload: {
    status: "pass" | "partial" | "fail" | "blocked" | "needs_retest";
    severity?: "P0" | "P1" | "P2" | "P3" | null;
    testerName?: string | null;
    device?: string | null;
    browser?: string | null;
    actualResult?: string | null;
    attachmentUrls?: string[];
  }
) {
  const supabase = createClient();
  const { data: attempt, error } = await supabase
    .from("qa_test_attempts")
    .insert({
      qa_test_id: qaTestId,
      status: payload.status,
      severity: payload.severity ?? null,
      tester_name: payload.testerName?.trim() || null,
      device: payload.device?.trim() || null,
      browser: payload.browser?.trim() || null,
      actual_result: payload.actualResult?.trim() || null,
    })
    .select("id")
    .single();
  if (error || !attempt) throw new Error(error?.message ?? "Failed to save attempt");

  const urls = (payload.attachmentUrls ?? []).filter(Boolean);
  if (urls.length > 0) {
    await supabase
      .from("qa_test_attachments")
      .insert(urls.map((u) => ({ qa_test_attempt_id: attempt.id, file_url: u })));
  }

  revalidatePath("/qa");
}

export async function saveDeveloperNote(qaTestId: string, note: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("qa_tests")
    .update({ developer_note: note.trim() || null })
    .eq("id", qaTestId);
  if (error) throw new Error(error.message);
  revalidatePath("/qa");
}
