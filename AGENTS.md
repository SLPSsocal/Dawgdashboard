# AGENTS.md — Dawg Dashboard

Instructions for AI coding agents (Grok, Codex, Cursor, Claude, etc.) working in this repo.
Last updated: 2026-09-15.

## What this is

Dawg Dashboard is a Next.js 14 (App Router) + Supabase + Vercel app replacing Gingr as the POS/ops system for four dog-boarding facilities: Don Doggos (dd), Four Paws Inn (fpi), House of Woof (how), Riverwalk (rw). Staff use it for check-ins, boarding/daycare/grooming bookings, lodging assignment, feeding logs, deposits, invoicing/checkout (Helcim payments), pricing rules, leads, and admin reports.

Production: https://dawgdashboard.vercel.app (auto-deploys from `main`).
**Don Doggos is mid-cutover from Gingr** — future reservations, balances, and packages were imported 2026-09-14; the live Gingr mirror still runs during the overlap.

## Hard safety rules — read before doing anything

1. **This repo is PUBLIC. Never commit secrets.** No API keys, tokens, or credentials in code, comments, tests, or fixtures. Gingr API keys live ONLY inside the `gingr-proxy` Supabase edge function. QA/webhook tokens live only in Vercel env vars.
2. **Helcim is LIVE in normal sessions.** Never exercise a real card charge or refund. Payment simulation is only active inside QA sessions (see QA access below).
3. **Gingr is read-only.** All Gingr access goes through the `gingr-proxy` edge function, which only calls read endpoints. Nothing may ever write back to Gingr.
4. **Don't delete or "clean up" production data.** Test with rows you create, and remove them when done.
5. **GitHub is the source of truth.** Local folders/mounts can lag `main` — always pull/diff against `origin/main` before editing.

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in values — ask the project owner
npm run dev                  # http://localhost:3000
```

Before proposing changes: `npx tsc --noEmit` and `npm run build` must both be clean.
Note: the app loads IBM Plex Sans via a runtime `<link>` in `src/app/layout.tsx` on purpose (next/font can't fetch Google Fonts in some sandboxes) — don't "fix" that.

## QA access (testing the live app)

- Log in via `GET /qa-login?token=<QA_ACCESS_TOKEN>` — token from the project owner, never in this repo. 404 = not configured; 403 = wrong token.
- QA sessions simulate payments; normal sessions charge real cards.
- `/qa` is the in-app Test Center (append-only history). Record results under your tool's name, e.g. "Grok (AI)".
- Playwright: `export QA_ACCESS_TOKEN=… ; npm run test:e2e` (tests/auth.setup.ts logs in once).

## Architecture map

- `src/app/*` — App Router pages + server actions (`actions.ts` files). Auth = custom session cookie (`src/lib/session.ts`); staff pages `redirect("/login")` without it. Public (no-login) routes: `/inquire` (lead form), `/api/leads` (GoHighLevel webhook, `LEADS_WEBHOOK_KEY`), `/purchase-request`, `/sign/[token]`.
- Key components: board `CheckInBoard.tsx` (+ Lodging/Type columns, suite-camera links); booking `BookingForm.tsx` (step cards, suite availability grid, grooming add-ons, service subtypes, live estimate); checkout `CheckoutCalculator.tsx` (ONE invoice per household, auto household rank — no manual control, auto late fee after 12:15 PM PT, tips on grooming/whole-ticket, manual discounts, deposits applied, package/store-credit tenders); calendars `LodgingCalendar.tsx` / `FacilityCalendarBoard.tsx` (groomer weekly schedules + "Open this day" overrides in `specialist_day_overrides`); NL booking assistant `DawgAssistant.tsx`; leads inbox `/leads`.
- **Dates/times:** always facility-local (America/Los_Angeles). Use `src/lib/dates.ts` (ymdLocal/todayLocal) and `src/lib/timezone.ts` (formatInZone etc.). Never compare `iso.slice(0,10)` — that's UTC and misdates evening pickups.
- **Gingr layer:** `src/lib/gingr.ts` + `src/lib/gingrSync.ts` mirror today's Gingr day into real local rows on board/feeding load (matched by `gingr_*` ids; ✱ badge; sync closes rows that drop out of the feed). The `gingr-proxy` edge function (Supabase) also has modes `range`, `balances`, `import`, `import_balances` (idempotent, `dry=1` supported) used for the cutover — see supabase/functions source via the Supabase dashboard, not this repo.
- **Money:** `pricing_rules` (multi-day, per-night additional-dog tiers scaled by units, flat fees), `invoices`/`invoice_line_items`/`payments` (every tender writes a row), `store_credit_transactions` (ledger; Gingr credits carried over 2026-09-14), `package_credits` (Gingr daycare packs; parent page "Use 1 day"), deposits (`invoices.kind='deposit'`, applied at checkout, cancel → store credit). Helcim: HelcimPay.js sessions in `src/app/billing/helcim-actions.ts` — its SUCCESS payload is double-nested `{data:{data:{…},hash}}`; the parser handles both shapes. Money-math bugs are always P0/P1.
- Shared with other apps: `feeding_logs` is also written by the PawFeed tablet app — don't change its shape.

## Conventions

- TypeScript strict; Tailwind (design system: light-first, `#f5f6f8` bg, indigo-600 accent, 10–14px radii, IBM Plex Sans; keep `dark:` variants working). Tailwind `content` includes `src/lib` on purpose.
- React 18: `useFormState`/`useFormStatus` from `react-dom` (NOT `useActionState`).
- Server actions log to `reservation_history` with `performedBy` — keep changes attributable.
- Small, focused commits; messages explain the *why*. A morning triage agent and other AI agents also commit here — pull before you start.

## Reporting findings

Record test results in `/qa`, or open a GitHub issue with repro steps, expected vs actual, and severity (P0–P3). Support tickets live in-app under Reported Issues; replies go in the ticket's `response` field.
