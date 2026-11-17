\set ON_ERROR_STOP on

-- Two independent Auth users exercise real RLS under the authenticated role.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'alpha@example.test', now(), '{"display_name":"Alpha Owner"}'),
  ('22222222-2222-4222-8222-222222222222', 'beta@example.test', now(), '{"display_name":"Beta Owner"}');

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);

select public.create_business(
  'Alpha Test Shop', 'Retail', '0711000001', 'alpha@example.test', 'Meru'
) as alpha_business_id \gset

select public.create_product(
  :'alpha_business_id'::uuid,
  'TST-001',
  'Test rice',
  null,
  'packet',
  10,
  2,
  60,
  100,
  null
) as alpha_product_id \gset

insert into public.suppliers (
  business_id, name, phone, opening_balance
) values (
  :'alpha_business_id'::uuid, 'Test supplier', '0711000002', 0
) returning id as alpha_supplier_id \gset

select public.post_sale(
  :'alpha_business_id'::uuid,
  'Walk-in customer',
  null,
  null,
  0,
  'cash',
  'manual',
  jsonb_build_array(jsonb_build_object(
    'product_id', :'alpha_product_id'::uuid,
    'quantity', 2
  ))
) as alpha_invoice_id \gset

select public.post_payment(
  :'alpha_business_id'::uuid,
  :'alpha_invoice_id'::uuid,
  200,
  'cash',
  'PAY-TEST-001',
  'manual',
  null,
  'IDEMP-TEST-001',
  null
) as alpha_payment_id \gset

select public.post_payment(
  :'alpha_business_id'::uuid,
  :'alpha_invoice_id'::uuid,
  200,
  'cash',
  'PAY-TEST-001',
  'manual',
  null,
  'IDEMP-TEST-001',
  null
) as alpha_duplicate_payment_id \gset

select 1 / case
  when :'alpha_payment_id' = :'alpha_duplicate_payment_id' then 1
  else 0
end;

select public.post_sale_with_payment(
  :'alpha_business_id'::uuid,
  'Atomic counter customer',
  null,
  null,
  0,
  'cash',
  'manual',
  jsonb_build_array(jsonb_build_object(
    'product_id', :'alpha_product_id'::uuid,
    'quantity', 1
  ))
) as alpha_atomic_invoice_id \\gset

select 1 / case
  when (select amount_paid from public.invoices where id = :'alpha_atomic_invoice_id'::uuid) = 100
   and exists (
     select 1 from public.payments
     where invoice_id = :'alpha_atomic_invoice_id'::uuid
       and amount = 100 and status = 'succeeded' and channel = 'cash'
   )
  then 1 else 0
end;

select public.post_expense(
  :'alpha_business_id'::uuid,
  'Rent',
  'Migration test rent',
  50,
  'cash',
  (now() at time zone 'Africa/Nairobi')::date,
  'EXP-TEST-001'
);

select public.create_purchase_order(
  :'alpha_business_id'::uuid,
  :'alpha_supplier_id'::uuid,
  null,
  jsonb_build_array(jsonb_build_object(
    'product_id', :'alpha_product_id'::uuid,
    'quantity', 5,
    'unit_cost', 70
  )),
  'Migration test order'
) as alpha_purchase_order_id \gset

select public.post_purchase_receipt(
  :'alpha_business_id'::uuid,
  :'alpha_purchase_order_id'::uuid,
  jsonb_build_array(jsonb_build_object(
    'product_id', :'alpha_product_id'::uuid,
    'quantity', 3
  )),
  'Partial test receipt'
);

select public.post_supplier_payment(
  :'alpha_business_id'::uuid,
  :'alpha_supplier_id'::uuid,
  20,
  'cash',
  'SUP-TEST-001',
  'Test settlement'
);

select public.post_stock_adjustment(
  :'alpha_business_id'::uuid,
  :'alpha_product_id'::uuid,
  -1,
  'Test stock-count correction'
);

select 1 / case
  when (public.get_daily_digest(:'alpha_business_id'::uuid, null)->>'sales_total')::numeric = 300
   and (public.get_daily_digest(:'alpha_business_id'::uuid, null)->>'payments_received')::numeric = 300
   and (public.get_daily_digest(:'alpha_business_id'::uuid, null)->>'expenses_total')::numeric = 50
   and (public.get_daily_digest(:'alpha_business_id'::uuid, null)->>'units_sold')::numeric = 3
  then 1 else 0
end;

