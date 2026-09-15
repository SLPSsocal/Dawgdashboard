# AGENTS.md — Dawg Dashboard

Instructions for AI coding agents (Grok, Codex, Cursor, Claude, etc.) working in this repo.
Last updated: 2026-09-15 (second pass — route map, purchase catalog, multi-agent PR rule).

## What this is

Dawg Dashboard is a Next.js 14 (App Router) + Supabase + Vercel app replacing Gingr as the POS/ops system for four dog-boarding facilities:

| Code | Name | Area |
| --- | --- | --- |
| `dd` | Don Doggos | Long Beach |
| `fpi` | Four Paws Inn | Banning / Beaumont |
| `how` | House of Woof | Santa Ana / Costa Mesa |
| `rw` | Riverwalk Pet Resort | Riverside / Corona |

Staff use it for check-ins, boarding/daycare/grooming bookings, lodging assignment, feeding logs, deposits, invoicing/checkout (Helcim), pricing rules, leads, purchase requests, and admin reports.

Production: https://dawgdashboard.vercel.app (auto-deploys from `main`).
Repo: https://github.com/SLPSsocal/Dawgdashboard (public).

**Don Doggos is mid-cutover from Gingr** — future reservations, balances, and packages were imported 2026-09-14; the live Gingr mirror still runs during the overlap.

## Hard safety rules — read before doing anything

1. **This repo is PUBLIC. Never commit secrets.** No API keys, tokens, or credentials in code, comments, tests, or fixtures. Gingr API keys live ONLY inside the `gingr-proxy` Supabase edge function. QA / webhook / PIN tokens live only in Vercel env vars.
2. **Helcim is LIVE in normal sessions.** Never exercise a real card charge or refund. Payment simulation is only active inside QA sessions (see QA access below).
3. **Gingr is read-only.** All Gingr access goes through the `gingr-proxy` edge function, which only calls read endpoints. Nothing may ever write back to Gingr.
4. **Don't delete or "clean up" production data.** Test with rows you create, and remove them when done.
5. **GitHub is the source of truth.** Local folders/mounts can lag `main` — always `git pull` / diff against `origin/main` before editing. Several AI agents commit here.

## Multi-agent workflow

Claude (owner triage) may push small fixes to `main`.

**Grok, Cursor, Codex, and other non-Claude agents:**

- Checkout, pricing, deposits, tenders, packages/store credit, Helcim, or Gingr sync → **work on a branch and open a PR.** Do not push those changes straight to `main`.
- Copy, layout, docs (`AGENTS.md`), non-money UI polish → `main` is fine after `tsc` + `build`.
- Keep commits small. Messages explain the *why* (staff ticket, facility, date), not just the what.
- Server actions that change reservations/money must set `performedBy` so history is attributable.

PR precedent: #1 (purchase requests) and #2 (purchase catalog).

## Local setup

```bash
git pull origin main
npm install
cp .env.example .env.local   # fill in values — ask the project owner
npm run dev                  # http://localhost:3000
```

Before proposing changes: `npx tsc --noEmit` and `npm run build` must both be clean.

