begin;

select plan(12);

select has_table('public', 'owner_ledgers', 'the owner ledger table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.owner_ledgers'::regclass), 'row level security is enabled');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-one@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-two@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select results_eq(
  $$insert into public.owner_ledgers(owner_id, data) values ('11111111-1111-4111-8111-111111111111', '{"transactions":[]}'::jsonb) returning owner_id::text$$,
  $$values ('11111111-1111-4111-8111-111111111111'::text)$$,
  'an owner can create their own ledger'
);
select results_eq(
  $$select owner_id::text from public.owner_ledgers where owner_id = '11111111-1111-4111-8111-111111111111'$$,
  $$values ('11111111-1111-4111-8111-111111111111'::text)$$,
  'an owner can read their own ledger'
);
select is_empty(
  $$select owner_id from public.owner_ledgers where owner_id = '22222222-2222-4222-8222-222222222222'$$,
  'an owner cannot read another owner ledger'
);
select is_empty(
  $$update public.owner_ledgers set data = '{"transactions":["tampered"]}' where owner_id = '22222222-2222-4222-8222-222222222222' returning owner_id$$,
  'an owner cannot update another owner ledger'
);
select results_eq(
  $$update public.owner_ledgers set data = '{"transactions":["sale"]}'::jsonb, revision = revision + 1 where owner_id = '11111111-1111-4111-8111-111111111111' returning revision$$,
  $$values (2::bigint)$$,
  'an owner can update their ledger and advance its revision'
);
select throws_ok(
  $$update public.owner_ledgers set owner_id = '22222222-2222-4222-8222-222222222222', revision = revision + 1 where owner_id = '11111111-1111-4111-8111-111111111111'$$,
  '42501', null,
  'an owner cannot reassign a ledger to another owner'
);
select throws_ok(
  $$update public.owner_ledgers set revision = revision + 2 where owner_id = '11111111-1111-4111-8111-111111111111'$$,
  '23514', null,
  'an update cannot skip a ledger revision'
);
reset role;

set local role anon;
select throws_ok($$select * from public.owner_ledgers$$, '42501', null, 'anonymous users cannot read cloud ledgers');
select throws_ok($$insert into public.owner_ledgers(owner_id, data) values ('11111111-1111-4111-8111-111111111111', '{}'::jsonb)$$, '42501', null, 'anonymous users cannot create cloud ledgers');
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select throws_ok($$delete from public.owner_ledgers where owner_id = '11111111-1111-4111-8111-111111111111'$$, '42501', null, 'cloud ledger deletion is not exposed through the client');
reset role;

select * from finish();
rollback;
