import InquiryForm from "@/components/InquiryForm";

// PUBLIC page (no login) — embedded as an iframe on the marketing sites in
// place of the old agency LeadConnector widget, so "Request A Callback"
// submissions land in the dashboard's /leads inbox instead of a third-party
// CRM. ?facility=dd&source=contact tags where the lead came from.
export default async function InquirePage({
  searchParams,
}: {
  searchParams: Promise<{ facility?: string; source?: string }>;
}) {
  const sp = await searchParams;
  return (
    <main className="min-h-screen bg-white p-4 sm:p-6">
      <InquiryForm facility={sp.facility ?? "dd"} source={sp.source ?? "contact"} />
    </main>
  );
}
