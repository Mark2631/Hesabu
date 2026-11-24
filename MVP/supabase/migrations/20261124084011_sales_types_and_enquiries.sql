-- Add explicit sale intent to invoices. Existing invoices remain walk-in records.
begin;

alter table public.invoices
  add column if not exists sale_type text not null default 'walk_in';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.invoices'::regclass
      and conname = 'invoices_sale_type_check'
  ) then
    alter table public.invoices
      add constraint invoices_sale_type_check
      check (sale_type in ('walk_in', 'pay_on_delivery', 'credit', 'enquiry'));
  end if;
end;
$$;

-- Enquiries are draft quotes: no stock reservation, payment, cash movement or journal entry.
create or replace function app_private.save_sale_enquiry(
  p_business_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_due_date date,
  p_discount numeric,
  p_source text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_product public.products%rowtype;
  v_product_id uuid;
  v_quantity numeric(14,3);
  v_subtotal numeric(14,2) := 0;
  v_line_total numeric(14,2);
  v_discount numeric(14,2) := coalesce(p_discount, 0);
  v_invoice_total numeric(14,2);
  v_invoice_id uuid := gen_random_uuid();
  v_invoice_number text;
  v_sequence bigint;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not app_private.has_business_role(p_business_id, array['owner', 'manager', 'sales']) then
    raise exception 'You do not have permission to save enquiries for this business' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 100 then
    raise exception 'Add between 1 and 100 enquiry items' using errcode = '22023';
  end if;
  if p_source is null or p_source not in ('hesabu', 'website', 'pos', 'manual', 'api') then
    raise exception 'Unsupported enquiry source' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) e
    group by (e ->> 'product_id')
    having count(*) > 1
  ) then
    raise exception 'Each product must appear once in an enquiry' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::numeric;
    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Enquiry quantities must be greater than zero' using errcode = '22023';
    end if;
    select * into v_product
    from public.products
    where id = v_product_id
      and business_id = p_business_id
      and is_active = true;
    if not found then
      raise exception 'An enquiry item is not available in this business' using errcode = '22023';
    end if;
    v_line_total := round(v_quantity * v_product.selling_price, 2);
    v_subtotal := v_subtotal + v_line_total;
  end loop;

  v_subtotal := round(v_subtotal, 2);
  if v_discount < 0 or v_discount > v_subtotal then
    raise exception 'Discount must be between zero and the enquiry subtotal' using errcode = '22023';
  end if;
  v_discount := round(v_discount, 2);
  v_invoice_total := round(v_subtotal - v_discount, 2);

  update public.businesses
  set next_invoice_number = next_invoice_number + 1
  where id = p_business_id
  returning next_invoice_number - 1 into v_sequence;
  if not found then
    raise exception 'Business not found' using errcode = '22023';
  end if;
  v_invoice_number := 'HS-' || lpad(v_sequence::text, 6, '0');

  insert into public.invoices (
    id, business_id, invoice_number, customer_name, customer_phone,
    issue_date, due_date, subtotal, discount_amount, total_amount,
    amount_paid, payment_channel, status, source, sale_type, created_by
  ) values (
    v_invoice_id, p_business_id, v_invoice_number,
    coalesce(nullif(trim(p_customer_name), ''), 'Prospective customer'),
    nullif(trim(coalesce(p_customer_phone, '')), ''),
    (now() at time zone 'Africa/Nairobi')::date, p_due_date,
    v_subtotal, v_discount, v_invoice_total, 0, 'credit',
    'draft', p_source, 'enquiry', v_user_id
  );

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::numeric;
    select * into v_product
    from public.products
    where id = v_product_id and business_id = p_business_id;
    v_line_total := round(v_quantity * v_product.selling_price, 2);

    insert into public.invoice_items (
      business_id, invoice_id, product_id, product_name, sku_snapshot,
      quantity, unit_price, unit_cost, line_total
    ) values (
      p_business_id, v_invoice_id, v_product.id, v_product.name, v_product.sku,
      v_quantity, v_product.selling_price, v_product.cost_price, v_line_total
    );
  end loop;

  return v_invoice_id;
end;
$$;

-- One entry point for counter sales, pay-on-delivery, customer credit and enquiries.
create or replace function app_private.post_sale_with_type(
  p_business_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_due_date date,
  p_discount numeric,
  p_payment_channel text,
  p_source text,
  p_items jsonb,
  p_sale_type text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice_id uuid;
begin
  if p_sale_type is null or p_sale_type not in ('walk_in', 'pay_on_delivery', 'credit', 'enquiry') then
    raise exception 'Choose a supported transaction type' using errcode = '22023';
  end if;

  if p_sale_type = 'enquiry' then
    return app_private.save_sale_enquiry(
      p_business_id, p_customer_name, p_customer_phone, null,
      p_discount, p_source, p_items
    );
  end if;

  if p_sale_type in ('pay_on_delivery', 'credit') and p_payment_channel <> 'credit' then
    raise exception 'Pay-on-delivery and customer-credit sales must remain unpaid until money is received' using errcode = '22023';
  end if;
  if p_sale_type = 'walk_in' and p_payment_channel = 'credit' then
    raise exception 'Choose customer credit or pay on delivery for an unpaid sale' using errcode = '22023';
  end if;

  v_invoice_id := app_private.post_sale_with_payment(
    p_business_id, p_customer_name, p_customer_phone, p_due_date,
    p_discount, p_payment_channel, p_source, p_items
  );

  update public.invoices
  set sale_type = p_sale_type
  where id = v_invoice_id and business_id = p_business_id;

  return v_invoice_id;
end;
$$;

create or replace function public.post_sale_with_type(
  p_business_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_due_date date,
  p_discount numeric,
  p_payment_channel text,
  p_source text,
  p_items jsonb,
  p_sale_type text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select app_private.post_sale_with_type($1,$2,$3,$4,$5,$6,$7,$8,$9);
$$;

revoke all on function app_private.save_sale_enquiry(uuid,text,text,date,numeric,text,jsonb) from public, anon;
revoke all on function app_private.post_sale_with_type(uuid,text,text,date,numeric,text,text,jsonb,text) from public, anon;
revoke all on function public.post_sale_with_type(uuid,text,text,date,numeric,text,text,jsonb,text) from public, anon;

grant execute on function app_private.save_sale_enquiry(uuid,text,text,date,numeric,text,jsonb) to authenticated;
grant execute on function app_private.post_sale_with_type(uuid,text,text,date,numeric,text,text,jsonb,text) to authenticated;
grant execute on function public.post_sale_with_type(uuid,text,text,date,numeric,text,text,jsonb,text) to authenticated;

notify pgrst, 'reload schema';

commit;
