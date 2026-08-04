"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";

export async function submitSupportTicket(input: {
  staffName: string;
  message: string;
  screenshotUrl?: string | null;
  attachmentUrl?: string | null;
  pageUrl?: string | null;
}) {
  const session = await getSession();
  if (!session) throw new Error("Not logged in");

  const staffName = input.staffName.trim() || session.staffName || "Unknown";
  const message = input.message.trim();
  if (!message) throw new Error("Please describe the issue.");

  const supabase = createClient();
  const { error } = await supabase.from("support_tickets").insert({
    facility_id: session.facilityId,
    staff_name: staffName,
    message,
    screenshot_url: input.screenshotUrl || null,
    attachment_url: input.attachmentUrl || null,
    page_url: input.pageUrl || null,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/support");
}

export async function updateSupportTicketStatus(ticketId: string, status: "open" | "in_progress" | "resolved") {
  const session = await getSession();
  if (!session) throw new Error("Not logged in");

  const supabase = createClient();
  const { error } = await supabase.from("support_tickets").update({ status }).eq("id", ticketId);
  if (error) throw new Error(error.message);

  revalidatePath("/support");
}
