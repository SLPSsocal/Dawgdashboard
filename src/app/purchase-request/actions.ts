"use server";

import { redirect } from "next/navigation";
import {
  configuredPurchaseRequestPin,
  pinsMatch,
  setPurchaseRequestUnlocked,
} from "@/lib/purchaseRequestGate";

export async function unlockPurchaseRequest(formData: FormData) {
  const expected = configuredPurchaseRequestPin();
  if (!expected) redirect("/purchase-request");

  const entered = String(formData.get("pin") ?? "").trim();
  if (!entered || !pinsMatch(entered, expected)) {
    redirect("/purchase-request?error=invalid");
  }

  await setPurchaseRequestUnlocked();
  redirect("/purchase-request");
}
