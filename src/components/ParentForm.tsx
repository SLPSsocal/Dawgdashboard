type ParentDefaults = {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  referral_source?: string | null;
  social_media_handle?: string | null;
  notes?: string | null;
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
}: {
  action: (formData: FormData) => void;
  defaults?: ParentDefaults;
  submitLabel: string;
  error?: string;
}) {
  return (
    <form action={action} className="flex flex-col gap-4">
      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
          {error === "missing_required"
            ? "First name, last name, phone, email, and referral source are required."
            : error === "missing_name"
              ? "First and last name are required."
              : error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="First Name" name="first_name" defaultValue={defaults?.first_name} required />
        <Field label="Last Name" name="last_name" defaultValue={defaults?.last_name} required />
        <Field label="Phone" name="phone" defaultValue={defaults?.phone} type="tel" required />
        <Field label="Email" name="email" defaultValue={defaults?.email} type="email" required />
      </div>

      <Field label="Address" name="address" defaultValue={defaults?.address} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Emergency Contact Name"
          name="emergency_contact_name"
          defaultValue={defaults?.emergency_contact_name}
        />
        <Field
          label="Emergency Contact Phone"
          name="emergency_contact_phone"
          defaultValue={defaults?.emergency_contact_phone}
          type="tel"
        />
        <Field
          label="Referral Source"
          name="referral_source"
          defaultValue={defaults?.referral_source}
          required
        />
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

      <button
        type="submit"
        className="mt-2 w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 px-5 py-2.5 text-sm font-medium text-white sm:w-fit dark:bg-slate-100 dark:text-slate-900"
      >
        {submitLabel}
      </button>
    </form>
  );
}
