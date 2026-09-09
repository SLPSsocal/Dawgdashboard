-- Grooming add-ons (Daisy + Kathleen): extra services booked alongside the
-- main grooming service, each with its own quoted price.
alter table reservations add column if not exists grooming_addons jsonb not null default '[]'::jsonb;
comment on column reservations.grooming_addons is 'Extra grooming services booked alongside grooming_service_name: [{"name": "De-shed", "price": 25}]';

-- Suite camera links (Staff request): optional live-camera URL per lodging area.
alter table lodging_areas add column if not exists camera_url text;
comment on column lodging_areas.camera_url is 'Optional live-camera link for this suite/area (opens in a new tab from the board).';