Note: the app loads IBM Plex Sans via a runtime `<link>` in `src/app/layout.tsx` on purpose (`next/font` can't fetch Google Fonts in some sandboxes) — don't "fix" that.

Do not reintroduce desktop `backdrop-filter` on the check-in board — it caused Safari stale-paint artifacts (see `e78ff20`).

## QA access (testing the live app)

- Log in via `GET /qa-login?token=<QA_ACCESS_TOKEN>` — token from the project owner, **never in this repo**. 404 = not configured; 403 = wrong token.
- QA sessions simulate payments; normal sessions charge real cards.
- `/qa` is the in-app Test Center (append-only history). Record results under your tool's name, e.g. `"Grok (AI)"`.
- Playwright: `export QA_ACCESS_TOKEN=… ; npm run test:e2e` (`tests/auth.setup.ts` logs in once).

## Architecture map

Auth = custom session cookie (`src/lib/session.ts`). Staff pages `redirect("/login")` without it.

### Public (no staff login)

- `/inquire` — public lead form (`InquiryForm.tsx`)
- `POST /api/leads?key=` — GoHighLevel webhook (`LEADS_WEBHOOK_KEY`); dual-delivers into `/leads`
- `/purchase-request` — staff supply form; optional `PURCHASE_REQUEST_PIN` (12-hour cookie). Catalog checklist + custom-line escape hatch.
- `POST /api/purchase-requests` — same PIN gate
- `/sign/[token]`, `/precheckin/[token]` — owner-facing waiver / pre-check-in links

### Core ops

- Board: `CheckInBoard.tsx` (Lodging + Type columns, suite-camera links on suite name, overdue vs expected-today, reservation menu next to the dog's name)
- Quick Check-in: only **already-booked** dogs; copy explains that and links to new reservation
- Booking: `BookingForm.tsx` (step cards, `SuiteAvailabilityGrid`, grooming add-ons, service subtypes, live estimate, daycare days on boarding stays)
- Checkout: `CheckoutCalculator.tsx` — **ONE invoice per household**, auto household rank (no manual control), auto late fee after **12:15 PM PT**, tips on grooming/whole-ticket, manual discounts, deposits applied, package + store-credit tenders
- Collect Payment on an open invoice (invoice page + parent page) jumps into the cart with that invoice **pre-ticked**
- Calendars: `LodgingCalendar.tsx` / `FacilityCalendarBoard.tsx` (groomer weekly schedules + "Open this day" overrides in `specialist_day_overrides`; Daycare + Boarding lanes hidden on facility calendar)
- Assistant: `DawgAssistant.tsx` + `src/app/assistant/actions.ts`
- Feeding: `FeedingBoard.tsx` — Gingr-sync on load. **`feeding_logs` is also written by the PawFeed tablet app — do not change its shape.**
- Run cards / report cards / incidents live under `/reservations/[id]/…`
- Leads inbox: `/leads`

### Money

- `pricing_rules` — multi-day, per-night additional-dog tiers scaled by units, flat fees
- `invoices` / `invoice_line_items` / `payments` — every tender writes a payment row
- `store_credit_transactions` — ledger; Gingr credits carried over 2026-09-14
- `package_credits` — Gingr daycare packs; parent page **Packages → Use 1 day**
- Deposits: `invoices.kind='deposit'`, applied at checkout; cancel → store credit (`DepositPanel.tsx`)
- Helcim: HelcimPay.js sessions in `src/app/billing/helcim-actions.ts`. SUCCESS payload is often double-nested `{data:{data:{…},hash}}`; the parser handles both shapes. Card-on-file lives here too.
- Walk-in / retail: `/sale/new`, `/retail`
- Admin: `/admin` plus revenue, sales-tax, tips, commission, referrals, account-codes
- Groomer commission UI: `/grooming-commission`
- Money-math bugs are always **P0/P1**. Branch + PR.

### Gingr layer

`src/lib/gingr.ts` + `src/lib/gingrSync.ts` mirror today's Gingr day into real local rows on board/feeding load (matched by `gingr_*` ids; ✱ badge; sync closes rows that drop out of the feed).

`gingr-proxy` (Supabase edge, **not in this repo**) modes: `range`, `balances`, `import`, `import_balances` (idempotent; `dry=1` supported). Used for the cutover. Edit via the Supabase dashboard, never by inventing a write path.

### Dates / times

Always facility-local (`America/Los_Angeles`). Use `src/lib/dates.ts` (`ymdLocal` / `todayLocal`) and `src/lib/timezone.ts` (`formatInZone`, etc.). **Never** compare `iso.slice(0,10)` — that's UTC and misdates evening pickups.

Reservation page arrival/departure editors are facility-zone aware.

### Purchase requests

- Public form `/purchase-request` + staff queue `/purchase-requests` (`status=new`)
- Catalog table `purchase_catalog_items` (facility stores only — not personal / Pepper Tree addresses)
- Preferred wipe SKU is locked: Freestyle Soft Baby Wipes for Sensitive Skin, Unscented — **NO SUBSTITUTES**
- `GET /api/purchase-catalog/history?facilityId=` powers the "Last: …" line
- Slack notify via `PURCHASE_REQUEST_WEBHOOK_URL`; default mention is Krishan (`PURCHASE_REQUEST_SLACK_MENTION`)
- Migrations: `20260906220000_purchase_requests.sql`, `20260908180000_purchase_catalog.sql` (apply in Supabase SQL editor if a fresh env is empty)

### Other notable libs

`cart.tsx`, `checkinCandidates.ts`, `daycareAddon.ts`, `groomingAddons.ts`, `groomingEstimator.ts`, `helcim.ts`, `ownerGate.ts`, `qaMode.ts`, `quo.ts`, `retailPricing.ts`, `serviceSubtypes.ts`, `vaccines.ts`, `purchaseCatalog.ts`

## Env vars (names only — values never in git)

| Name | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client | Supabase |
| `QA_ACCESS_TOKEN` | server | `/qa-login` |
| `LEADS_WEBHOOK_KEY` | server | `POST /api/leads` |
| `PURCHASE_REQUEST_PIN` | server | public form gate (set in production) |
| `PURCHASE_REQUEST_WEBHOOK_URL` | server | Slack (or similar) on create |
| `PURCHASE_REQUEST_SLACK_MENTION` | server | default Krishan; empty = no mention |

Helcim + Gingr secrets are **not** in this repo. Gingr keys stay in the edge function.

## Conventions

- TypeScript strict; Tailwind (light-first, `#f5f6f8` bg, indigo-600 accent, 10–14px radii, IBM Plex Sans; keep `dark:` variants working). Tailwind `content` includes `src/lib` on purpose.
- React 18: `useFormState` / `useFormStatus` from `react-dom` (**not** `useActionState`).
- Server actions log to `reservation_history` with `performedBy`.
- Additive SQL migrations under `supabase/migrations/` — never drop production columns casually; apply in the Supabase SQL editor when noted in the PR.
- Tags editors on animal/parent pages are collapsed by default — leave them that way.

## Reporting findings

Record test results in `/qa`, or open a GitHub issue with repro steps, expected vs actual, and severity (P0–P3). Support tickets live in-app under Reported Issues (`/support`); replies go in the ticket's `response` field.
