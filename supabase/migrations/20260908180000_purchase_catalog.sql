-- Staff purchase catalog (Phase 1+2).
-- Apply this on the live project (SQL editor or `supabase db push`) after
-- 20260906220000_purchase_requests.sql. Additive only — does not touch Gingr /
-- reservation tables, and does not drop existing purchase_requests rows.
--
-- Replaces free-text item rows on /purchase-request with a fixed checklist.
-- typical_unit_cost_usd is seeded for a later invoice-cost phase; the staff
-- form does not show prices.
--
-- RLS matches the rest of the app: enabled + permissive "app-trusted" policies
-- because staff use cookie PIN/facility login, not auth.uid(). See
-- supabase/schema.sql and README.md.

create table if not exists purchase_catalog_items (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  brand text not null,
  typical_unit text not null,
  pack_size text,
  typical_unit_cost_usd numeric(12, 2),
  category text not null,
  notes text,
  active boolean not null default true,
  sort_order integer not null default 0,
  constraint purchase_catalog_items_name_len check (char_length(name) between 1 and 200),
  constraint purchase_catalog_items_brand_len check (char_length(brand) between 1 and 120),
  constraint purchase_catalog_items_unit_len check (char_length(typical_unit) between 1 and 80),
  constraint purchase_catalog_items_pack_len check (pack_size is null or char_length(pack_size) <= 120),
  constraint purchase_catalog_items_category_len check (char_length(category) between 1 and 80),
  constraint purchase_catalog_items_notes_len check (notes is null or char_length(notes) <= 500),
  constraint purchase_catalog_items_cost_nonneg check (
    typical_unit_cost_usd is null or typical_unit_cost_usd >= 0
  ),
  constraint purchase_catalog_items_name_brand_key unique (name, brand)
);

create index if not exists purchase_catalog_items_active_sort_idx
  on purchase_catalog_items (active, category, sort_order, name);

alter table purchase_catalog_items enable row level security;

drop policy if exists "app-trusted access" on purchase_catalog_items;
create policy "app-trusted access" on purchase_catalog_items
  for all using (true) with check (true);

alter table purchase_request_items
  add column if not exists catalog_item_id uuid references purchase_catalog_items(id);

create index if not exists purchase_request_items_catalog_idx
  on purchase_request_items (catalog_item_id)
  where catalog_item_id is not null;

create index if not exists purchase_request_items_item_lower_idx
  on purchase_request_items (lower(trim(item)));

-- Seed / refresh catalog. Dedupe by name+brand. Re-running updates pack hints,
-- notes, and typical costs without wiping staff request history.
insert into purchase_catalog_items (
  name, brand, typical_unit, pack_size, typical_unit_cost_usd, category, notes, sort_order, active
)
select
  trim(x.name),
  trim(x.brand),
  trim(x.typical_unit),
  nullif(trim(coalesce(x.pack_size, '')), ''),
  x.typical_unit_cost_usd,
  trim(x.category),
  nullif(trim(coalesce(x.notes, '')), ''),
  x.sort_order,
  true
