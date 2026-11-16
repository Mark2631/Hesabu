-- Hesabu MVP foundation — DRAFT ONLY.
-- Target: the confirmed Spike Digital Supabase project.
-- This file has not been applied. Inspect the target schema/migrations and review
-- the policies before running it. No operational sales data is created here.

begin;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  legal_name text,
  owner_id uuid not null references auth.users(id) on delete restrict,
  industry text,
  phone text,
  email text,
  county text,
  country text not null default 'Kenya',
  currency text not null default 'KES' check (currency = 'KES'),
  timezone text not null default 'Africa/Nairobi',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_members (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'sales', 'inventory', 'finance')),
  status text not null default 'active' check (status in ('active', 'invited', 'suspended')),
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

create table public.business_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  ai_assistant_enabled boolean not null default false,
  whatsapp_digest_enabled boolean not null default false,
  daily_digest_enabled boolean not null default false,
  whatsapp_recipient_phone text,
  digest_time time not null default '20:00:00',
  timezone text not null default 'Africa/Nairobi',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_business_member(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.business_members bm
    where bm.business_id = target_business_id
      and bm.user_id = auth.uid()
      and bm.status = 'active'
  );
$$;

create or replace function public.has_business_role(target_business_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.business_members bm
    where bm.business_id = target_business_id
      and bm.user_id = auth.uid()
      and bm.status = 'active'
      and bm.role = any(allowed_roles)
  );
$$;

-- A newly authenticated user receives a profile only. Roles and business access
-- are assigned through the business creation/membership flow, not user metadata.
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute procedure public.handle_new_user_profile();

create or replace function public.create_business(
  p_name text,
  p_industry text default null,
  p_phone text default null,
  p_email text default null,
  p_county text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_business_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Business name is required' using errcode = '22023';
  end if;

  insert into public.businesses (
    name, industry, phone, email, county, owner_id
  )
  values (
    trim(p_name),
    nullif(trim(coalesce(p_industry, '')), ''),
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_email, '')), ''),
    nullif(trim(coalesce(p_county, '')), ''),
    v_user_id
  )
  returning id into v_business_id;

  insert into public.business_members (business_id, user_id, role, status)
  values (v_business_id, v_user_id, 'owner', 'active');

  insert into public.business_settings (business_id)
  values (v_business_id);

  return v_business_id;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

create trigger businesses_set_updated_at
before update on public.businesses
for each row execute procedure public.set_updated_at();

create trigger business_settings_set_updated_at
before update on public.business_settings
for each row execute procedure public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.business_settings enable row level security;

create policy "profiles_select_self"
on public.profiles for select to authenticated
using (id = auth.uid());

create policy "profiles_insert_self"
on public.profiles for insert to authenticated
with check (id = auth.uid());

create policy "profiles_update_self"
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "businesses_select_member"
on public.businesses for select to authenticated
using (public.is_business_member(id));

create policy "businesses_update_owner_manager"
on public.businesses for update to authenticated
using (public.has_business_role(id, array['owner', 'manager']))
with check (public.has_business_role(id, array['owner', 'manager']));

create policy "businesses_delete_owner"
on public.businesses for delete to authenticated
using (owner_id = auth.uid());

create policy "business_members_select_member"
on public.business_members for select to authenticated
using (public.is_business_member(business_id));

create policy "business_members_insert_owner_or_manager"
on public.business_members for insert to authenticated
with check (
  public.has_business_role(business_id, array['owner'])
  or (
    public.has_business_role(business_id, array['manager'])
    and role in ('sales', 'inventory', 'finance')
  )
);

create policy "business_members_update_owner"
on public.business_members for update to authenticated
using (public.has_business_role(business_id, array['owner']))
with check (public.has_business_role(business_id, array['owner']));

create policy "business_members_delete_owner_or_manager"
on public.business_members for delete to authenticated
using (
  user_id <> auth.uid()
  and public.has_business_role(business_id, array['owner', 'manager'])
);

create policy "business_settings_select_member"
on public.business_settings for select to authenticated
using (public.is_business_member(business_id));

create policy "business_settings_insert_owner_or_manager"
on public.business_settings for insert to authenticated
with check (public.has_business_role(business_id, array['owner', 'manager']));

create policy "business_settings_update_owner_or_manager"
on public.business_settings for update to authenticated
using (public.has_business_role(business_id, array['owner', 'manager']))
with check (public.has_business_role(business_id, array['owner', 'manager']));

-- Explicit grants complement RLS. Revoke inherited/default access first.
revoke all on public.profiles, public.businesses, public.business_members, public.business_settings
  from anon, public;

grant select, insert, update on public.profiles to authenticated;
-- Business creation must go through create_business() so the owner membership
-- and settings row are created atomically. owner_id is never client-updatable.
grant select, delete on public.businesses to authenticated;
grant update (name, legal_name, industry, phone, email, county, timezone)
  on public.businesses to authenticated;
grant select, insert, update, delete on public.business_members to authenticated;
grant select, insert, update on public.business_settings to authenticated;

revoke all on function public.is_business_member(uuid) from anon, public;
revoke all on function public.has_business_role(uuid, text[]) from anon, public;
revoke all on function public.create_business(text, text, text, text, text) from anon, public;
grant execute on function public.is_business_member(uuid) to authenticated;
grant execute on function public.has_business_role(uuid, text[]) to authenticated;
grant execute on function public.create_business(text, text, text, text, text) to authenticated;

commit;
