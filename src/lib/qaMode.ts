import { getSession } from "@/lib/session";

// True only for sessions established through /qa-login. Used to hard-block
// real-money side effects (live Helcim card charges) while still letting an
// automated QA agent walk the entire checkout flow end to end.
export async function isQaSession(): Promise<boolean> {
  const session = await getSession();
  return session?.isQa === true;
}

// Marker written into payments.helcim_transaction_id / approval_code so a
// simulated QA payment is trivially greppable and can never be mistaken for
// a real settled transaction during reconciliation.
export const QA_SIMULATED_TXN_PREFIX = "QA-SIMULATED-";
