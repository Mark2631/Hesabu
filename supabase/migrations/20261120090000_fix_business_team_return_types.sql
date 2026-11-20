-- Keep the team RPC return types aligned with its declared TABLE signature.
-- auth.users.email is varchar and business_members.role/status may be enums;
-- explicit casts prevent Postgres 42804 errors during workspace hydration.
create or replace function app_private.get_business_team(p_business_id uuid)
returns table(
  user_id uuid,
  display_name text,
  email text,
  role text,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not app_private.has_business_role(p_business_id, array['owner','manager']::text[]) then
    raise exception 'Only an owner or manager can view the business team' using errcode = '42501';
  end if;

  return query
  select
    bm.user_id,
    coalesce(nullif(trim(p.display_name), ''), 'Team member')::text,
    coalesce(u.email::text, ''),
    bm.role::text,
    bm.status::text,
    bm.created_at
  from public.business_members bm
  join auth.users u on u.id = bm.user_id
  left join public.profiles p on p.id = bm.user_id
  where bm.business_id = p_business_id
  order by case when bm.role = 'owner' then 0 else 1 end, bm.created_at asc;
end;
$function$;