select 1 / case
  when (select amount_paid from public.invoices where id = :'alpha_invoice_id'::uuid) = 200
   and (select amount_paid from public.invoices where id = :'alpha_atomic_invoice_id'::uuid) = 100
   and (select quantity_on_hand from public.products where id = :'alpha_product_id'::uuid) = 9
   and (select current_balance from public.suppliers where id = :'alpha_supplier_id'::uuid) = 190
  then 1 else 0
end;

select 1 / case
  when not exists (
    select journal_entry_id
    from public.journal_lines
    where business_id = :'alpha_business_id'::uuid
    group by journal_entry_id
    having round(sum(debit) - sum(credit), 2) <> 0
  )
  then 1 else 0
end;

-- An excessive sale must fail before posting any invoice or stock mutation.
do $$
declare
  v_business_id uuid;
  v_product_id uuid;
  v_invoice_count bigint;
  v_quantity numeric(14,3);
begin
  select id into v_business_id from public.businesses where name = 'Alpha Test Shop';
  select id into v_product_id from public.products where business_id = v_business_id and sku = 'TST-001';
  select count(*) into v_invoice_count from public.invoices where business_id = v_business_id;
  select quantity_on_hand into v_quantity from public.products where id = v_product_id;

  begin
    perform public.post_sale(
      v_business_id, 'Invalid sale', null, null, 0, 'cash', 'manual',
      jsonb_build_array(jsonb_build_object('product_id', v_product_id, 'quantity', 999))
    );
    raise exception 'An over-stock sale unexpectedly succeeded';
  exception when sqlstate '22023' then
    null;
  end;

  if (select count(*) from public.invoices where business_id = v_business_id) <> v_invoice_count then
    raise exception 'A failed sale left a partial invoice behind';
  end if;
  if (select quantity_on_hand from public.products where id = v_product_id) <> v_quantity then
    raise exception 'A failed sale changed stock';
  end if;
end;
$$;

-- Owners cannot change their own role or bypass the append-only journal.
do $$
declare
  v_business_id uuid;
  v_rows bigint;
begin
  select id into v_business_id from public.businesses where name = 'Alpha Test Shop';
  update public.business_members
  set role = 'manager'
  where business_id = v_business_id and user_id = auth.uid();
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'Owner changed their own membership role';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);

select public.accept_business_invitation(:'alpha_invite_token'::uuid) as accepted_alpha_business_id \\gset

select 1 / case
  when exists (
    select 1 from public.business_members
    where business_id = :'alpha_business_id'::uuid
      and user_id = '22222222-2222-4222-8222-222222222222'
      and role = 'sales' and status = 'active'
  ) then 1 else 0
end;

select public.create_business(
  'Beta Test Shop', 'Services', '0711000003', 'beta@example.test', 'Meru'
) as beta_business_id \gset

select public.create_product(
  :'beta_business_id'::uuid,
  'TST-002',
  'Beta-only product',
  null,
  'unit',
  5,
  1,
  10,
  20,
  null
);

-- Switch back to Alpha: Beta's business and product rows must be invisible.
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);

select 1 / case
  when exists (
    select 1 from public.get_business_team(:'alpha_business_id'::uuid)
    where user_id = '22222222-2222-4222-8222-222222222222' and role = 'sales'
  )
  then 1 else 0
end;

select 1 / case
  when exists (
    select 1 from public.list_business_invitations(:'alpha_business_id'::uuid)
    where invitee_email = 'beta@example.test' and invitation_status = 'accepted'
  )
  then 1 else 0
end;

select 1 / case
  when not exists (
    select 1 from public.businesses where id = :'beta_business_id'::uuid
  )
  then 1 else 0
end;

select 1 / case
  when not exists (
    select 1 from public.products where business_id = :'beta_business_id'::uuid
  )
  then 1 else 0
end;

select 1 / case
  when not app_private.has_business_role(:'beta_business_id'::uuid, array['owner'])
  then 1 else 0
end;

-- Client users cannot bypass stock movement history with direct quantity edits.
do $$
declare
  v_business_id uuid;
  v_product_id uuid;
  v_rows bigint;
begin
  select id into v_business_id from public.businesses where name = 'Alpha Test Shop';
  select id into v_product_id from public.products where business_id = v_business_id and sku = 'TST-001';
  begin
    update public.products set quantity_on_hand = 999 where id = v_product_id;
    get diagnostics v_rows = row_count;
    if v_rows <> 0 then
      raise exception 'Direct stock quantity update unexpectedly succeeded';
    end if;
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

reset role;
