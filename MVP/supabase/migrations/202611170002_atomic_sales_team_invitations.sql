begin;

create table public.business_invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  invitee_name text not null,
  invitee_email text not null,
  role text not null check (role in ('manager','sales','inventory','finance')),
  invite_token uuid not null unique default gen_random_uuid(),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_user_id uuid references auth.users(id),
  revoked_at timestamptz,
  check (length(trim(invitee_name)) > 0),
  check (invitee_email = lower(trim(invitee_email)))
);
create unique index business_invitations_one_open_email_idx
  on public.business_invitations (business_id, invitee_email)
  where accepted_at is null and revoked_at is null;
create index business_invitations_business_created_idx
  on public.business_invitations (business_id, created_at desc);

alter table public.business_invitations enable row level security;
revoke all on public.business_invitations from public, anon, authenticated;
grant select on public.business_invitations to authenticated;
create policy business_invitations_select_management
  on public.business_invitations
  for select to authenticated
  using (app_private.has_business_role(business_id, array['owner','manager']::text[]));

create or replace function app_private.post_sale_with_payment(
  p_business_id uuid, p_customer_name text, p_customer_phone text, p_due_date date,
  p_discount numeric, p_payment_channel text, p_source text, p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice_id uuid;
  v_total numeric(14,2);
  v_phone text;
begin
  v_invoice_id := app_private.post_sale(
    p_business_id, p_customer_name, p_customer_phone, p_due_date,
    p_discount, p_payment_channel, p_source, p_items
  );
  if p_payment_channel <> 'credit' then
    select i.total_amount, i.customer_phone
    into v_total, v_phone
    from public.invoices i
    where i.id = v_invoice_id and i.business_id = p_business_id;

    if v_total is null or v_total <= 0 then
      raise exception 'A completed cash sale must have a positive total' using errcode = '22023';
    end if;

    perform app_private.post_payment(
      p_business_id, v_invoice_id, v_total, p_payment_channel, null,
      'manual', v_phone, 'sale:' || v_invoice_id::text, 'Collected at point of sale'
    );
  end if;
  return v_invoice_id;
end;
$$;

create or replace function app_private.create_business_invitation(
  p_business_id uuid, p_invitee_name text, p_invitee_email text, p_role text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_actor_role text;
  v_email text := lower(trim(coalesce(p_invitee_email,'')));
  v_token uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select bm.role into v_actor_role
  from public.business_members bm
  where bm.business_id = p_business_id and bm.user_id = v_user_id and bm.status = 'active';

  if v_actor_role is null or v_actor_role not in ('owner','manager') then
    raise exception 'Only an owner or manager can invite team members' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('manager','sales','inventory','finance') then
    raise exception 'Choose a valid team responsibility' using errcode = '22023';
  end if;
  if v_actor_role = 'manager' and p_role not in ('sales','inventory','finance') then
    raise exception 'Managers can invite Sales, Inventory or Finance members only' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_invitee_name,''))) = 0
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid name and email address' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text || ':' || v_email, 0));

  update public.business_invitations bi
  set revoked_at = now()
  where bi.business_id = p_business_id and bi.invitee_email = v_email
    and bi.accepted_at is null and bi.revoked_at is null and bi.expires_at <= now();

  if exists (
    select 1 from public.business_invitations bi
    where bi.business_id = p_business_id and bi.invitee_email = v_email
      and bi.accepted_at is null and bi.revoked_at is null and bi.expires_at > now()
  ) then
    raise exception 'An active invitation already exists for this email' using errcode = '23505';
  end if;

  if exists (
    select 1 from public.business_members bm
    join auth.users u on u.id = bm.user_id
    where bm.business_id = p_business_id and lower(u.email) = v_email and bm.status = 'active'
  ) then
    raise exception 'This person is already an active member of the business' using errcode = '23505';
  end if;

  insert into public.business_invitations (business_id, invitee_name, invitee_email, role, created_by)
  values (p_business_id, trim(p_invitee_name), v_email, p_role, v_user_id)
  returning invite_token into v_token;
  return v_token;
end;
$$;

