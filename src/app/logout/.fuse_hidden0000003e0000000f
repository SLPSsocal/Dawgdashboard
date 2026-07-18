"use server";

import { clearSession } from "@/lib/session";
import { redirect } from "next/navigation";

export async function logout() {
  await clearSession();
  redirect("/login");
}
