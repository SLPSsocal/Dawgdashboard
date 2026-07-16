# Dawg Dashboard

Custom multi-facility dog boarding/daycare operations system replacing Gingr.
Facilities: House of Woof, Don Doggos, Four Paws Inn, Riverwalk Pet Resort.

## Stack
- **Supabase** — Postgres, Storage, Realtime (project `pdjpfasmvdavjsaprgfj`, org "Doggie doggie" — same project behind PawFeed)
- **Next.js (App Router)** — deployed on **Vercel** (new project: `dawg-dashboard`, team "Doggie")
- **GitHub** — version control, auto-deploy on push (repo not yet created — see below)

## Setup

`supabase/schema.sql` has already been applied to the live project via migrations
`core_ops_schema`, `fix_function_search_path`, `rls_for_pin_login_model`,
`facilities_readable_by_anon_for_login_picker`, and `seed_owner_staff_for_testing`.

1. `npm install`
2. `.env.local` is already filled in with the project's URL + anon key.
3. `npm run dev`
4. Log in at `/login` — pick a facility, name **Owner**, PIN **0000** (seeded for
   testing on all four facilities). **Change or remove this before going live.**

To stand this up fresh elsewhere: create a Supabase project, run `supabase/schema.sql`
in the SQL editor, then fill in `.env.local` from `.env.local.example`.

## Structure

- `src/app/login/` — facility picker + name/PIN login (mirrors PawFeed's flow)
- `src/app/reservations/` — check-in board, facility-scoped
- `src/app/animals/`, `src/app/parents/` — shared across all facilities
- `src/app/lodging/` — facility-scoped
- `src/lib/session.ts` — cookie-based staff session (no Supabase Auth — see RLS note below)
- `src/lib/supabase/` — browser + server Supabase clients
- `supabase/schema.sql` — full database schema + row-level security policies (as applied)

## Build order

1. Core ops — animals, parents, reservations, lodging *(login + check-in board built;
   still need: create/edit reservation, animal & parent intake forms, lodging assignment UI)*
2. Feeding records — already live as a standalone app (PawFeed / feeny.vercel.app) on
   `feeding_logs`; the new `feeding_records` table exists for the eventual merge but isn't
   wired up yet — `feeding_logs` stays authoritative until that migration is planned.
3. Billing — invoices, retail, reservation types
4. Leads/CRM

## Data model: per-facility vs. shared

Each facility (House of Woof, Don Doggos, Four Paws Inn, Riverwalk) runs as its own
operational system — **staff, lodging_areas, reservation_types, reservations,
feeding_records, retail_items, leads** are always queried filtered by
`session.facilityId` in the app. A House of Woof login never issues a query without
that filter, so it can't see Four Paws Inn's check-in list, kennel board, or anything
else operational, and vice versa.

**Parents, Animals, and Invoices are shared** across all four facilities — one dog
profile and one owner record regardless of which location(s) they use, and one
invoice/billing history spanning all of them. These are queried without a facility
filter, on purpose.

## Login model & RLS tradeoff (read this before adding real staff)

Staff log in via facility + name + PIN, matching PawFeed's existing pattern — not
Supabase Auth accounts. That means there's no `auth.uid()` session for the database
to key security off of, so RLS is enabled on every table but the policies are
permissive (`using (true)`) — the same trust model already live on `feeding_logs`.
**Facility isolation is enforced by the app's queries, not the database.** Anyone
with the public anon key could technically query any facility's data directly against
the Supabase API, bypassing the app.

For four facilities you own with trusted staff, this matches what's already shipped
and is a reasonable tradeoff for speed and simplicity. If that stops being true (e.g.
a facility gets sold, or the anon key leaks in a way that matters), the fix is to move
staff to real Supabase Auth accounts and swap these policies for ones keyed on
`auth.uid()` — an earlier draft of `schema.sql` in git history has that version to
start from.
