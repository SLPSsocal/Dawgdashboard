type Parent = { id: string; first_name: string; last_name: string };

type AnimalDefaults = {
  name?: string | null;
  species?: string | null;
  breed?: string | null;
  size?: string | null;
  weight_lbs?: number | null;
  birthdate?: string | null;
  sex?: string | null;
  fixed?: boolean | null;
  color_markings?: string | null;
  owned_since_note?: string | null;
  vet_name?: string | null;
  vet_phone?: string | null;
  vaccination_expiry?: string | null;
  medical_notes?: string | null;
  behavioral_notes?: string | null;
  feeding_instructions?: string | null;
  medications?: string | null;
  active?: boolean | null;
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
  defaultValue?: string | number | null;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        required={required}
        className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
      />
    </label>
  );
}

function TextArea({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{label}</span>
      <textarea
        name={name}
        defaultValue={defaultValue ?? ""}
        rows={2}
        className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
      />
    </label>
  );
}

export default function AnimalForm({
  action,
  defaults,
  submitLabel,
  error,
  parents,
  selectedParentId,
  showParentPicker,
  showActiveToggle,
}: {
  action: (formData: FormData) => void;
  defaults?: AnimalDefaults;
  submitLabel: string;
  error?: string;
  parents?: Parent[];
  selectedParentId?: string;
  showParentPicker?: boolean;
  showActiveToggle?: boolean;
}) {
  return (
    <form action={action} className="flex flex-col gap-4">
      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
          {error === "missing_required" ? "Name and parent are required." : error}
        </div>
      )}

      {showParentPicker && (
        <label className="block">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Parent<span className="text-red-500"> *</span>
          </span>
          <select
            name="parent_id"
            defaultValue={selectedParentId ?? ""}
            required
            className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          >
            <option value="" disabled>
              Select a parent…
            </option>
            {(parents ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.first_name} {p.last_name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name" name="name" defaultValue={defaults?.name} required />
        <Field label="Species" name="species" defaultValue={defaults?.species ?? "dog"} />
        <Field label="Breed" name="breed" defaultValue={defaults?.breed} />
        <Field label="Color / Markings" name="color_markings" defaultValue={defaults?.color_markings} />
        <label className="block">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Size</span>
          <select
            name="size"
            defaultValue={defaults?.size ?? ""}
            className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          >
            <option value="">—</option>
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
            <option value="xl">XL</option>
          </select>
        </label>
        <Field label="Weight (lbs)" name="weight_lbs" defaultValue={defaults?.weight_lbs} type="number" />
        <label className="block">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Sex</span>
          <select
            name="sex"
            defaultValue={defaults?.sex ?? ""}
            className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          >
            <option value="">—</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </label>
        <Field label="Birthdate" name="birthdate" defaultValue={defaults?.birthdate} type="date" />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="fixed" defaultChecked={defaults?.fixed ?? false} />
        Spayed / Neutered
      </label>

      <Field label="How long have you had this pet?" name="owned_since_note" defaultValue={defaults?.owned_since_note} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Vet Name" name="vet_name" defaultValue={defaults?.vet_name} />
        <Field label="Vet Phone" name="vet_phone" defaultValue={defaults?.vet_phone} type="tel" />
        <Field
          label="Vaccination Expiry"
          name="vaccination_expiry"
          defaultValue={defaults?.vaccination_expiry}
          type="date"
        />
      </div>

      <TextArea label="Medical Notes / Allergies" name="medical_notes" defaultValue={defaults?.medical_notes} />
      <TextArea label="Medications" name="medications" defaultValue={defaults?.medications} />
      <TextArea label="Behavioral Notes" name="behavioral_notes" defaultValue={defaults?.behavioral_notes} />
      <TextArea
        label="Feeding Instructions"
        name="feeding_instructions"
        defaultValue={defaults?.feeding_instructions}
      />

      {showActiveToggle && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={defaults?.active ?? true} />
          Active
        </label>
      )}

      <button
        type="submit"
        className="mt-2 w-full rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white sm:w-fit dark:bg-neutral-100 dark:text-neutral-900"
      >
        {submitLabel}
      </button>
    </form>
  );
}
