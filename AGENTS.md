# AGENTS.md — Dawg Dashboard

Instructions for AI coding agents (Codex, Cursor, Grok, Claude, etc.) working in this repo.

## What this is

Dawg Dashboard is a Next.js 14 (App Router) + Supabase + Vercel app replacing Gingr as the POS/ops system for four dog-boarding facilities: Don Doggos (dd), Four Paws Inn (fpi), House of Woof (how), Riverwalk (rw). Staff use it for check-ins, boarding/daycare/grooming bookings, lodging assignment, feeding logs, invoicing/checkout (Helcim payments), pricing rules, and admin reports.

Production: https://dawgdashboard.vercel.app (auto-deploys from `main`).

## Hard safety rules — read before doing anything

1. **This repo is PUBLIC. Never commit secrets.** No API keys, tokens, or credentials in code, comments, tests, or fixtures. Gingr API keys live ONLY inside the `gingr-proxy` Supabase edge function. The QA token lives only in env vars.
2. **Helcim is LIVE in normal sessions.** Never exercise a real card charge. Payment simulation is only active inside QA sessions (see QA access below).
3. **Gingr is read-only.** The live Gingr data on the board is a one-way mirror (`src/lib/gingrSync.ts` via the `gingr-proxy` edge function). Nothing in this app may ever write back to Gingr — keep that structural guarantee intact.
4. Don't delete or "clean up" production data. Test against the QA data (Sarah Martinez / Bailey / Milo) or rows you create yourself.

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in values — ask the project owner
npm run dev                  # http://localhost:3000
```

Checks before proposing changes:

```bash
npx tsc --noEmit   # must be clean
npm run build      # must be clean
```

Note: `next/font` cannot fetch Google Fonts in some sandboxes — the app loads IBM Plex Sans via a runtime `<link>` in `src/app/layout.tsx` on purpose. Don't "fix" that.

## QA access (testing the live app)

- Log in via `GET /qa-login?token=<QA_ACCESS_TOKEN>` — exchanges the token for a normal staff session at Don Doggos and redirects to the Check-in Board. 404 = token not configured server-side; 403 = wrong token.
- **Ask the project owner for the token. It is never in this repo.**
- QA sessions simulate payments; normal sessions charge real cards through Helcim.
- The in-app **QA Test Center** at `/qa` holds 75 seeded manual tests with an append-only result history — record PASS/FAIL there (tester name = your tool's name, e.g. "Grok (AI)"), with what-happened + severity on failures.

## Automated tests

```bash
export QA_ACCESS_TOKEN=<ask owner>            # never commit
export QA_BASE_URL=https://dawgdashboard.vercel.app   # or http://localhost:3000
npm run test:e2e                              # Playwright smoke suite
```

`tests/auth.setup.ts` signs in once via `/qa-login` and saves the session for the other specs.

## Architecture map

- `src/app/*` — App Router pages + server actions (`actions.ts` files). Auth is a custom session cookie (`src/lib/session.ts`); most pages `redirect("/login")` without it.
- `src/components/*` — client components. Board: `CheckInBoard.tsx`; booking: `BookingForm.tsx`; checkout: `CheckoutCalculator.tsx`; calendars: `LodgingCalendar.tsx`, `FacilityCalendarBoard.tsx`; NL booking assistant: `DawgAssistant.tsx`.
- `src/lib/gingr.ts` + `src/lib/gingrSync.ts` — read-only Gingr mirror (parents/animals/reservations matched by `gingr_*` ids). Rows with a `gingr_reservation_id` show a ✱ badge.
- `src/lib/dates.ts` — **always compare facility-local (America/Los_Angeles) calendar days**, never `iso.slice(0, 10)` (that's UTC and misdates evening pickups).
- Supabase: Postgres + storage + edge functions (`supabase/functions/gingr-proxy`). The shared `feeding_logs` table is also written by the separate PawFeed app — don't change its shape.
- Pricing: `pricing_rules` (multi-day discounts, per-night additional-dog tiers, flat fees). Late check-out auto-applies after 12:15 PM PT on boarding. Each dog checks out on its own ticket with exactly one additional-dog tier, scaled by nights.

## Conventions

- TypeScript strict; Tailwind for styling (design system: light-first, `#f5f6f8` page bg, indigo-600 accent, 10–14px radii, IBM Plex Sans; keep `dark:` variants working).
- Tailwind `content` globs include `src/lib` — class names in helpers are intentional.
- React 18: use `useFormState`/`useFormStatus` from `react-dom` (not `useActionState`).
- Server actions log to reservation history with `performedBy` — keep changes attributable.
- Small, focused commits with messages that explain the *why*.

## Reporting findings

If you're testing rather than fixing: record results in `/qa`, or open a GitHub issue with steps to reproduce, expected vs actual, and severity (P0–P3). Money-math bugs (pricing, discounts, tax, tips, tenders) are always P0/P1.
