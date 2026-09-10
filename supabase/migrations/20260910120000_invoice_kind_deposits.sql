-- Deposits / advance payments (Gelica, Sep 4; rules from Krishan, Sep 10).
-- A deposit is its own small invoice so it gets a receipt + payment trail;
-- `kind` separates it from checkout invoices and walk-in sales.
-- Deposit statuses: open → paid → applied (used at checkout) | credited (rolled
-- into store credit on cancellation).
alter table public.invoices add column if not exists kind text not null default 'checkout';
create index if not exists invoices_deposit_lookup on public.invoices (reservation_id, kind, status);
