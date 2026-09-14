"use client";

// The public "Request A Callback" form (embedded on dondoggos.com). Fields
// mirror the old LeadConnector widget so nothing customers expect is lost:
// name, phone, email, new/returning, pet name(s) + breed, services,
// free-text message. Submits straight into the /leads inbox.

import { useFormState, useFormStatus } from "react-dom";
import { submitInquiry, type InquiryState } from "@/app/inquire/actions";

const SERVICES = [
  "Overnight Dog Hotel",
  "Dog Daycare",
  "Grooming",
  "Cat Hotel",
  "Puppy Training",
];

const input =
  "mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-[15px] text-gray-900 placeholder:text-gray-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500";
const label = "block text-sm font-medium text-gray-700";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-red-600 px-5 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
    >
      {pending ? "Sending…" : "Request a Callback"}
    </button>
  );
}

export default function InquiryForm({ facility, source }: { facility: string; source: string }) {
  const initial: InquiryState = { ok: false, error: null };
  const [state, formAction] = useFormState(submitInquiry, initial);

  if (state.ok) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-green-200 bg-green-50 p-6 text-center">
        <div className="text-3xl">🐾</div>
        <h2 className="mt-2 text-lg font-semibold text-green-900">Got it — we&apos;ll call you back!</h2>
        <p className="mt-1 text-sm text-green-800">
          Our team usually responds within a few hours during business hours. Need us sooner? Call{" "}
          <a href="tel:+15629999330" className="font-semibold underline">
            (562) 999-9330
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="mx-auto flex max-w-md flex-col gap-4">
      <input type="hidden" name="facility" value={facility} />
      <input type="hidden" name="source" value={source} />
      {/* Honeypot — hidden from humans, irresistible to bots. */}
      <div className="absolute -left-[9999px] top-auto" aria-hidden="true">
        <label>
          Company
          <input name="company" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <label className={label}>
        Full Name <span className="text-red-500">*</span>
        <input name="full_name" required autoComplete="name" className={input} placeholder="Jane Doe" />
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={label}>
          Phone
          <input name="phone" type="tel" autoComplete="tel" className={input} placeholder="(562) 555-1234" />
        </label>
        <label className={label}>
          Email
          <input name="email" type="email" autoComplete="email" className={input} placeholder="you@email.com" />
        </label>
      </div>

      <fieldset>
        <legend className={label}>Have you visited us before?</legend>
        <div className="mt-1.5 flex gap-2">
          {[
            ["no", "New client"],
            ["yes", "Returning client"],
          ].map(([v, t]) => (
            <label
              key={v}
              className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-700 has-[:checked]:border-red-500 has-[:checked]:bg-red-50 has-[:checked]:text-red-700"
            >
              <input type="radio" name="returning_client" value={v} className="sr-only" defaultChecked={v === "no"} />
              {t}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={label}>
          Pet(s) Name
          <input name="pet_names" className={input} placeholder="Rex, Luna" />
        </label>
        <label className={label}>
          Breed(s)
          <input name="pet_breed" className={input} placeholder="Golden Retriever" />
        </label>
      </div>

      <fieldset>
        <legend className={label}>What are you interested in?</legend>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {SERVICES.map((s) => (
            <label
              key={s}
              className="cursor-pointer rounded-full border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 has-[:checked]:border-red-500 has-[:checked]:bg-red-50 has-[:checked]:text-red-700"
            >
              <input type="checkbox" name="services" value={s} className="sr-only" />
              {s}
            </label>
          ))}
        </div>
      </fieldset>

      <label className={label}>
        Anything else we should know?
        <textarea
          name="message"
          rows={3}
          className={input}
          placeholder="Desired dates, questions, your pet's quirks…"
        />
      </label>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}

      <SubmitButton />
      <p className="text-center text-xs text-gray-400">
        We&apos;ll only use this to get back to you — no spam, ever.
      </p>
    </form>
  );
}
