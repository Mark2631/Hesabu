begin;
create index if not exists business_invitations_accepted_user_id_idx
  on public.business_invitations(accepted_user_id);
create index if not exists business_invitations_created_by_idx
  on public.business_invitations(created_by);
commit;
