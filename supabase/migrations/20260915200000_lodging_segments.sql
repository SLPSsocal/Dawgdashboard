-- Per-day suite changes on one reservation (Mark, Sep 14): a boarding stay
-- can move suites mid-stay (suite 3 Mon–Wed, suite 7 Thu–Fri) the way Gingr
-- allows, instead of double-booking a suite or splitting the stay in two.
--
-- Model: a reservation with NO rows here uses reservations.lodging_area_id
-- for the whole stay (unchanged behaviour). Once staff split a stay, its
-- segments live here and TOGETHER cover the stay; reservations.lodging_area_id
-- is kept in sync to the segment that covers today (or the first segment) so
-- everything that still reads the single column keeps working.
create table if not exists reservation_lodging_segments (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations(id) on delete cascade,
  lodging_area_id uuid references lodging_areas(id) on delete set null,
  start_ymd date not null,
  end_ymd date not null, -- exclusive, like a checkout day
  created_at timestamptz not null default now(),
  constraint reservation_lodging_segments_range check (end_ymd > start_ymd)
);
create index if not exists reservation_lodging_segments_res_idx on reservation_lodging_segments(reservation_id);
create index if not exists reservation_lodging_segments_area_idx on reservation_lodging_segments(lodging_area_id, start_ymd, end_ymd);
comment on table reservation_lodging_segments is 'Suite-by-date-range for reservations that change suites mid-stay. Absent rows = the whole stay is in reservations.lodging_area_id.';

alter table reservation_lodging_segments enable row level security;
drop policy if exists "app-trusted access" on reservation_lodging_segments;
create policy "app-trusted access" on reservation_lodging_segments
  for all using (true) with check (true);