create or replace function app_private.accept_business_invitation(p_invite_token uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_invitation public.business_invitations%rowtype;
begin
  if v_user_id is null then
    raise exception 'Sign in to accept this invitation' using errcode = '28000';
  end if;

  select lower(u.email) into v_user_email
  from auth.users u
  where u.id = v_user_id and u.email_confirmed_at is not null;

  if v_user_email is null then
    raise exception 'Verify your email address before accepting a business invitation' using errcode = '42501';
  end if;

  select bi.* into v_invitation
  from public.business_invitations bi
  where bi.invite_token = p_invite_token
  for update;

  if not found then
    raise exception 'This invitation link is invalid' using errcode = '22023';
  end if;
  if v_invitation.accepted_at is not null then
    if v_invitation.accepted_user_id = v_user_id then return v_invitation.business_id; end if;
    raise exception 'This invitation has already been accepted' using errcode = '23505';
  end if;
  if v_invitation.revoked_at is not null or v_invitation.expires_at <= now() then
    raise exception 'This invitation has expired or has been revoked' using errcode = '22023';
  end if;
  if v_invitation.invitee_email <> v_user_email then
    raise exception 'Sign in with the email address this invitation was sent to' using errcode = '42501';
  end if;

  insert into public.business_members (business_id, user_id, role, status)
  values (v_invitation.business_id, v_user_id, v_invitation.role, 'active')
  on conflict (business_id, user_id) do update
    set role = excluded.role, status = 'active';

  update public.profiles p
  set display_name = coalesce(nullif(trim(p.display_name), ''), v_invitation.invitee_name)
  where p.id = v_user_id;

  update public.business_invitations bi
  set accepted_at = now(), accepted_user_id = v_user_id
  where bi.id = v_invitation.id;

  return v_invitation.business_id;
end;
$$;

create or replace function app_private.update_business_member(
  p_business_id uuid, p_user_id uuid, p_role text, p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_target_role text;
begin
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select bm.role into v_actor_role
  from public.business_members bm
  where bm.business_id = p_business_id and bm.user_id = v_actor_id and bm.status = 'active';

  if v_actor_role is null or v_actor_role not in ('owner','manager') then
    raise exception 'Only an owner or manager can manage team members' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('manager','sales','inventory','finance')
     or p_status is null or p_status not in ('active','suspended') then
    raise exception 'Choose a valid role and membership status' using errcode = '22023';
  end if;

  select bm.role into v_target_role
  from public.business_members bm
  where bm.business_id = p_business_id and bm.user_id = p_user_id
  for update;

  if v_target_role is null then
    raise exception 'This team member was not found in the business' using errcode = '22023';
  end if;
  if v_target_role = 'owner' then
    raise exception 'The business owner role cannot be changed or suspended' using errcode = '42501';
  end if;
  if v_actor_role = 'manager' and (
    v_target_role = 'manager' or p_user_id = v_actor_id
    or p_role not in ('sales','inventory','finance')
  ) then
    raise exception 'Managers can manage Sales, Inventory and Finance members only' using errcode = '42501';
  end if;

  update public.business_members bm
  set role = p_role, status = p_status
  where bm.business_id = p_business_id and bm.user_id = p_user_id;
end;
$$;

create or replace function app_private.revoke_business_invitation(p_business_id uuid, p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app_private.has_business_role(p_business_id, array['owner','manager']::text[]) then
    raise exception 'Only an owner or manager can revoke invitations' using errcode = '42501';
  end if;
  update public.business_invitations bi
  set revoked_at = now()
  where bi.id = p_invitation_id and bi.business_id = p_business_id
    and bi.accepted_at is null and bi.revoked_at is null;
end;
$$;

create or replace function app_private.get_business_team(p_business_id uuid)
returns table (user_id uuid, display_name text, email text, role text, status text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app_private.is_business_member(p_business_id) then
    raise exception 'You do not have access to this business team' using errcode = '42501';
  end if;
  return query
  select bm.user_id, coalesce(nullif(trim(p.display_name), ''), 'Team member'),
    coalesce(u.email, ''), bm.role, bm.status, bm.created_at
  from public.business_members bm
  join auth.users u on u.id = bm.user_id
  left join public.profiles p on p.id = bm.user_id
  where bm.business_id = p_business_id
  order by case when bm.role = 'owner' then 0 else 1 end, bm.created_at asc;
end;
$$;

create or replace function app_private.list_business_invitations(p_business_id uuid)
returns table (
  id uuid, invitee_name text, invitee_email text, role text, invitation_status text,
  invite_token uuid, created_at timestamptz, expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app_private.has_business_role(p_business_id, array['owner','manager']::text[]) then return; end if;
  return query
  select bi.id, bi.invitee_name, bi.invitee_email, bi.role,
    case when bi.accepted_at is not null then 'accepted'
         when bi.revoked_at is not null then 'revoked'
         when bi.expires_at <= now() then 'expired'
         else 'pending' end,
    bi.invite_token, bi.created_at, bi.expires_at
  from public.business_invitations bi
  where bi.business_id = p_business_id
  order by bi.created_at desc;
end;
$$;

create or replace function public.post_sale_with_payment(
  p_business_id uuid, p_customer_name text, p_customer_phone text, p_due_date date,
  p_discount numeric, p_payment_channel text, p_source text, p_items jsonb
)
returns uuid language sql security invoker set search_path = ''
as $$ select app_private.post_sale_with_payment($1,$2,$3,$4,$5,$6,$7,$8); $$;
create or replace function public.create_business_invitation(
  p_business_id uuid, p_invitee_name text, p_invitee_email text, p_role text
)
returns uuid language sql security invoker set search_path = ''
as $$ select app_private.create_business_invitation($1,$2,$3,$4); $$;
create or replace function public.accept_business_invitation(p_invite_token uuid)
returns uuid language sql security invoker set search_path = ''
as $$ select app_private.accept_business_invitation($1); $$;
create or replace function public.update_business_member(
  p_business_id uuid, p_user_id uuid, p_role text, p_status text
)
returns void language sql security invoker set search_path = ''
as $$ select app_private.update_business_member($1,$2,$3,$4); $$;
create or replace function public.revoke_business_invitation(p_business_id uuid, p_invitation_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select app_private.revoke_business_invitation($1,$2); $$;
create or replace function public.get_business_team(p_business_id uuid)
returns table (user_id uuid, display_name text, email text, role text, status text, created_at timestamptz)
language sql security invoker set search_path = ''
as $$ select * from app_private.get_business_team($1); $$;
create or replace function public.list_business_invitations(p_business_id uuid)
returns table (
  id uuid, invitee_name text, invitee_email text, role text, invitation_status text,
  invite_token uuid, created_at timestamptz, expires_at timestamptz
)
language sql security invoker set search_path = ''
as $$ select * from app_private.list_business_invitations($1); $$;

revoke all on function app_private.post_sale_with_payment(uuid,text,text,date,numeric,text,text,jsonb) from public, anon;
revoke all on function app_private.create_business_invitation(uuid,text,text,text) from public, anon;
revoke all on function app_private.accept_business_invitation(uuid) from public, anon;
revoke all on function app_private.update_business_member(uuid,uuid,text,text) from public, anon;
revoke all on function app_private.revoke_business_invitation(uuid,uuid) from public, anon;
revoke all on function app_private.get_business_team(uuid) from public, anon;
revoke all on function app_private.list_business_invitations(uuid) from public, anon;

revoke all on function public.post_sale_with_payment(uuid,text,text,date,numeric,text,text,jsonb) from public, anon;
revoke all on function public.create_business_invitation(uuid,text,text,text) from public, anon;
revoke all on function public.accept_business_invitation(uuid) from public, anon;
revoke all on function public.update_business_member(uuid,uuid,text,text) from public, anon;
revoke all on function public.revoke_business_invitation(uuid,uuid) from public, anon;
revoke all on function public.get_business_team(uuid) from public, anon;
revoke all on function public.list_business_invitations(uuid) from public, anon;

grant execute on function app_private.post_sale_with_payment(uuid,text,text,date,numeric,text,text,jsonb) to authenticated;
grant execute on function app_private.create_business_invitation(uuid,text,text,text) to authenticated;
grant execute on function app_private.accept_business_invitation(uuid) to authenticated;
grant execute on function app_private.update_business_member(uuid,uuid,text,text) to authenticated;
grant execute on function app_private.revoke_business_invitation(uuid,uuid) to authenticated;
grant execute on function app_private.get_business_team(uuid) to authenticated;
grant execute on function app_private.list_business_invitations(uuid) to authenticated;

grant execute on function public.post_sale_with_payment(uuid,text,text,date,numeric,text,text,jsonb) to authenticated;
grant execute on function public.create_business_invitation(uuid,text,text,text) to authenticated;
grant execute on function public.accept_business_invitation(uuid) to authenticated;
grant execute on function public.update_business_member(uuid,uuid,text,text) to authenticated;
grant execute on function public.revoke_business_invitation(uuid,uuid) to authenticated;
grant execute on function public.get_business_team(uuid) to authenticated;
grant execute on function public.list_business_invitations(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;