from jsonb_to_recordset(($catalog$
[
  {
    "name": "Freestyle Soft Baby Wipes for Sensitive Skin, Unscented",
    "brand": "Freestyle",
    "typical_unit": "case (9 flip-top packs)",
    "pack_size": "648 total count (9×72)",
    "typical_unit_cost_usd": 18.34,
    "category": "cleaning",
    "notes": "Exact preferred: purple Freestyle Soft packaging; Walmart ip/19623566741; NO SUBSTITUTES",
    "sort_order": 10
  },
  {
    "name": "Sensodyne Extra Whitening Sensitive Toothpaste, Mint",
    "brand": "Sensodyne",
    "typical_unit": "tube",
    "pack_size": "4 oz",
    "typical_unit_cost_usd": 6.97,
    "category": "medical/first aid",
    "notes": "Staff oral care",
    "sort_order": 20
  },
  {
    "name": "Cottonelle Ultra Soft Toilet Paper",
    "brand": "Cottonelle",
    "typical_unit": "pack",
    "pack_size": "12 mega rolls",
    "typical_unit_cost_usd": 11.67,
    "category": "paper goods",
    "notes": null,
    "sort_order": 30
  },
  {
    "name": "Charmin Ultra Soft Toilet Paper",
    "brand": "Charmin",
    "typical_unit": "pack",
    "pack_size": "12 mega XL rolls",
    "typical_unit_cost_usd": 19.96,
    "category": "paper goods",
    "notes": "Alt to Cottonelle",
    "sort_order": 40
  },
  {
    "name": "Bounty Paper Towels Select-a-Size",
    "brand": "Bounty",
    "typical_unit": "pack",
    "pack_size": "6 triple rolls",
    "typical_unit_cost_usd": 17.78,
    "category": "paper goods",
    "notes": null,
    "sort_order": 50
  },
  {
    "name": "Amazon Basics Dog Poop Leak Proof Bags with Dispenser",
    "brand": "Amazon Basics",
    "typical_unit": "case",
    "pack_size": "900 count (60 rolls), 13x9 unscented",
    "typical_unit_cost_usd": 19.84,
    "category": "dog supplies",
    "notes": null,
    "sort_order": 60
  },
  {
    "name": "Dog Leash Slip Lead Braided Rope (2-pack)",
    "brand": "generic",
    "typical_unit": "2-pack",
    "pack_size": "6 ft / 8 ft",
    "typical_unit_cost_usd": 13.67,
    "category": "dog supplies",
    "notes": null,
    "sort_order": 70
  },
  {
    "name": "Kiss blue leads / slip leads",
    "brand": "Kiss MFG",
    "typical_unit": "lead",
    "pack_size": "pack size varies",
    "typical_unit_cost_usd": null,
    "category": "dog supplies",
    "notes": null,
    "sort_order": 80
  },
  {
    "name": "Rubbermaid Commercial Gripper Wet Mop Handle",
    "brand": "Rubbermaid",
    "typical_unit": "each",
    "pack_size": "60 in fiberglass",
    "typical_unit_cost_usd": 32.33,
    "category": "cleaning",
    "notes": null,
    "sort_order": 90
  },
  {
    "name": "Humboldts Secret Garden Hose End Sprayer",
    "brand": "Humboldts Secret",
    "typical_unit": "2-pack",
    "pack_size": "32 oz",
    "typical_unit_cost_usd": 33.92,
    "category": "cleaning",
    "notes": null,
    "sort_order": 100
  },
  {
    "name": "Small Spring Clamps (metal clip)",
    "brand": "generic",
    "typical_unit": "pack",
    "pack_size": "40 pcs 2in",
    "typical_unit_cost_usd": 9.99,
    "category": "cleaning",
    "notes": null,
    "sort_order": 110
  },
  {
    "name": "Uineko Empty Spray Bottles Heavy Duty",
    "brand": "Uineko",
    "typical_unit": "4-pack",
    "pack_size": "32 oz",
    "typical_unit_cost_usd": 14.5,
    "category": "cleaning",
    "notes": null,
    "sort_order": 120
  },
  {
    "name": "LUFFWELL Dog Pooper Scooper (tray & spade)",
    "brand": "LUFFWELL",
    "typical_unit": "set",
    "pack_size": "large metal",
    "typical_unit_cost_usd": 25.64,
    "category": "dog supplies",
    "notes": null,
    "sort_order": 130
  },
  {
    "name": "Tide PODS laundry detergent pacs, Spring Meadow",
    "brand": "Tide",
    "typical_unit": "tub",
    "pack_size": "112 count",
    "typical_unit_cost_usd": 21.98,
    "category": "laundry",
    "notes": null,
    "sort_order": 140
  },
  {
    "name": "Pine-Sol Multi-Surface Cleaner, Original Pine",
    "brand": "Pine-Sol",
    "typical_unit": "bottle / multipack",
    "pack_size": "often 80 fl oz",
    "typical_unit_cost_usd": null,
    "category": "cleaning",
    "notes": null,
    "sort_order": 150
  },
  {
    "name": "Dawn Ultra Dishwashing Liquid",
    "brand": "Dawn",
    "typical_unit": "bottle",
    "pack_size": "size varies",
    "typical_unit_cost_usd": null,
    "category": "cleaning",
    "notes": null,
    "sort_order": 160
  },
  {
    "name": "Febreze Air Mist Air Freshener, Twilight Lavender",
    "brand": "Febreze",
    "typical_unit": "multipack",
    "pack_size": "8.1 oz x 2",
    "typical_unit_cost_usd": null,
    "category": "cleaning",
    "notes": null,
    "sort_order": 170
  },
  {
    "name": "Mighty Mint Rodent Repellent Spray",
    "brand": "Mighty Mint",
    "typical_unit": "bottle",
    "pack_size": null,
    "typical_unit_cost_usd": 33.11,
    "category": "cleaning",
    "notes": null,
    "sort_order": 180
  },
  {
    "name": "Freshpet Fresh Dog Food",
    "brand": "Freshpet",
    "typical_unit": "roll / case",
    "pack_size": "refrigerated",
    "typical_unit_cost_usd": null,
    "category": "dog supplies",
    "notes": null,
    "sort_order": 190
  },
  {
    "name": "Scoop Away Multi Cat Litter, Meadow Fresh",
    "brand": "Scoop Away",
    "typical_unit": "box",
    "pack_size": "38 lb",
    "typical_unit_cost_usd": null,
    "category": "dog supplies",
    "notes": null,
    "sort_order": 200
  },
  {
    "name": "Weruva Pumpkin Patch Up! Pumpkin Puree",
    "brand": "Weruva",
    "typical_unit": "pouch multipack",
    "pack_size": "1.05 oz x 12",
    "typical_unit_cost_usd": 14.04,
    "category": "dog supplies",
    "notes": null,
    "sort_order": 210
  },
  {
    "name": "IAMS Proactive Health Adult Dog Food",
    "brand": "IAMS",
    "typical_unit": "bag",
    "pack_size": null,
    "typical_unit_cost_usd": null,
    "category": "dog supplies",
    "notes": null,
    "sort_order": 220
  },
  {
    "name": "Forticept Maxi-Wash",
    "brand": "Forticept",
    "typical_unit": "bottle",
    "pack_size": null,
    "typical_unit_cost_usd": null,
    "category": "dog supplies / grooming",
    "notes": null,
    "sort_order": 230
  },
  {
    "name": "Effersan disinfectant",
    "brand": "Effersan",
    "typical_unit": "case",
    "pack_size": null,
    "typical_unit_cost_usd": null,
    "category": "cleaning",
    "notes": null,
    "sort_order": 240
  },
  {
    "name": "Hydrogen peroxide",
    "brand": "generic",
    "typical_unit": "bottle",
    "pack_size": null,
    "typical_unit_cost_usd": null,
    "category": "medical/first aid",
    "notes": null,
    "sort_order": 250
  },
  {
    "name": "Tylenol",
    "brand": "Tylenol",
    "typical_unit": "bottle",
    "pack_size": null,
    "typical_unit_cost_usd": 10.52,
    "category": "medical/first aid",
    "notes": null,
    "sort_order": 260
  },
  {
    "name": "Cotton balls",
    "brand": "generic",
    "typical_unit": "bag",
    "pack_size": null,
    "typical_unit_cost_usd": null,
    "category": "grooming / medical",
    "notes": null,
    "sort_order": 270
  },
  {
    "name": "Grooming spray",
    "brand": "generic",
    "typical_unit": "bottle",
    "pack_size": null,
    "typical_unit_cost_usd": null,
    "category": "grooming",
    "notes": null,
    "sort_order": 280
  },
  {
    "name": "Avont Pet Safe Dog Hair Dye (temporary)",
    "brand": "Avont",
    "typical_unit": "kit",
    "pack_size": "12 colors",
    "typical_unit_cost_usd": 16.99,
    "category": "grooming",
    "notes": null,
    "sort_order": 290
  },
  {
    "name": "Halloween dog hair bows (ghost pattern)",
    "brand": "Kacctyen",
    "typical_unit": "pack",
    "pack_size": "150 pcs",
    "typical_unit_cost_usd": 33.99,
    "category": "grooming",
    "notes": null,
    "sort_order": 300
  },
  {
    "name": "Halloween dog hair bows (ghost pattern)",
    "brand": "Tondiamo",
    "typical_unit": "pack",
    "pack_size": "100 pcs",
    "typical_unit_cost_usd": 17.59,
    "category": "grooming",
    "notes": null,
    "sort_order": 310
  },
  {
    "name": "Halloween dog bows ties & collars",
    "brand": "Maitys",
    "typical_unit": "pack",
    "pack_size": "40 pcs",
    "typical_unit_cost_usd": 19.99,
    "category": "grooming",
    "notes": null,
    "sort_order": 320
  },
  {
    "name": "Coca-Cola Classic 12-pack cans",
    "brand": "Coca-Cola",
    "typical_unit": "12-pack",
    "pack_size": "12 cans",
    "typical_unit_cost_usd": 7.29,
    "category": "groceries/snacks",
    "notes": "Soft-warn soda on submit still",
    "sort_order": 330
  },
  {
    "name": "Coca-Cola Zero Sugar 12-pack cans",
    "brand": "Coca-Cola",
    "typical_unit": "12-pack",
    "pack_size": "12 cans",
    "typical_unit_cost_usd": 7.29,
    "category": "groceries/snacks",
    "notes": null,
    "sort_order": 340
  },
  {
    "name": "Sprite 12-pack cans",
    "brand": "Sprite",
    "typical_unit": "12-pack",
    "pack_size": "12 cans",
    "typical_unit_cost_usd": 7.29,
    "category": "groceries/snacks",
    "notes": null,
    "sort_order": 350
  },
  {
    "name": "Coca-Cola Flavors Mini Cans Variety Pack",
    "brand": "Coca-Cola",
    "typical_unit": "variety pack",
    "pack_size": "7.5 fl oz x 30",
    "typical_unit_cost_usd": null,
    "category": "groceries/snacks",
    "notes": null,
    "sort_order": 360
  },
  {
    "name": "Gatorade Sports Drink Variety Pack",
    "brand": "Gatorade",
    "typical_unit": "case",
    "pack_size": "12 fl oz x 18",
    "typical_unit_cost_usd": null,
    "category": "groceries/snacks",
    "notes": "Soft-warn liquid Gatorade",
    "sort_order": 370
  },
  {
    "name": "Gatorade Zero On the Go powder sticks",
    "brand": "Gatorade",
    "typical_unit": "box",
    "pack_size": "24 sticks",
    "typical_unit_cost_usd": null,
    "category": "groceries/snacks",
    "notes": null,
    "sort_order": 380
  },
  {
    "name": "Hot Pockets Pepperoni Pizza (frozen)",
    "brand": "Hot Pockets",
    "typical_unit": "box",
    "pack_size": "12 pack",
    "typical_unit_cost_usd": null,
    "category": "groceries/snacks",
    "notes": null,
    "sort_order": 390
  },
  {
    "name": "Hot Pockets Philly Steak and Cheese (frozen)",
    "brand": "Hot Pockets",
    "typical_unit": "box",
    "pack_size": "12 or 8 pack",
    "typical_unit_cost_usd": null,
    "category": "groceries/snacks",
    "notes": null,
    "sort_order": 400
  },
  {
    "name": "Jimmy Dean Sausage Egg & Cheese Croissant (frozen)",
    "brand": "Jimmy Dean",
    "typical_unit": "box",
    "pack_size": "8 count",
    "typical_unit_cost_usd": null,
    "category": "groceries/snacks",
    "notes": null,
    "sort_order": 410
  },
  {
    "name": "Jimmy Dean Sausage Egg & Cheese English Muffin / Biscuit",
    "brand": "Jimmy Dean",
    "typical_unit": "box",
    "pack_size": "8 count",
    "typical_unit_cost_usd": null,
    "category": "groceries/snacks",
    "notes": null,
    "sort_order": 420
  },
  {
    "name": "Cheetos Crunchy Flamin Hot Party Size",
    "brand": "Cheetos",
    "typical_unit": "bag",
    "pack_size": "15 oz",
    "typical_unit_cost_usd": null,
    "category": "groceries/snacks",
    "notes": null,
    "sort_order": 430
  },
  {
    "name": "Doritos Cool Ranch Party Size",
    "brand": "Doritos",
    "typical_unit": "bag",
    "pack_size": "14.5 oz",
    "typical_unit_cost_usd": null,
    "category": "groceries/snacks",
    "notes": null,
    "sort_order": 440
  },
  {
    "name": "Nabisco Crowd Favorites Cookie Variety",
    "brand": "Nabisco",
    "typical_unit": "box",
    "pack_size": "30 snack packs",
    "typical_unit_cost_usd": null,
    "category": "groceries/snacks",
    "notes": null,
    "sort_order": 450
  },
  {
    "name": "Pop-Tarts Variety / Frosted Brown Sugar Cinnamon",
    "brand": "Pop-Tarts",
    "typical_unit": "box",
    "pack_size": "36 count",
    "typical_unit_cost_usd": null,
    "category": "groceries/snacks",
    "notes": null,
    "sort_order": 460
  },
  {
    "name": "Rice Krispies Treats Original",
    "brand": "Kellogg's",
    "typical_unit": "box",
    "pack_size": "16 count",
    "typical_unit_cost_usd": null,
    "category": "groceries/snacks",
    "notes": null,
    "sort_order": 470
  },
  {
    "name": "Once Upon a Farm Tractor Wheel oat bars",
    "brand": "Once Upon a Farm",
    "typical_unit": "box",
    "pack_size": null,
    "typical_unit_cost_usd": null,
    "category": "groceries/snacks",
    "notes": "Confirm pack next invoice",
    "sort_order": 480
  },
  {
    "name": "Great Value Purified Drinking Water",
    "brand": "Great Value",
    "typical_unit": "case",
    "pack_size": "16.9 fl oz x 40",
    "typical_unit_cost_usd": null,
    "category": "groceries/snacks",
    "notes": null,
    "sort_order": 490
  },
  {
    "name": "Great Value Disposable Paper Plates 8.5in",
    "brand": "Great Value",
    "typical_unit": "pack",
    "pack_size": "100 count",
    "typical_unit_cost_usd": 5.58,
    "category": "paper goods",
    "notes": null,
    "sort_order": 500
  },
  {
    "name": "Great Value Red Disposable Plastic Party Cups 18 oz",
    "brand": "Great Value",
    "typical_unit": "pack",
    "pack_size": "50 count",
    "typical_unit_cost_usd": 4.28,
    "category": "paper goods",
    "notes": null,
    "sort_order": 510
  },
  {
    "name": "Sharpie Tank Style Highlighters",
    "brand": "Sharpie",
    "typical_unit": "pack",
    "pack_size": null,
    "typical_unit_cost_usd": null,
    "category": "office",
    "notes": null,
    "sort_order": 520
  },
  {
    "name": "Dry erase markers",
    "brand": "generic",
    "typical_unit": "pack",
    "pack_size": null,
    "typical_unit_cost_usd": 13.26,
    "category": "office",
    "notes": null,
    "sort_order": 530
  },
  {
    "name": "Pens (office / facility)",
    "brand": "generic",
    "typical_unit": "pack",
    "pack_size": null,
    "typical_unit_cost_usd": null,
    "category": "office",
    "notes": null,
    "sort_order": 540
  },
  {
    "name": "Brother LC401XL ink (black + colors)",
    "brand": "Brother",
    "typical_unit": "cartridge set",
    "pack_size": "XL black + color",
    "typical_unit_cost_usd": 107.83,
    "category": "office",
    "notes": null,
    "sort_order": 550
  },
  {
    "name": "Receipt / thermal paper",
    "brand": "MUNBYN / LabelValue",
    "typical_unit": "roll",
    "pack_size": "2.25in x 50ft",
    "typical_unit_cost_usd": null,
    "category": "office",
    "notes": null,
    "sort_order": 560
  },
  {
    "name": "Command Large Utility hooks",
    "brand": "Command",
    "typical_unit": "pack",
    "pack_size": null,
    "typical_unit_cost_usd": null,
    "category": "office",
    "notes": null,
    "sort_order": 570
  },
  {
    "name": "OFF! FamilyCare Insect Repellent",
    "brand": "OFF!",
    "typical_unit": "can / pack",
    "pack_size": null,
    "typical_unit_cost_usd": null,
    "category": "medical/first aid",
    "notes": null,
    "sort_order": 580
  },
  {
    "name": "Trash bags",
    "brand": "generic",
    "typical_unit": "box",
    "pack_size": null,
    "typical_unit_cost_usd": null,
    "category": "cleaning",
    "notes": null,
    "sort_order": 590
  },
  {
    "name": "Dish soap (bulk)",
    "brand": "generic / Dawn",
    "typical_unit": "bottle",
    "pack_size": null,
    "typical_unit_cost_usd": null,
    "category": "cleaning",
    "notes": null,
    "sort_order": 600
  },
  {
    "name": "Laundry soap (bulk)",
    "brand": "generic / Tide",
    "typical_unit": "jug / pods",
    "pack_size": null,
    "typical_unit_cost_usd": null,
    "category": "laundry",
    "notes": null,
    "sort_order": 610
  },
  {
    "name": "Cat litter (general)",
    "brand": "Scoop Away / ARM & HAMMER / generic",
    "typical_unit": "box",
    "pack_size": "~20-38 lb",
    "typical_unit_cost_usd": null,
    "category": "dog supplies",
    "notes": null,
    "sort_order": 620
  },
  {
    "name": "Dog bowls",
    "brand": "generic",
    "typical_unit": "each",
    "pack_size": null,
    "typical_unit_cost_usd": null,
    "category": "dog supplies",
    "notes": null,
    "sort_order": 630
  },
  {
    "name": "Fanny pack / waist bag (staff walk)",
    "brand": "Syican",
    "typical_unit": "each",
    "pack_size": "3-zipper",
    "typical_unit_cost_usd": 9.99,
    "category": "dog supplies",
    "notes": null,
    "sort_order": 640
  },
  {
    "name": "Colored duct tape assortment",
    "brand": "GiftExpress",
    "typical_unit": "pack",
    "pack_size": "12 rolls",
    "typical_unit_cost_usd": 17.99,
    "category": "office",
    "notes": null,
    "sort_order": 650
  },
  {
    "name": "Feeny leash holder",
    "brand": "Feeny (Etsy)",
    "typical_unit": "each",
    "pack_size": null,
    "typical_unit_cost_usd": 40.71,
    "category": "dog supplies",
    "notes": null,
    "sort_order": 660
  },
  {
    "name": "Apron (grooming/staff)",
    "brand": "generic",
    "typical_unit": "each",
    "pack_size": null,
    "typical_unit_cost_usd": 7.82,
    "category": "grooming",
    "notes": null,
    "sort_order": 670
  },
  {
    "name": "Equate Sensitive Fragrance-Free Wipes",
    "brand": "Equate",
    "typical_unit": "pack",
    "pack_size": "72 count",
    "typical_unit_cost_usd": 2.23,
    "category": "cleaning",
    "notes": "Prefer Freestyle 648 instead",
    "sort_order": 680
  }
]
$catalog$)::jsonb) as x(
  name text,
  brand text,
  typical_unit text,
  pack_size text,
  typical_unit_cost_usd numeric,
  category text,
  notes text,
  sort_order integer
)
on conflict on constraint purchase_catalog_items_name_brand_key do update set
  typical_unit = excluded.typical_unit,
  pack_size = excluded.pack_size,
  typical_unit_cost_usd = excluded.typical_unit_cost_usd,
  category = excluded.category,
  notes = excluded.notes,
  sort_order = excluded.sort_order,
  active = true;

