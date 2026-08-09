import Link from "next/link";
type ParentDefaults = {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  emergency_contact_2_name?: string | null;
  emergency_contact_2_phone?: string | null;
  referral_source?: string | null;
  social_media_handle?: string | null;
  notes?: string | null;
  email_opt_out?: boolean | null;
  sms_opt_out?: boolean | null;
};

function Field({
  label,
  name,
  defaultValue,
  required,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        required={required}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      />
    </label>
  );
}

export default function ParentForm({
  action,
  defaults,
  submitLabel,
  error,
  referralSources = [],
}: {
  action: (formData: FormData) => void;
  defaults?: ParentDefaults;
  submitLabel: string;
  error?: string;
  referralSources?: { id: string; name: string }[];
}) {
  // If this parent's existing referral_source isn't in the current active
  // list (renamed, disabled, or a legacy free-text value from before this
  // was a dropdown), still show it as a selectable option instead of
  // silently discarding it the moment the form is saved again.
  const currentValue = defaults?.referral_source ?? "";
  const options =
    currentValue && !referralSources.some((s) => s.name === currentValue)
      ? [...referralSources, { id: "current", name: currentValue }]
      : referralSources;
  return (
    <form action={action} className="flex flex-col gap-4">
      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
          {error === "duplicate" ? (
            <>
              <p className="font-bold uppercase tracking-wide">Parent Already Exists</p>
              <p className="mt-1">
                A parent with this phone number or email is already in the system. Search for them instead of
                creating a duplicate account.
              </p>
            </>
          ) : error === "missing_required" ? (
            "First name, last name, phone, email, referral source, and Emergency Contact 1 (name and phone) are required."
          ) : error === "missing_name" ? (
            "First and last name are required."
          ) : (
            error
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="First Name" name="first_name" defaultValue={defaults?.first_name} required />
        <Field label="Last Name" name="last_name" defaultValue={defaults?.last_name} required />
        <Field label="Phone" name="phone" defaultValue={defaults?.phone} type="tel" required />
        <Field label="Email" name="email" defaultValue={defaults?.email} type="email" required />
      </div>

      <Field label="Address" name="address" defaultValue={defaults?.address} />

      <div>
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Emergency Contact 1
        </span>
        <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Name"
            name="emergency_contact_name"
            defaultValue={defaults?.emergency_contact_name}
            required
          />
          <Field
            label="Phone"
            name="emergency_contact_phone"
            defaultValue={defaults?.emergency_contact_phone}
            type="tel"
            required
          />
        </div>
      </div>

      <div>
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Emergency Contact 2 (optional)
        </span>
        <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Name"
            name="emergency_contact_2_name"
            defaultValue={defaults?.emergency_contact_2_name}
          />
          <Field
            label="Phone"
            name="emergency_contact_2_phone"
            defaultValue={defaults?.emergency_contact_2_phone}
            type="tel"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Referral Source
            <span className="text-red-500"> *</span>
          </span>
          <select
            name="referral_source"
            defaultValue={currentValue}
            required
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="" disabled>
              Select…
            </option>
            {options.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
          {options.length === 0 && (
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              No referral sources set up yet — <Link href="/referral-sources" className="underline">add some</Link>.
            </p>
          )}
        </label>
        <Field
          label="Social Media Handle"
          name="social_media_handle"
          defaultValue={defaults?.social_media_handle}
        />
      </div>

      <label className="block">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Notes</span>
        <textarea
          name="notes"
          defaultValue={defaults?.notes ?? ""}
          rows={3}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </label>

      <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Communication Preferences
        </span>
        <div className="mt-2 flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="email_opt_out" defaultChecked={defaults?.email_opt_out ?? false} />
            Opted out of email
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="sms_opt_out" defaultChecked={defaults?.sms_opt_out ?? false} />
            Opted out of text messages (SMS)
          </label>
        </div>
      </div>

      <button
        type="submit"
        className="mt-2 w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 px-5 py-2.5 text-sm font-medium text-white sm:w-fit dark:bg-slate-100 dark:text-slate-900"
      >
        {submitLabel}
      </button>
    </form>
  );
}
