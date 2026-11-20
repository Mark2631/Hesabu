begin;

-- Team email addresses are management-only data. Regular members can read
-- their own role via the business_members RLS policy but cannot enumerate
-- their colleagues' email addresses through the SECURITY DEFINER roster RPC.
create or replace function app_private.get_business_team(p_business_id uuid)
returns table (
  user_id uuid, display_name text, email text, role text,
  status text, created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app_private.has_business_role(p_business_id, array['owner','manager']::text[]) then
    raise exception 'Only an owner or manager can view the business team' using errcode = '42501';
  end if;
  return query
  select bm.user_id,
         coalesce(nullif(trim(p.display_name), ''), 'Team member'),
         coalesce(u.email, ''),
         bm.role, bm.status, bm.created_at
  from public.business_members bm
  join auth.users u on u.id = bm.user_id
  left join public.profiles p on p.id = bm.user_id
  where bm.business_id = p_business_id
  order by case when bm.role = 'owner' then 0 else 1 end, bm.created_at asc;
end;
$$;

notify pgrst, 'reload schema';
commit;
