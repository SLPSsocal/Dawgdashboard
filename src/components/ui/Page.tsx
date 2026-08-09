import type { ReactNode } from "react";
import Link from "next/link";

// Layout primitives shared by the admin/settings pages, so spacing, radii,
// borders and type scale come from one place instead of each page inventing
// its own. Spacing sticks to a 4/8/12/16/24/32 scale.

/** Constrains content to a readable column and centers it. */
export function PageShell({
  children,
  width = "md",
}: {
  children: ReactNode;
  /** md ≈ 880px for settings lists; lg ≈ 1100px for wide report tables. */
  width?: "md" | "lg";
}) {
  return (
    <div
      className={`mx-auto w-full px-4 py-6 sm:px-6 sm:py-8 ${
        width === "lg" ? "max-w-[1100px]" : "max-w-[880px]"
      }`}
    >
      {children}
    </div>
  );
}

/**
 * Title + one-line description + optional right-aligned action.
 * Description is capped at ~65ch so it can't sprawl across a wide monitor.
 */
export function PageHeader({
  title,
  description,
  action,
  backHref,
  backLabel,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="mb-5">
      {backHref && (
        <Link
          href={backHref}
          className="mb-2 inline-block text-[13px] text-slate-500 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300"
        >
          ← {backLabel ?? "Back"}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[19px] font-semibold leading-tight text-slate-900 dark:text-slate-50">
            {title}
          </h1>
          {description && (
            <p className="mt-1 max-w-[65ch] text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
              {description}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}

/** Bordered surface. Header row is optional and sits flush above the body. */
export function Card({
  title,
  meta,
  children,
  bodyClassName = "",
}: {
  title?: string;
  /** Small right-aligned status, e.g. count badges. */
  meta?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      {(title || meta) && (
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          {title && (
            <h2 className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">{title}</h2>
          )}
          {meta && <div className="flex shrink-0 items-center gap-1.5">{meta}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** Small count/status chip. Deliberately low contrast — this is not a button. */
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "positive" | "muted";
}) {
  const tones = {
    neutral: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    positive: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
    muted: "bg-slate-100 text-slate-400 dark:bg-slate-800/60 dark:text-slate-500",
  };
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

/**
 * One settings line. Fixed columns — control | label | actions — so a wide
 * control can never bleed into the label text.
 */
export function SettingsRow({
  control,
  children,
  actions,
}: {
  /** Left column, e.g. a Toggle. Gets its own fixed-width cell. */
  control?: ReactNode;
  children: ReactNode;
  /** Right column, revealed/emphasised on row hover. */
  actions?: ReactNode;
}) {
  return (
    <div className="group flex min-h-[52px] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40">
      {control && <div className="flex w-10 shrink-0 items-center">{control}</div>}
      <div className="min-w-0 flex-1">{children}</div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  );
}

/** Divided list container for SettingsRow children. */
export function SettingsList({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-slate-100 dark:divide-slate-800">{children}</div>;
}

/** Quiet square icon button for row-level actions. */
export function IconButton({
  children,
  title,
  type = "button",
}: {
  children: ReactNode;
  title: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      title={title}
      aria-label={title}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[13px] text-slate-400 opacity-0 transition hover:bg-slate-200 hover:text-slate-700 focus:opacity-100 group-hover:opacity-100 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-100"
    >
      {children}
    </button>
  );
}
