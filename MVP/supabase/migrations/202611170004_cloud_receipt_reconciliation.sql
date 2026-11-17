begin;

drop policy if exists unmatched_receipts_select_finance on public.unmatched_receipts;
create policy unmatched_receipts_select_finance_sales
on public.unmatched_receipts
for select to authenticated
using (app_private.has_business_role(
  business_id, array['owner','manager','sales','finance']::text[]
));

create or replace function app_private.post_unmatched_receipt(
  p_business_id uuid, p_reference text, p_payer_name text,
  p_payer_phone text, p_amount numeric, p_rail text
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_reference text := upper(trim(coalesce(p_reference, '')));
  v_receipt_id uuid := gen_random_uuid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not app_private.has_business_role(p_business_id, array['owner','manager','sales','finance']::text[]) then
    raise exception 'You do not have permission to record receipts for this business' using errcode = '42501';
  end if;
  if v_reference = '' or length(v_reference) > 100 then
    raise exception 'Enter a valid M-Pesa or bank receipt reference' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Receipt amount must be greater than zero' using errcode = '22023';
  end if;
  if p_rail is null or p_rail not in ('till_paybill','pochi','send_money','bank_transfer','manual_mpesa') then
    raise exception 'Choose a supported receipt source' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text || ':receipt:' || v_reference, 0));

  if exists (
    select 1 from public.unmatched_receipts r
    where r.business_id = p_business_id and upper(r.reference) = v_reference
  ) or exists (
    select 1 from public.payments p
    where p.business_id = p_business_id and upper(coalesce(p.provider_reference, '')) = v_reference
  ) then
    raise exception 'This receipt reference has already been recorded' using errcode = '23505';
  end if;

  insert into public.unmatched_receipts (
    id, business_id, reference, payer_name, payer_phone, amount,
    rail, source, status, received_at, created_by
  ) values (
    v_receipt_id, p_business_id, v_reference,
    nullif(trim(coalesce(p_payer_name, '')), ''),
    nullif(trim(coalesce(p_payer_phone, '')), ''),
    round(p_amount, 2), p_rail, 'manual', 'unmatched', now(), v_user_id
  );

  insert into public.integration_events (
    business_id, event_type, source, status, reference, detail
  ) values (
    p_business_id, 'receipt.unmatched', 'Manual receipt entry', 'pending',
    v_reference, 'A receipt of KSh ' || to_char(round(p_amount, 2), 'FM999999999990.00') ||
      ' was recorded and is awaiting invoice allocation.'
  );

  return v_receipt_id;
end;
$$;

create or replace function app_private.match_unmatched_receipt(
  p_business_id uuid, p_receipt_id uuid, p_invoice_id uuid
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_receipt public.unmatched_receipts%rowtype;
  v_invoice public.invoices%rowtype;
  v_payment_id uuid;
  v_channel text;
  v_idempotency_key text;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not app_private.has_business_role(p_business_id, array['owner','manager','sales','finance']::text[]) then
    raise exception 'You do not have permission to reconcile receipts for this business' using errcode = '42501';
  end if;

  select r.* into v_receipt
  from public.unmatched_receipts r
  where r.id = p_receipt_id and r.business_id = p_business_id
  for update;
  if not found then
    raise exception 'Receipt not found in this business' using errcode = '22023';
  end if;

  v_idempotency_key := 'receipt:' || v_receipt.id::text;
  if v_receipt.status = 'matched' then
    if v_receipt.matched_invoice_id <> p_invoice_id then
      raise exception 'This receipt has already been allocated to another invoice' using errcode = '23505';
    end if;
    select p.id into v_payment_id
    from public.payments p
    where p.business_id = p_business_id and p.idempotency_key = v_idempotency_key;
    if v_payment_id is not null then return v_payment_id; end if;
    raise exception 'Receipt is marked as matched but its payment record is missing. Contact support.' using errcode = '55000';
  end if;
  if v_receipt.status <> 'unmatched' then
    raise exception 'This receipt is no longer available for matching' using errcode = '22023';
  end if;

  select i.* into v_invoice
  from public.invoices i
  where i.id = p_invoice_id and i.business_id = p_business_id and i.status <> 'void'
  for update;
  if not found then
    raise exception 'Choose an active invoice from this business' using errcode = '22023';
  end if;

  v_channel := case when v_receipt.rail = 'bank_transfer' then 'bank' else 'mpesa' end;
  v_payment_id := app_private.post_payment(
    p_business_id, p_invoice_id, v_receipt.amount, v_channel,
    v_receipt.reference, 'reconciliation', v_receipt.payer_phone,
    v_idempotency_key,
    'Manually matched from receipt queue' ||
      case when v_receipt.payer_name is not null then ' · ' || v_receipt.payer_name else '' end
  );

  update public.unmatched_receipts
  set status = 'matched', matched_invoice_id = p_invoice_id
  where id = p_receipt_id and business_id = p_business_id;

  insert into public.integration_events (
    business_id, event_type, source, status, reference, detail
  ) values (
    p_business_id, 'payment.reconciled', 'Manual receipt reconciliation', 'delivered',
    v_receipt.reference,
    'Receipt of KSh ' || to_char(v_receipt.amount, 'FM999999999990.00') ||
      ' matched to invoice ' || v_invoice.invoice_number ||
      '. Any amount above the outstanding invoice balance was retained as customer credit.'
  );

  return v_payment_id;
end;
$$;

create or replace function public.post_unmatched_receipt(
  p_business_id uuid, p_reference text, p_payer_name text,
  p_payer_phone text, p_amount numeric, p_rail text
)
returns uuid language sql security invoker set search_path = ''
as $$ select app_private.post_unmatched_receipt($1,$2,$3,$4,$5,$6); $$;

create or replace function public.match_unmatched_receipt(
  p_business_id uuid, p_receipt_id uuid, p_invoice_id uuid
)
returns uuid language sql security invoker set search_path = ''
as $$ select app_private.match_unmatched_receipt($1,$2,$3); $$;

revoke all on function app_private.post_unmatched_receipt(uuid,text,text,text,numeric,text) from public, anon;
revoke all on function app_private.match_unmatched_receipt(uuid,uuid,uuid) from public, anon;
revoke all on function public.post_unmatched_receipt(uuid,text,text,text,numeric,text) from public, anon;
revoke all on function public.match_unmatched_receipt(uuid,uuid,uuid) from public, anon;

grant execute on function app_private.post_unmatched_receipt(uuid,text,text,text,numeric,text) to authenticated;
grant execute on function app_private.match_unmatched_receipt(uuid,uuid,uuid) to authenticated;
grant execute on function public.post_unmatched_receipt(uuid,text,text,text,numeric,text) to authenticated;
grant execute on function public.match_unmatched_receipt(uuid,uuid,uuid) to authenticated;

notify pgrst, 'reload schema';
commit;