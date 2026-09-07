-- ============================================================================
-- Dawg Dashboard — core schema
-- Gingr replacement: multi-facility dog boarding / daycare operations
-- ============================================================================

create extension if not exists "uuid-ossp";

-- ----------------------------------------------------------------------------
-- FACILITIES  (House of Woof, Don Doggos, Four Paws Inn, Riverwalk Pet Resort)
-- ----------------------------------------------------------------------------
create table facilities (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique not null,          -- matches PawFeed's ?facility= param, e.g. "how"
  timezone text not null default 'America/New_York',
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- STAFF  (login for front-desk + PawFeed; "Specialist" = staff who perform services)
-- ----------------------------------------------------------------------------
create table staff (
  id uuid primary key default uuid_generate_v4(),
  auth_user_id uuid references auth.users(id),
  facility_id uuid not null references facilities(id),
  full_name text not null,
  role text not null default 'front_desk',   -- front_desk | specialist | manager | owner
  is_specialist boolean not null default false,
  specialties text[],                        -- e.g. {grooming, training}
  pin text,                                  -- for PawFeed-style PIN login
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- PARENTS  (owners)
-- ----------------------------------------------------------------------------
create table parents (
  id uuid primary key default uuid_generate_v4(),
  auth_user_id uuid references auth.users(id),
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  notes text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- ANIMALS
-- ----------------------------------------------------------------------------
create table animals (
  id uuid primary key default uuid_generate_v4(),
  parent_id uuid not null references parents(id) on delete cascade,
  name text not null,
  species text not null default 'dog',
  breed text,
  size text,                          -- small | medium | large | xl
  weight_lbs numeric,
  birthdate date,
  sex text,
  fixed boolean,
  photo_url text,
  vet_name text,
  vet_phone text,
  vaccination_expiry date,
  medical_notes text,
  behavioral_notes text,
  feeding_instructions text,
  medications text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- LODGING AREAS  (kennels/suites/runs, scoped per facility)
-- ----------------------------------------------------------------------------
create table lodging_areas (
  id uuid primary key default uuid_generate_v4(),
  facility_id uuid not null references facilities(id),
  name text not null,                 -- e.g. "Suite 4", "Run B"
  area_type text not null default 'kennel',  -- kennel | suite | run | daycare_pen
  capacity int not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- RESERVATION TYPES  (rate templates: boarding / daycare / grooming / training)
-- ----------------------------------------------------------------------------
create table reservation_types (
  id uuid primary key default uuid_generate_v4(),
  facility_id uuid not null references facilities(id),
  name text not null,                 -- e.g. "Overnight Boarding", "Full-Day Daycare"
  category text not null,             -- boarding | daycare | grooming | training
  base_rate numeric not null default 0,
  rate_unit text not null default 'per_night',  -- per_night | per_day | per_session
  requires_lodging boolean not null default true,
  requires_specialist boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- RESERVATIONS
-- ----------------------------------------------------------------------------
create table reservations (
  id uuid primary key default uuid_generate_v4(),
  facility_id uuid not null references facilities(id),
  animal_id uuid not null references animals(id),
  reservation_type_id uuid not null references reservation_types(id),
  lodging_area_id uuid references lodging_areas(id),
  specialist_id uuid references staff(id),
  start_date timestamptz not null,
  end_date timestamptz not null,
  status text not null default 'booked',  -- booked | checked_in | checked_out | cancelled | no_show
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);
create index on reservations (facility_id, start_date, end_date);
create index on reservations (animal_id);

-- ----------------------------------------------------------------------------
-- FEEDING RECORDS  (mirrors existing PawFeed app — animal + reservation + meal + date)
-- ----------------------------------------------------------------------------
create table feeding_records (
  id uuid primary key default uuid_generate_v4(),
  reservation_id uuid not null references reservations(id) on delete cascade,
  animal_id uuid not null references animals(id),
  facility_id uuid not null references facilities(id),
  record_date date not null,
  meal text not null,                 -- Breakfast | Lunch | Dinner
  ate text,                           -- All | Half | Some | None
  house_food_given boolean default false,
  fresh_food_given boolean default false,
  medication_given boolean default false,
  logged_by uuid references staff(id),
  logged_at timestamptz not null default now(),
  notes text,
  unique (reservation_id, record_date, meal)
);

-- ----------------------------------------------------------------------------
-- RETAIL ITEMS
-- ----------------------------------------------------------------------------
create table retail_items (
  id uuid primary key default uuid_generate_v4(),
  facility_id uuid not null references facilities(id),
  name text not null,
  sku text,
  price numeric not null default 0,
  taxable boolean not null default true,
  stock_qty int,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- INVOICES  (cart = invoice with status = 'open')
-- ----------------------------------------------------------------------------
create table invoices (
  id uuid primary key default uuid_generate_v4(),
  facility_id uuid not null references facilities(id),
  parent_id uuid not null references parents(id),
  reservation_id uuid references reservations(id),
  status text not null default 'open',  -- open | paid | void | refunded
  subtotal numeric not null default 0,
  tax numeric not null default 0,
  total numeric not null default 0,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table invoice_line_items (
  id uuid primary key default uuid_generate_v4(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  reservation_type_id uuid references reservation_types(id),
  retail_item_id uuid references retail_items(id),
  description text not null,
  quantity numeric not null default 1,
  unit_price numeric not null default 0,
  line_total numeric not null default 0
);

-- ----------------------------------------------------------------------------
-- LEADS  (prospects, pre-conversion to parent/animal)
-- ----------------------------------------------------------------------------
create table leads (
  id uuid primary key default uuid_generate_v4(),
  facility_id uuid not null references facilities(id),
  first_name text,
  last_name text,
  email text,
  phone text,
  pet_name text,
  pet_breed text,
  source text,                        -- website | referral | walk_in | phone
  status text not null default 'new', -- new | contacted | tour_scheduled | converted | lost
  converted_parent_id uuid references parents(id),
  notes text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- ROW LEVEL SECURITY
--
-- Staff log in via facility + name + PIN (matching PawFeed's existing pattern),
-- not Supabase Auth accounts — so there's no auth.uid() session to key policies
-- off of. RLS is therefore "app-trusted": enabled, but permissive, the same
-- trust model already live on `feeding_logs`. Facility isolation is enforced by
-- the Next.js app itself, which always filters facility-scoped queries by the
-- facility chosen at login (see src/lib/session.ts + every page under src/app).
--
-- Reservations, lodging, feeding, retail, leads, and staff are meant to be
-- queried filtered by facility_id in every app query — a House of Woof login
-- should never issue a query without that filter. Parents, Animals, and
-- Invoices are the intentionally shared cross-facility layer and are queried
-- without a facility filter — one dog/family record and one billing history
-- regardless of which location(s) they've used.
--
-- To harden later: move off PIN-only login to real Supabase Auth accounts per
-- staff member, then swap these permissive policies for ones keyed on
-- auth.uid() (see git history for the auth.uid()-based version this replaced).
-- ============================================================================
alter table facilities enable row level security;
alter table staff enable row level security;
alter table parents enable row level security;
alter table animals enable row level security;
alter table lodging_areas enable row level security;
alter table reservation_types enable row level security;
alter table reservations enable row level security;
alter table feeding_records enable row level security;
alter table retail_items enable row level security;
alter table invoices enable row level security;
alter table invoice_line_items enable row level security;
alter table leads enable row level security;

create policy "app-trusted access" on lodging_areas for all using (true) with check (true);
create policy "app-trusted access" on reservation_types for all using (true) with check (true);
create policy "app-trusted access" on reservations for all using (true) with check (true);
create policy "app-trusted access" on feeding_records for all using (true) with check (true);
create policy "app-trusted access" on retail_items for all using (true) with check (true);
create policy "app-trusted access" on leads for all using (true) with check (true);
create policy "app-trusted access" on staff for all using (true) with check (true);
create policy "app-trusted access" on parents for all using (true) with check (true);
create policy "app-trusted access" on animals for all using (true) with check (true);
create policy "app-trusted access" on invoices for all using (true) with check (true);
create policy "app-trusted access" on invoice_line_items for all using (true) with check (true);

-- facilities table: readable by anyone (needed for the facility picker, pre-login)
create policy "facilities readable for login picker" on facilities
  for select using (true);

-- ----------------------------------------------------------------------------
-- PURCHASE REQUESTS  (staff supply / PO requests — see also
-- supabase/migrations/20260906220000_purchase_requests.sql)
-- ----------------------------------------------------------------------------
create table purchase_requests (
  id uuid primary key default uuid_generate_v4(),
  request_number integer generated always as identity unique,
  facility_id uuid not null references facilities(id),
  requested_by text not null,
  notes text,
  status text not null default 'new',  -- new | ordered | received | cancelled
  created_at timestamptz not null default now()
);

create table purchase_request_items (
  id uuid primary key default uuid_generate_v4(),
  purchase_request_id uuid not null references purchase_requests(id) on delete cascade,
  item text not null,
  brand text,
  quantity numeric(12, 2) not null,
  urgent boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index on purchase_requests (status, created_at desc);
create index on purchase_request_items (purchase_request_id, sort_order);

alter table purchase_requests enable row level security;
alter table purchase_request_items enable row level security;
create policy "app-trusted access" on purchase_requests for all using (true) with check (true);
create policy "app-trusted access" on purchase_request_items for all using (true) with check (true);

create or replace function create_purchase_request(
  p_facility_id uuid,
  p_requested_by text,
  p_notes text,
  p_items jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_id uuid;
  v_number integer;
  v_item jsonb;
  v_idx integer := 0;
  v_name text;
  v_brand text;
  v_qty numeric;
begin
  if p_facility_id is null then
    raise exception 'facility is required';
  end if;
  if not exists (select 1 from facilities where id = p_facility_id) then
    raise exception 'unknown facility';
  end if;
  if coalesce(trim(p_requested_by), '') = '' then
    raise exception 'requested by is required';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    raise exception 'at least one item is required';
  end if;

  insert into purchase_requests (facility_id, requested_by, notes, status)
  values (
    p_facility_id,
    trim(p_requested_by),
    nullif(trim(coalesce(p_notes, '')), ''),
    'new'
  )
  returning id, request_number into v_id, v_number;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_name := trim(coalesce(v_item->>'item', ''));
    v_brand := nullif(trim(coalesce(v_item->>'brand', '')), '');
    begin
      v_qty := (v_item->>'quantity')::numeric;
    exception
      when others then
        raise exception 'quantity must be a number greater than 0';
    end;
    if v_name = '' then
      raise exception 'item name is required';
    end if;
    if v_qty is null or v_qty <= 0 then
      raise exception 'quantity must be greater than 0';
    end if;

    insert into purchase_request_items (
      purchase_request_id, item, brand, quantity, urgent, sort_order
    ) values (
      v_id,
      v_name,
      v_brand,
      v_qty,
      coalesce((v_item->>'urgent')::boolean, false),
      v_idx
    );
    v_idx := v_idx + 1;
  end loop;

  return jsonb_build_object(
    'id', v_id,
    'request_number', v_number,
    'status', 'new'
  );
end;
$$;

alter function create_purchase_request(uuid, text, text, jsonb) set search_path = public;
grant execute on function create_purchase_request(uuid, text, text, jsonb) to anon, authenticated;