-- Lock the preferred wipe line: exact Freestyle Soft (purple) packaging, no substitutes.
do $$
declare
  v_notes text;
begin
  select notes into v_notes
  from purchase_catalog_items
  where name = 'Freestyle Soft Baby Wipes for Sensitive Skin, Unscented'
    and brand = 'Freestyle';
  if v_notes is null or v_notes !~* 'NO SUBSTITUTES' or v_notes !~* 'Walmart ip/19623566741' then
    raise exception 'Freestyle Soft wipe catalog row is missing the locked no-substitutes notes';
  end if;
end;
$$;

-- One transaction: header + line items. Optional catalog_item_id copies
-- canonical name/brand from purchase_catalog_items.
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
  v_catalog_id uuid;
  v_cat_name text;
  v_cat_brand text;
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
    v_catalog_id := null;
    if coalesce(v_item->>'catalog_item_id', '') <> '' then
      begin
        v_catalog_id := (v_item->>'catalog_item_id')::uuid;
      exception
        when others then
          raise exception 'invalid catalog item';
      end;
    end if;
    begin
      v_qty := (v_item->>'quantity')::numeric;
    exception
      when others then
        raise exception 'quantity must be a number greater than 0';
    end;
    if v_catalog_id is not null then
      select name, brand into v_cat_name, v_cat_brand
      from purchase_catalog_items
      where id = v_catalog_id;
      if not found then
        raise exception 'unknown catalog item';
      end if;
      v_name := v_cat_name;
      v_brand := nullif(trim(v_cat_brand), '');
    end if;
    if v_name = '' then
      raise exception 'item name is required';
    end if;
    if v_qty is null or v_qty <= 0 then
      raise exception 'quantity must be greater than 0';
    end if;

    insert into purchase_request_items (
      purchase_request_id, item, brand, quantity, urgent, sort_order, catalog_item_id
    ) values (
      v_id,
      v_name,
      v_brand,
      v_qty,
      coalesce((v_item->>'urgent')::boolean, false),
      v_idx,
      v_catalog_id
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

-- Per-facility last request for each catalog item. Prefers catalog_item_id
-- matches; also considers legacy free-text rows whose item name matches.
-- Returns { [catalog_item_id]: { quantity, requestedAt } }.
create or replace function purchase_catalog_last_requests(p_facility_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  with latest_by_catalog as (
    select distinct on (pri.catalog_item_id)
      pri.catalog_item_id as id,
      pri.quantity,
      pr.created_at as requested_at
    from purchase_request_items pri
    inner join purchase_requests pr on pr.id = pri.purchase_request_id
    where pr.facility_id = p_facility_id
      and pri.catalog_item_id is not null
    order by pri.catalog_item_id, pr.created_at desc, pri.id desc
  ),
  latest_by_name as (
    select distinct on (lower(trim(pri.item)))
      lower(trim(pri.item)) as item_key,
      pri.quantity,
      pr.created_at as requested_at
    from purchase_request_items pri
    inner join purchase_requests pr on pr.id = pri.purchase_request_id
    where pr.facility_id = p_facility_id
      and pri.catalog_item_id is null
    order by lower(trim(pri.item)), pr.created_at desc, pri.id desc
  ),
  combined as (
    select
      pci.id,
      case
        when c.requested_at is null then n.quantity
        when n.requested_at is null then c.quantity
        when c.requested_at >= n.requested_at then c.quantity
        else n.quantity
      end as quantity,
      greatest(c.requested_at, n.requested_at) as requested_at
    from purchase_catalog_items pci
    left join latest_by_catalog c on c.id = pci.id
    left join latest_by_name n on n.item_key = lower(trim(pci.name))
  )
  select coalesce(
    jsonb_object_agg(
      combined.id::text,
      jsonb_build_object(
        'quantity', combined.quantity,
        'requestedAt', combined.requested_at
      )
    ) filter (where combined.requested_at is not null),
    '{}'::jsonb
  )
  from combined;
$$;

grant execute on function purchase_catalog_last_requests(uuid) to anon, authenticated;
