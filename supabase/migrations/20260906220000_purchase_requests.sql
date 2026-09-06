-- Staff purchase / supply requests.
-- Apply this on the live project (SQL editor or `supabase db push`) before
-- using /purchase-request. Additive only — does not touch Gingr / reservation
-- tables.
--
-- RLS matches the rest of the app: enabled + permissive "app-trusted" policies
-- because staff use cookie PIN/facility login, not auth.uid(). See
-- supabase/schema.sql and README.md.

create table if not exists purchase_requests (
  id uuid primary key default uuid_generate_v4(),
  request_number integer generated always as identity unique,
  facility_id uuid not null references facilities(id),
  requested_by text not null,
  notes text,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  constraint purchase_requests_requested_by_len check (char_length(requested_by) between 1 and 120),
  constraint purchase_requests_notes_len check (notes is null or char_length(notes) <= 2000),
  constraint purchase_requests_status_known check (status in ('new', 'ordered', 'received', 'cancelled'))
);

create table if not exists purchase_request_items (
  id uuid primary key default uuid_generate_v4(),
  purchase_request_id uuid not null references purchase_requests(id) on delete cascade,
  item text not null,
  brand text,
  quantity numeric(12, 2) not null,
  urgent boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint purchase_request_items_item_len check (char_length(item) between 1 and 200),
  constraint purchase_request_items_brand_len check (brand is null or char_length(brand) <= 120),
  constraint purchase_request_items_qty_positive check (quantity > 0)
);

create index if not exists purchase_requests_status_created_idx
  on purchase_requests (status, created_at desc);
create index if not exists purchase_requests_facility_idx
  on purchase_requests (facility_id);
create index if not exists purchase_request_items_request_idx
  on purchase_request_items (purchase_request_id, sort_order);

alter table purchase_requests enable row level security;
alter table purchase_request_items enable row level security;

drop policy if exists "app-trusted access" on purchase_requests;
create policy "app-trusted access" on purchase_requests
  for all using (true) with check (true);

drop policy if exists "app-trusted access" on purchase_request_items;
create policy "app-trusted access" on purchase_request_items
  for all using (true) with check (true);

-- One transaction: header + line items. Called from POST /api/purchase-requests.
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
