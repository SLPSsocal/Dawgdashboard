-- Daycare days on a boarding stay (Mark, Sep 10): which specific dates the
-- dog joins daycare while boarding. Priced by a per-facility pricing rule
-- (flat_fee whose label contains "daycare"), so each facility sets its own
-- per-day add-on — Don Doggos is $10/day; other facilities may differ.
alter table reservations add column if not exists daycare_dates jsonb not null default '[]'::jsonb;
comment on column reservations.daycare_dates is 'YYYY-MM-DD dates during a boarding stay on which the dog joins daycare (billed per day via the facility''s daycare add-on pricing rule).';

-- Don Doggos daycare add-on for boarding dogs: $10/day. Other facilities add
-- their own rule under Pricing Rules (label must contain "daycare").
insert into pricing_rules (facility_id, reservation_type_id, label, rule_type, threshold, method, amount, effective_date, active)
select t.facility_id, t.id, 'Daycare Add-On (boarding — per day)', 'flat_fee', null, 'dollar', 10, '2026-09-11', true
from reservation_types t
join facilities f on f.id = t.facility_id
where f.name = 'Don Doggos' and t.name = 'Overnight Hotel | Dog Suites'
  and not exists (
    select 1 from pricing_rules p where p.reservation_type_id = t.id and p.label ilike '%daycare%'
  );
