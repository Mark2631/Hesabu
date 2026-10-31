-- A single versioned snapshot per owner keeps the first cloud backup path
-- atomic. It is deliberately not a shared/team ledger model yet.
create table if not exists public.owner_ledgers (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.owner_ledgers enable row level security;
revoke all on table public.owner_ledgers from public, anon, authenticated;
grant select, insert, update on table public.owner_ledgers to authenticated;

create policy "Owners can read their cloud ledger"
  on public.owner_ledgers for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Owners can create their cloud ledger"
  on public.owner_ledgers for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "Owners can update their cloud ledger"
  on public.owner_ledgers for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

comment on table public.owner_ledgers is
  'HESABU owner-only cloud backup snapshot. Revision checks prevent silent last-write-wins overwrites.';

create or replace function public.bump_owner_ledger_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.revision <> old.revision + 1 then
    raise exception 'Ledger revision must increase by exactly one.' using errcode = '23514';
  end if;
  new.created_at := old.created_at;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function public.bump_owner_ledger_revision() from public, anon, authenticated;

create trigger owner_ledgers_revision_guard
  before update on public.owner_ledgers
  for each row execute function public.bump_owner_ledger_revision();
