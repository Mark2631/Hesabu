-- Hesabu MVP operational ledger — DRAFT ONLY.
-- This migration has NOT been applied to the Supabase project.
-- Reconcile with the live schema and run on a non-production branch first.
-- All writes to invoices, stock, receipts and journals go through SECURITY DEFINER
-- RPCs below so business-level validation and accounting updates are atomic.

begin;

alter table public.businesses
  add column if not exists next_invoice_number bigint not null default 1001,
  add column if not exists next_purchase_order_number bigint not null default 1001;

-- ---------------------------------------------------------------------------
-- Catalogue and counterparties
-- ---------------------------------------------------------------------------

create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  sku text not null,
  name text not null check (length(trim(name)) > 0),
  category text,
  unit text not null default 'piece',
  quantity_on_hand numeric(14,3) not null default 0 check (quantity_on_hand >= 0),
  reorder_level numeric(14,3) not null default 0 check (reorder_level >= 0),
  cost_price numeric(14,2) not null default 0 check (cost_price >= 0),
  selling_price numeric(14,2) not null default 0 check (selling_price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, sku),
  unique (id, business_id)
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  phone text,
  email text,
  payment_terms text,
  opening_balance numeric(14,2) not null default 0 check (opening_balance >= 0),
  current_balance numeric(14,2) not null default 0 check (current_balance >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id)
);

alter table public.products add column supplier_id uuid;
alter table public.products
  add constraint products_supplier_same_business_fk
  foreign key (supplier_id, business_id)
  references public.suppliers(id, business_id)
  on delete restrict;
create index products_business_supplier_idx on public.products (business_id, supplier_id);

-- ---------------------------------------------------------------------------
-- Sales and receivables
-- ---------------------------------------------------------------------------

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  invoice_number text not null,
  customer_name text not null default 'Walk-in customer',
  customer_phone text,
  issue_date date not null default (now() at time zone 'Africa/Nairobi')::date,
  due_date date,
  subtotal numeric(14,2) not null check (subtotal >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  total_amount numeric(14,2) not null check (total_amount >= 0),
  amount_paid numeric(14,2) not null default 0 check (amount_paid >= 0),
  payment_channel text not null default 'cash'
    check (payment_channel in ('mpesa', 'cash', 'bank', 'card', 'credit')),
  status text not null default 'sent'
    check (status in ('draft', 'sent', 'partial', 'paid', 'overdue', 'void')),
  source text not null default 'manual'
    check (source in ('hesabu', 'website', 'pos', 'manual', 'api')),
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, invoice_number),
  unique (id, business_id),
  check (discount_amount <= subtotal),
  check (total_amount = subtotal - discount_amount),
  check (amount_paid <= total_amount)
);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  invoice_id uuid not null,
  product_id uuid,
  product_name text not null,
  sku_snapshot text,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  unit_cost numeric(14,2) not null check (unit_cost >= 0),
  line_total numeric(14,2) not null check (line_total >= 0),
  created_at timestamptz not null default now(),
  foreign key (invoice_id, business_id)
    references public.invoices(id, business_id) on delete cascade,
  foreign key (product_id, business_id)
    references public.products(id, business_id) on delete restrict
);

-- ---------------------------------------------------------------------------
-- Payments, receipts and expenses
-- ---------------------------------------------------------------------------

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  invoice_id uuid not null,
  amount numeric(14,2) not null check (amount > 0),
  applied_amount numeric(14,2) not null default 0 check (applied_amount >= 0),
  unapplied_amount numeric(14,2) not null default 0 check (unapplied_amount >= 0),
  channel text not null check (channel in ('mpesa', 'cash', 'bank', 'card')),
  status text not null default 'succeeded'
    check (status in ('pending', 'succeeded', 'failed', 'reversed')),
  origin text not null default 'manual'
    check (origin in ('manual', 'daraja', 'integration', 'reconciliation')),
  provider_reference text,
  idempotency_key text,
  phone text,
  note text,
  received_at timestamptz not null default now(),
  confirmed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (invoice_id, business_id)
    references public.invoices(id, business_id) on delete restrict,
  unique (business_id, idempotency_key),
  check (applied_amount + unapplied_amount = amount)
);

create table public.unmatched_receipts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  reference text not null,
  payer_name text,
  payer_phone text,
  amount numeric(14,2) not null check (amount > 0),
  rail text not null check (rail in (
    'till_paybill', 'pochi', 'send_money', 'bank_transfer', 'manual_mpesa'
  )),
  source text not null default 'manual'
    check (source in ('manual', 'statement', 'callback')),
  status text not null default 'unmatched'
    check (status in ('unmatched', 'matched', 'duplicate', 'ignored')),
  received_at timestamptz not null default now(),
  matched_invoice_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (business_id, reference),
  foreign key (matched_invoice_id, business_id)
    references public.invoices(id, business_id) on delete restrict
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  expense_date date not null default (now() at time zone 'Africa/Nairobi')::date,
  category text not null,
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  channel text not null check (channel in ('mpesa', 'cash', 'bank', 'card')),
  reference text,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Purchasing and inventory movements
-- ---------------------------------------------------------------------------

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  supplier_id uuid not null,
  order_number text not null,
  order_date date not null default (now() at time zone 'Africa/Nairobi')::date,
  expected_date date,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'partially_received', 'received', 'cancelled')),
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  amount_received numeric(14,2) not null default 0 check (amount_received >= 0),
  amount_paid numeric(14,2) not null default 0 check (amount_paid >= 0),
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (supplier_id, business_id)
    references public.suppliers(id, business_id) on delete restrict,
  unique (business_id, order_number),
  unique (id, business_id)
);

create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  purchase_order_id uuid not null,
  product_id uuid not null,
  product_name text not null,
  quantity_ordered numeric(14,3) not null check (quantity_ordered > 0),
  quantity_received numeric(14,3) not null default 0 check (quantity_received >= 0),
  unit_cost numeric(14,2) not null check (unit_cost >= 0),
  line_total numeric(14,2) not null check (line_total >= 0),
  created_at timestamptz not null default now(),
  foreign key (purchase_order_id, business_id)
    references public.purchase_orders(id, business_id) on delete cascade,
  foreign key (product_id, business_id)
    references public.products(id, business_id) on delete restrict,
  check (quantity_received <= quantity_ordered)
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid not null,
  movement_type text not null
    check (movement_type in ('opening', 'sale', 'purchase', 'adjustment', 'return', 'production')),
  quantity_delta numeric(14,3) not null check (quantity_delta <> 0),
  unit_cost numeric(14,2) not null default 0 check (unit_cost >= 0),
  total_cost numeric(14,2) not null default 0 check (total_cost >= 0),
  source_type text,
  source_id uuid,
  reference text,
  note text,
  movement_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (product_id, business_id)
    references public.products(id, business_id) on delete restrict
);

-- ---------------------------------------------------------------------------
-- Cash movement and double-entry journal
-- ---------------------------------------------------------------------------

create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  movement_date date not null default (now() at time zone 'Africa/Nairobi')::date,
  channel text not null check (channel in ('mpesa', 'cash', 'bank', 'card')),
  direction text not null check (direction in ('in', 'out')),
  amount numeric(14,2) not null check (amount > 0),
  description text not null,
  reference text,
  source_type text,
  source_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  journal_number text not null,
  entry_date date not null default (now() at time zone 'Africa/Nairobi')::date,
  description text not null,
  reference text,
  source_type text,
  source_id uuid,
  status text not null default 'posted' check (status in ('posted', 'reversed')),
  posted_by uuid references auth.users(id) on delete set null,
  posted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (business_id, journal_number),
  unique (id, business_id)
);

create table public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  journal_entry_id uuid not null,
  account_code text,
  account_name text not null,
  debit numeric(14,2) not null default 0 check (debit >= 0),
  credit numeric(14,2) not null default 0 check (credit >= 0),
  description text,
  created_at timestamptz not null default now(),
  foreign key (journal_entry_id, business_id)
    references public.journal_entries(id, business_id) on delete cascade,
  check (
    (debit > 0 and credit = 0)
    or (credit > 0 and debit = 0)
  )
);

create table public.integration_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  event_type text not null,
  source text not null,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'failed')),
  reference text,
  provider_event_id text,
  detail text,
  payload jsonb,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  occurred_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (business_id, source, provider_event_id)
);

create table public.digest_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  channel text not null default 'whatsapp' check (channel in ('whatsapp', 'email')),
  recipient text not null,
  digest_date date not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'delivered', 'failed')),
  provider_message_id text,
  error_detail text,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

-- A journal entry must balance at transaction commit. The deferred trigger lets
-- a posting RPC insert the debit and credit rows as separate statements while
-- preventing a partially posted entry from committing.
create or replace function app_private.assert_journal_entry_balanced()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_entry_id uuid;
  v_line_count bigint;
  v_debits numeric(14,2);
  v_credits numeric(14,2);
begin
  if tg_op = 'DELETE' then
    v_business_id := old.business_id;
    v_entry_id := old.journal_entry_id;
  else
    v_business_id := new.business_id;
    v_entry_id := new.journal_entry_id;
  end if;

  select count(*), coalesce(sum(debit), 0), coalesce(sum(credit), 0)
  into v_line_count, v_debits, v_credits
  from public.journal_lines
  where business_id = v_business_id
    and journal_entry_id = v_entry_id;

  if v_line_count > 0 and (
    v_line_count < 2 or abs(v_debits - v_credits) >= 0.01
  ) then
    raise exception 'Journal entry % is not balanced', v_entry_id using errcode = '23514';
  end if;

  return null;
end;
$$;

create constraint trigger journal_lines_balanced_check
after insert or update or delete on public.journal_lines
deferrable initially deferred
for each row execute procedure app_private.assert_journal_entry_balanced();

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index products_business_active_idx on public.products (business_id, is_active);
create index products_business_stock_idx on public.products (business_id, quantity_on_hand, reorder_level);
create index invoices_business_date_idx on public.invoices (business_id, issue_date desc);
create index invoices_business_status_idx on public.invoices (business_id, status, due_date);
create index payments_business_received_idx on public.payments (business_id, received_at desc);
create index payments_invoice_idx on public.payments (invoice_id, business_id);
create unique index payments_provider_reference_unique
  on public.payments (business_id, provider_reference)
  where provider_reference is not null;
create index expenses_business_date_idx on public.expenses (business_id, expense_date desc);
create index suppliers_business_active_idx on public.suppliers (business_id, is_active);
create index purchase_orders_business_date_idx on public.purchase_orders (business_id, order_date desc);
create index inventory_movements_product_idx on public.inventory_movements (business_id, product_id, movement_at desc);
create index journal_entries_business_date_idx on public.journal_entries (business_id, entry_date desc);
create index journal_lines_account_idx on public.journal_lines (business_id, account_name);
create index unmatched_receipts_status_idx on public.unmatched_receipts (business_id, status, received_at desc);
create index integration_events_status_idx on public.integration_events (business_id, status, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Updated timestamps
-- ---------------------------------------------------------------------------

create trigger products_set_updated_at before update on public.products
for each row execute procedure app_private.set_updated_at();
create trigger suppliers_set_updated_at before update on public.suppliers
for each row execute procedure app_private.set_updated_at();

create or replace function app_private.initialise_supplier_balance()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.current_balance := new.opening_balance;
  return new;
end;
$$;
create trigger suppliers_initialise_balance
before insert on public.suppliers
for each row execute procedure app_private.initialise_supplier_balance();
create trigger invoices_set_updated_at before update on public.invoices
for each row execute procedure app_private.set_updated_at();
create trigger expenses_set_updated_at before update on public.expenses
for each row execute procedure app_private.set_updated_at();
create trigger purchase_orders_set_updated_at before update on public.purchase_orders
for each row execute procedure app_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Tenant RLS policies
-- ---------------------------------------------------------------------------

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'products', 'suppliers', 'invoices', 'invoice_items', 'payments',
    'unmatched_receipts', 'expenses', 'purchase_orders', 'purchase_order_items',
    'inventory_movements', 'cash_movements', 'journal_entries', 'journal_lines',
    'integration_events', 'digest_delivery_logs'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, public', table_name);
    execute format('grant select on public.%I to authenticated', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (app_private.is_business_member(business_id))',
      table_name || '_select_member', table_name
    );
  end loop;
end $$;

-- Restrict sensitive reads to the staff who need them. The generic tenant
-- policies remain for product, invoice and invoice-item reads.
drop policy expenses_select_member on public.expenses;
create policy expenses_select_finance on public.expenses for select to authenticated
using (app_private.has_business_role(business_id, array['owner', 'manager', 'finance']));

drop policy payments_select_member on public.payments;
create policy payments_select_finance_sales on public.payments for select to authenticated
using (app_private.has_business_role(business_id, array['owner', 'manager', 'sales', 'finance']));

drop policy unmatched_receipts_select_member on public.unmatched_receipts;
create policy unmatched_receipts_select_finance on public.unmatched_receipts for select to authenticated
using (app_private.has_business_role(business_id, array['owner', 'manager', 'finance']));

drop policy suppliers_select_member on public.suppliers;
create policy suppliers_select_operations on public.suppliers for select to authenticated
using (app_private.has_business_role(business_id, array['owner', 'manager', 'inventory', 'finance']));

drop policy purchase_orders_select_member on public.purchase_orders;
create policy purchase_orders_select_operations on public.purchase_orders for select to authenticated
using (app_private.has_business_role(business_id, array['owner', 'manager', 'inventory', 'finance']));

drop policy purchase_order_items_select_member on public.purchase_order_items;
create policy purchase_order_items_select_operations on public.purchase_order_items for select to authenticated
using (app_private.has_business_role(business_id, array['owner', 'manager', 'inventory', 'finance']));

drop policy inventory_movements_select_member on public.inventory_movements;
create policy inventory_movements_select_operations on public.inventory_movements for select to authenticated
using (app_private.has_business_role(business_id, array['owner', 'manager', 'inventory']));

drop policy cash_movements_select_member on public.cash_movements;
create policy cash_movements_select_finance on public.cash_movements for select to authenticated
using (app_private.has_business_role(business_id, array['owner', 'manager', 'finance']));

drop policy journal_entries_select_member on public.journal_entries;
create policy journal_entries_select_finance on public.journal_entries for select to authenticated
using (app_private.has_business_role(business_id, array['owner', 'manager', 'finance']));

drop policy journal_lines_select_member on public.journal_lines;
create policy journal_lines_select_finance on public.journal_lines for select to authenticated
using (app_private.has_business_role(business_id, array['owner', 'manager', 'finance']));

drop policy integration_events_select_member on public.integration_events;
create policy integration_events_select_management on public.integration_events for select to authenticated
using (app_private.has_business_role(business_id, array['owner', 'manager']));

drop policy digest_delivery_logs_select_member on public.digest_delivery_logs;
create policy digest_delivery_logs_select_management on public.digest_delivery_logs for select to authenticated
using (app_private.has_business_role(business_id, array['owner', 'manager', 'finance']));

-- Product creation and opening stock are posted through create_product().
-- Existing stock quantities can only change through audited movement RPCs.
grant update (
  sku, name, category, unit, reorder_level,
  cost_price, selling_price, supplier_id, is_active
) on public.products to authenticated;
create policy products_update_inventory on public.products for update to authenticated
using (app_private.has_business_role(business_id, array['owner', 'manager', 'inventory']))
with check (app_private.has_business_role(business_id, array['owner', 'manager', 'inventory']));

grant insert (
  business_id, name, phone, email, payment_terms, opening_balance, is_active
) on public.suppliers to authenticated;
grant update (name, phone, email, payment_terms, is_active)
  on public.suppliers to authenticated;
create policy suppliers_insert_management on public.suppliers for insert to authenticated
with check (app_private.has_business_role(business_id, array['owner', 'manager', 'inventory', 'finance']));
create policy suppliers_update_management on public.suppliers for update to authenticated
using (app_private.has_business_role(business_id, array['owner', 'manager', 'inventory', 'finance']))
with check (app_private.has_business_role(business_id, array['owner', 'manager', 'inventory', 'finance']));

-- Journal lines are immutable for ordinary application clients.
revoke insert, update, delete on public.journal_entries, public.journal_lines,
  public.invoices, public.invoice_items, public.payments, public.expenses,
  public.unmatched_receipts, public.purchase_orders, public.purchase_order_items,
  public.inventory_movements, public.cash_movements, public.integration_events,
  public.digest_delivery_logs
from authenticated;

-- ---------------------------------------------------------------------------
-- Atomic product creation with opening stock and inventory valuation
-- ---------------------------------------------------------------------------

create or replace function app_private.create_product(
  p_business_id uuid,
  p_sku text,
  p_name text,
  p_category text,
  p_unit text,
  p_initial_quantity numeric,
  p_reorder_level numeric,
  p_cost_price numeric,
  p_selling_price numeric,
  p_supplier_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $
declare
  v_user_id uuid := auth.uid();
  v_product_id uuid := gen_random_uuid();
  v_movement_id uuid := gen_random_uuid();
  v_journal_id uuid := gen_random_uuid();
  v_initial_quantity numeric(14,3);
  v_reorder_level numeric(14,3);
  v_cost_price numeric(14,2);
  v_selling_price numeric(14,2);
  v_total_value numeric(14,2);
  v_journal_number text;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not app_private.has_business_role(p_business_id, array['owner', 'manager', 'inventory']) then
    raise exception 'You do not have permission to create products for this business' using errcode = '42501';
  end if;
  if p_sku is null or length(trim(p_sku)) = 0 then
    raise exception 'Product SKU is required' using errcode = '22023';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Product name is required' using errcode = '22023';
  end if;
  if p_unit is null or length(trim(p_unit)) = 0 then
    raise exception 'Product unit is required' using errcode = '22023';
  end if;
  if p_initial_quantity is null or p_reorder_level is null
    or p_cost_price is null or p_selling_price is null then
    raise exception 'Opening quantity, reorder level, cost and selling price are required' using errcode = '22023';
  end if;

  v_initial_quantity := round(p_initial_quantity, 3);
  v_reorder_level := round(p_reorder_level, 3);
  v_cost_price := round(p_cost_price, 2);
  v_selling_price := round(p_selling_price, 2);

  if v_initial_quantity < 0 or v_reorder_level < 0
    or v_cost_price < 0 or v_selling_price < 0 then
    raise exception 'Product quantities and prices cannot be negative' using errcode = '22023';
  end if;

  if p_supplier_id is not null and not exists (
    select 1 from public.suppliers
    where id = p_supplier_id and business_id = p_business_id and is_active = true
  ) then
    raise exception 'Supplier is not available in this business' using errcode = '22023';
  end if;

  insert into public.products (
    id, business_id, sku, name, category, unit, quantity_on_hand,
    reorder_level, cost_price, selling_price, supplier_id, is_active
  ) values (
    v_product_id, p_business_id, trim(p_sku), trim(p_name),
    nullif(trim(coalesce(p_category, '')), ''), trim(p_unit), 0,
    v_reorder_level, v_cost_price, v_selling_price, p_supplier_id, true
  );

  if v_initial_quantity > 0 then
    v_total_value := round(v_initial_quantity * v_cost_price, 2);

    update public.products
    set quantity_on_hand = v_initial_quantity
    where id = v_product_id and business_id = p_business_id;

    insert into public.inventory_movements (
      id, business_id, product_id, movement_type, quantity_delta,
      unit_cost, total_cost, source_type, source_id, reference, note, created_by
    ) values (
      v_movement_id, p_business_id, v_product_id, 'opening',
      v_initial_quantity, v_cost_price, v_total_value,
      'product_opening', v_product_id, trim(p_sku), 'Opening stock', v_user_id
    );

    if v_total_value > 0 then
      v_journal_number := 'OPEN-' || upper(substr(replace(v_product_id::text, '-', ''), 1, 12));
      insert into public.journal_entries (
        id, business_id, journal_number, entry_date, description,
        reference, source_type, source_id, posted_by
      ) values (
        v_journal_id, p_business_id, v_journal_number,
        (now() at time zone 'Africa/Nairobi')::date,
        'Opening stock · ' || trim(p_name), trim(p_sku),
        'product_opening', v_product_id, v_user_id
      );

      insert into public.journal_lines (
        business_id, journal_entry_id, account_name, debit, description
      ) values (
        p_business_id, v_journal_id, 'Inventory', v_total_value, 'Opening stock value'
      );
      insert into public.journal_lines (
        business_id, journal_entry_id, account_name, credit, description
      ) values (
        p_business_id, v_journal_id, 'Opening balance equity', v_total_value, 'Opening stock funding'
      );
    end if;
  end if;

  return v_product_id;
end;
$;

-- ---------------------------------------------------------------------------
-- Atomic sale posting
-- ---------------------------------------------------------------------------

create or replace function app_private.post_sale(
  p_business_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_due_date date,
  p_discount numeric,
  p_payment_channel text,
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
  v_cost_total numeric(14,2) := 0;
  v_line_total numeric(14,2);
  v_total numeric(14,2);
  v_discount numeric(14,2) := coalesce(p_discount, 0);
  v_invoice_id uuid := gen_random_uuid();
  v_invoice_number text;
  v_sequence bigint;
  v_journal_id uuid := gen_random_uuid();
  v_journal_number text;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not app_private.has_business_role(p_business_id, array['owner', 'manager', 'sales']) then
    raise exception 'You do not have permission to record sales for this business' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one sale item' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'A sale cannot contain more than 100 item rows' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_items) e
    group by (e ->> 'product_id')
    having count(*) > 1
  ) then
    raise exception 'Each product must appear once in the sale' using errcode = '22023';
  end if;
  if p_payment_channel is null or p_payment_channel not in ('mpesa', 'cash', 'bank', 'card', 'credit') then
    raise exception 'Unsupported sale payment channel' using errcode = '22023';
  end if;
  if p_source is null or p_source not in ('hesabu', 'website', 'pos', 'manual', 'api') then
    raise exception 'Unsupported sale source' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::numeric;
    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Sale quantities must be greater than zero' using errcode = '22023';
    end if;
    select * into v_product
    from public.products
    where id = v_product_id
      and business_id = p_business_id
      and is_active = true
    for update;
    if not found then
      raise exception 'A selected product is not available in this business' using errcode = '22023';
    end if;
    if v_quantity > v_product.quantity_on_hand then
      raise exception 'Not enough stock for %', v_product.name using errcode = '22023';
    end if;
    v_line_total := round(v_quantity * v_product.selling_price, 2);
    v_subtotal := v_subtotal + v_line_total;
    v_cost_total := v_cost_total + round(v_quantity * v_product.cost_price, 2);
  end loop;

  v_subtotal := round(v_subtotal, 2);
  v_cost_total := round(v_cost_total, 2);
  if v_discount < 0 or v_discount > v_subtotal then
    raise exception 'Discount must be between zero and the sale subtotal' using errcode = '22023';
  end if;
  v_discount := round(v_discount, 2);
  v_total := round(v_subtotal - v_discount, 2);

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
    amount_paid, payment_channel, status, source, created_by
  ) values (
    v_invoice_id, p_business_id, coalesce(nullif(trim(p_customer_name), ''), 'Walk-in customer'),
    nullif(trim(coalesce(p_customer_phone, '')), ''),
    (now() at time zone 'Africa/Nairobi')::date, p_due_date,
    v_subtotal, v_discount, v_total, 0, p_payment_channel,
    'sent', p_source, v_user_id
  );

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::numeric;
    select * into v_product from public.products
    where id = v_product_id and business_id = p_business_id
    for update;

    v_line_total := round(v_quantity * v_product.selling_price, 2);
    insert into public.invoice_items (
      business_id, invoice_id, product_id, product_name, sku_snapshot,
      quantity, unit_price, unit_cost, line_total
    ) values (
      p_business_id, v_invoice_id, v_product.id, v_product.name, v_product.sku,
      v_quantity, v_product.selling_price, v_product.cost_price, v_line_total
    );

    update public.products
    set quantity_on_hand = quantity_on_hand - v_quantity
    where id = v_product.id and business_id = p_business_id;

    insert into public.inventory_movements (
      business_id, product_id, movement_type, quantity_delta,
      unit_cost, total_cost, source_type, source_id, reference, created_by
    ) values (
      p_business_id, v_product.id, 'sale', -v_quantity,
      v_product.cost_price, round(v_quantity * v_product.cost_price, 2),
      'invoice', v_invoice_id, v_invoice_number, v_user_id
    );
  end loop;

  v_journal_number := 'JRN-' || replace(v_invoice_number, 'HS-', '');
  insert into public.journal_entries (
    id, business_id, journal_number, entry_date, description,
    reference, source_type, source_id, posted_by
  ) values (
    v_journal_id, p_business_id, v_journal_number,
    (now() at time zone 'Africa/Nairobi')::date,
    'Sale posted · ' || v_invoice_number, v_invoice_number,
    'invoice', v_invoice_id, v_user_id
  );

  if v_total > 0 then
    insert into public.journal_lines (business_id, journal_entry_id, account_name, debit, description)
    values (p_business_id, v_journal_id, 'Accounts receivable', v_total, 'Invoice issued');
  end if;
  if v_discount > 0 then
    insert into public.journal_lines (business_id, journal_entry_id, account_name, debit, description)
    values (p_business_id, v_journal_id, 'Sales discounts', v_discount, 'Discount allowed');
  end if;
  if v_subtotal > 0 then
    insert into public.journal_lines (business_id, journal_entry_id, account_name, credit, description)
    values (p_business_id, v_journal_id, 'Sales revenue', v_subtotal, 'Sale revenue');
  end if;
  if v_cost_total > 0 then
    insert into public.journal_lines (business_id, journal_entry_id, account_name, debit, description)
    values (p_business_id, v_journal_id, 'Cost of goods sold', v_cost_total, 'Cost of items sold');
    insert into public.journal_lines (business_id, journal_entry_id, account_name, credit, description)
    values (p_business_id, v_journal_id, 'Inventory', v_cost_total, 'Inventory relieved');
  end if;

  return v_invoice_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Atomic payment allocation and receipt posting
-- ---------------------------------------------------------------------------

create or replace function app_private.post_payment(
  p_business_id uuid,
  p_invoice_id uuid,
  p_amount numeric,
  p_channel text,
  p_provider_reference text default null,
  p_origin text default 'manual',
  p_phone text default null,
  p_idempotency_key text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_invoice public.invoices%rowtype;
  v_payment_id uuid := gen_random_uuid();
  v_journal_id uuid := gen_random_uuid();
  v_applied numeric(14,2);
  v_unapplied numeric(14,2);
  v_account text;
  v_reference text := nullif(trim(coalesce(p_provider_reference, '')), '');
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not app_private.has_business_role(p_business_id, array['owner', 'manager', 'sales', 'finance']) then
    raise exception 'You do not have permission to record payments for this business' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero' using errcode = '22023';
  end if;
  if p_channel is null or p_channel not in ('mpesa', 'cash', 'bank', 'card') then
    raise exception 'Unsupported payment channel' using errcode = '22023';
  end if;
  if p_origin not in ('manual', 'daraja', 'integration', 'reconciliation') then
    raise exception 'Unsupported payment origin' using errcode = '22023';
  end if;

  if p_idempotency_key is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(p_business_id::text || ':' || p_idempotency_key, 0)
    );
    select id into v_payment_id
    from public.payments
    where business_id = p_business_id and idempotency_key = p_idempotency_key;
    if found then return v_payment_id; end if;
  end if;

  select * into v_invoice
  from public.invoices
  where id = p_invoice_id and business_id = p_business_id
  for update;
  if not found then
    raise exception 'Invoice not found in this business' using errcode = '22023';
  end if;

  v_applied := least(
    round(p_amount, 2),
    greatest(0, round(v_invoice.total_amount - v_invoice.amount_paid, 2))
  );
  v_unapplied := greatest(0, round(p_amount - v_applied, 2));

  insert into public.payments (
    id, business_id, invoice_id, amount, applied_amount, unapplied_amount,
    channel, status, origin, provider_reference, idempotency_key, phone,
    note, received_at, confirmed_at, created_by
  ) values (
    v_payment_id, p_business_id, p_invoice_id, round(p_amount, 2),
    v_applied, v_unapplied, p_channel, 'succeeded', p_origin, v_reference,
    p_idempotency_key, nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_note, '')), ''), now(), now(), v_user_id
  );

  update public.invoices
  set amount_paid = amount_paid + v_applied,
      status = case
        when amount_paid + v_applied >= total_amount then 'paid'
        when amount_paid + v_applied > 0 then 'partial'
        else status
      end
  where id = p_invoice_id and business_id = p_business_id;

  v_account := case p_channel
    when 'mpesa' then 'M-Pesa clearing'
    when 'cash' then 'Cash on hand'
    when 'bank' then 'Bank account'
    when 'card' then 'Card clearing'
  end;

  insert into public.journal_entries (
    id, business_id, journal_number, entry_date, description,
    reference, source_type, source_id, posted_by
  ) values (
    v_journal_id, p_business_id,
    'PAY-' || upper(substr(replace(v_payment_id::text, '-', ''), 1, 12)),
    (now() at time zone 'Africa/Nairobi')::date,
    'Customer payment · ' || v_invoice.invoice_number,
    coalesce(v_reference, v_invoice.invoice_number),
    'payment', v_payment_id, v_user_id
  );

  insert into public.journal_lines (business_id, journal_entry_id, account_name, debit, description)
  values (p_business_id, v_journal_id, v_account, round(p_amount, 2), 'Funds received');

  if v_applied > 0 then
    insert into public.journal_lines (business_id, journal_entry_id, account_name, credit, description)
    values (p_business_id, v_journal_id, 'Accounts receivable', v_applied, 'Payment allocated to invoice');
  end if;
  if v_unapplied > 0 then
    insert into public.journal_lines (business_id, journal_entry_id, account_name, credit, description)
    values (p_business_id, v_journal_id, 'Customer advances', v_unapplied, 'Unapplied customer credit');
  end if;

  return v_payment_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Atomic expense posting
-- ---------------------------------------------------------------------------

create or replace function app_private.post_expense(
  p_business_id uuid,
  p_category text,
  p_description text,
  p_amount numeric,
  p_channel text,
  p_expense_date date default null,
  p_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_expense_id uuid := gen_random_uuid();
  v_journal_id uuid := gen_random_uuid();
  v_account text;
  v_cash_account text;
  v_expense_date date := coalesce(p_expense_date, (now() at time zone 'Africa/Nairobi')::date);
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not app_private.has_business_role(p_business_id, array['owner', 'manager', 'finance']) then
    raise exception 'You do not have permission to post expenses for this business' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Expense amount must be greater than zero' using errcode = '22023';
  end if;
  if p_channel not in ('mpesa', 'cash', 'bank', 'card') then
    raise exception 'Unsupported expense channel' using errcode = '22023';
  end if;
  if p_description is null or length(trim(p_description)) = 0 then
    raise exception 'Expense description is required' using errcode = '22023';
  end if;

  v_account := case lower(coalesce(p_category, ''))
    when 'rent' then 'Rent expense'
    when 'utilities' then 'Utilities expense'
    when 'staff costs' then 'Staff expense'
    when 'transport' then 'Transport expense'
    else 'Operating expenses'
  end;
  v_cash_account := case p_channel
    when 'mpesa' then 'M-Pesa clearing'
    when 'cash' then 'Cash on hand'
    when 'bank' then 'Bank account'
    when 'card' then 'Card clearing'
  end;

  insert into public.expenses (
    id, business_id, expense_date, category, description, amount, channel, reference, created_by
  ) values (
    v_expense_id, p_business_id, v_expense_date,
    coalesce(nullif(trim(p_category), ''), 'Other'),
    trim(p_description), round(p_amount, 2), p_channel,
    nullif(trim(coalesce(p_reference, '')), ''), v_user_id
  );

  insert into public.cash_movements (
    business_id, movement_date, channel, direction, amount, description,
    reference, source_type, source_id, created_by
  ) values (
    p_business_id, v_expense_date, p_channel, 'out',
    round(p_amount, 2), trim(p_description),
    nullif(trim(coalesce(p_reference, '')), ''), 'expense', v_expense_id, v_user_id
  );

  insert into public.journal_entries (
    id, business_id, journal_number, entry_date, description,
    reference, source_type, source_id, posted_by
  ) values (
    v_journal_id, p_business_id,
    'EXP-' || upper(substr(replace(v_expense_id::text, '-', ''), 1, 12)),
    v_expense_date, trim(p_description), p_reference, 'expense', v_expense_id, v_user_id
  );

  insert into public.journal_lines (business_id, journal_entry_id, account_name, debit, description)
  values (p_business_id, v_journal_id, v_account, round(p_amount, 2), trim(p_description));
  insert into public.journal_lines (business_id, journal_entry_id, account_name, credit, description)
  values (p_business_id, v_journal_id, v_cash_account, round(p_amount, 2), trim(p_description));

  return v_expense_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Purchase order creation, goods receiving and supplier settlements
-- ---------------------------------------------------------------------------

create or replace function app_private.create_purchase_order(
  p_business_id uuid,
  p_supplier_id uuid,
  p_expected_date date,
  p_items jsonb,
  p_note text default null
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
  v_purchase_order_id uuid := gen_random_uuid();
  v_sequence bigint;
  v_order_number text;
  v_subtotal numeric(14,2) := 0;
  v_quantity numeric(14,3);
  v_unit_cost numeric(14,2);
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not app_private.has_business_role(p_business_id, array['owner', 'manager', 'inventory']) then
    raise exception 'You do not have permission to create purchase orders' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one product to the purchase order' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) e
    group by (e ->> 'product_id')
    having count(*) > 1
  ) then
    raise exception 'Each product must appear once on the purchase order' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.suppliers
    where id = p_supplier_id and business_id = p_business_id and is_active = true
  ) then
    raise exception 'Supplier is not available in this business' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item ->> 'quantity')::numeric;
    v_unit_cost := round((v_item ->> 'unit_cost')::numeric, 2);
    if v_quantity is null or v_quantity <= 0 or v_unit_cost is null or v_unit_cost < 0 then
      raise exception 'Purchase quantities must be positive and unit costs cannot be negative' using errcode = '22023';
    end if;
    select * into v_product
    from public.products
    where id = (v_item ->> 'product_id')::uuid
      and business_id = p_business_id
      and is_active = true;
    if not found then
      raise exception 'A selected product is not available in this business' using errcode = '22023';
    end if;
    v_subtotal := v_subtotal + round(v_quantity * v_unit_cost, 2);
  end loop;

  update public.businesses
  set next_purchase_order_number = next_purchase_order_number + 1
  where id = p_business_id
  returning next_purchase_order_number - 1 into v_sequence;
  if not found then
    raise exception 'Business not found' using errcode = '22023';
  end if;
  v_order_number := 'PO-' || lpad(v_sequence::text, 6, '0');

  insert into public.purchase_orders (
    id, business_id, supplier_id, order_number, order_date,
    expected_date, status, subtotal, note, created_by
  ) values (
    v_purchase_order_id, p_business_id, p_supplier_id, v_order_number,
    (now() at time zone 'Africa/Nairobi')::date, p_expected_date,
    'sent', round(v_subtotal, 2), nullif(trim(coalesce(p_note, '')), ''), v_user_id
  );

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    select * into v_product
    from public.products
    where id = (v_item ->> 'product_id')::uuid and business_id = p_business_id;
    v_quantity := (v_item ->> 'quantity')::numeric;
    v_unit_cost := round((v_item ->> 'unit_cost')::numeric, 2);
    insert into public.purchase_order_items (
      business_id, purchase_order_id, product_id, product_name,
      quantity_ordered, quantity_received, unit_cost, line_total
    ) values (
      p_business_id, v_purchase_order_id, v_product.id, v_product.name,
      v_quantity, 0, v_unit_cost, round(v_quantity * v_unit_cost, 2)
    );
  end loop;

  return v_purchase_order_id;
end;
$$;

create or replace function app_private.post_purchase_receipt(
  p_business_id uuid,
  p_purchase_order_id uuid,
  p_items jsonb,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.purchase_orders%rowtype;
  v_order_item public.purchase_order_items%rowtype;
  v_product public.products%rowtype;
  v_item jsonb;
  v_quantity numeric(14,3);
  v_remaining numeric(14,3);
  v_line_value numeric(14,2);
  v_total_value numeric(14,2) := 0;
  v_new_quantity numeric(14,3);
  v_new_cost numeric(14,2);
  v_journal_id uuid := gen_random_uuid();
  v_journal_number text;
  v_reference text;
  v_complete boolean;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not app_private.has_business_role(p_business_id, array['owner', 'manager', 'inventory', 'finance']) then
    raise exception 'You do not have permission to receive stock' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Enter at least one received quantity' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) e
    group by (e ->> 'product_id')
    having count(*) > 1
  ) then
    raise exception 'Each product must appear once in the goods receipt' using errcode = '22023';
  end if;

  select * into v_order
  from public.purchase_orders
  where id = p_purchase_order_id and business_id = p_business_id
  for update;
  if not found or v_order.status = 'cancelled' then
    raise exception 'Purchase order is not available for receiving' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item ->> 'quantity')::numeric;
    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Received quantities must be greater than zero' using errcode = '22023';
    end if;

    select * into v_order_item
    from public.purchase_order_items
    where purchase_order_id = p_purchase_order_id
      and business_id = p_business_id
      and product_id = (v_item ->> 'product_id')::uuid
    for update;
    if not found then
      raise exception 'Receipt contains a product not listed on this purchase order' using errcode = '22023';
    end if;

    v_remaining := v_order_item.quantity_ordered - v_order_item.quantity_received;
    if v_quantity > v_remaining then
      raise exception 'Received quantity exceeds the remaining ordered quantity for %', v_order_item.product_name using errcode = '22023';
    end if;

    select * into v_product
    from public.products
    where id = v_order_item.product_id and business_id = p_business_id
    for update;
    if not found then
      raise exception 'Product is no longer available in this business' using errcode = '22023';
    end if;

    v_line_value := round(v_quantity * v_order_item.unit_cost, 2);
    v_total_value := v_total_value + v_line_value;
    v_new_quantity := v_product.quantity_on_hand + v_quantity;
    if v_new_quantity > 0 then
      v_new_cost := round(
        (
          v_product.quantity_on_hand * v_product.cost_price
          + v_quantity * v_order_item.unit_cost
        ) / v_new_quantity,
        2
      );
    else
      v_new_cost := v_product.cost_price;
    end if;

    update public.products
    set quantity_on_hand = v_new_quantity, cost_price = v_new_cost
    where id = v_product.id and business_id = p_business_id;

    update public.purchase_order_items
    set quantity_received = quantity_received + v_quantity
    where id = v_order_item.id and business_id = p_business_id;

    insert into public.inventory_movements (
      business_id, product_id, movement_type, quantity_delta,
      unit_cost, total_cost, source_type, source_id, reference, note, created_by
    ) values (
      p_business_id, v_product.id, 'purchase', v_quantity,
      v_order_item.unit_cost, v_line_value, 'purchase_order',
      p_purchase_order_id, v_order.order_number, nullif(trim(coalesce(p_note, '')), ''), v_user_id
    );
  end loop;

  if v_total_value <= 0 then
    raise exception 'Goods receipt must have a positive value' using errcode = '22023';
  end if;

  select bool_and(quantity_received >= quantity_ordered)
  into v_complete
  from public.purchase_order_items
  where purchase_order_id = p_purchase_order_id and business_id = p_business_id;

  update public.purchase_orders
  set amount_received = amount_received + round(v_total_value, 2),
      status = case when coalesce(v_complete, false) then 'received' else 'partially_received' end
  where id = p_purchase_order_id and business_id = p_business_id;

  update public.suppliers
  set current_balance = current_balance + round(v_total_value, 2)
  where id = v_order.supplier_id and business_id = p_business_id;

  v_reference := v_order.order_number || '-RCV-' || upper(substr(replace(v_journal_id::text, '-', ''), 1, 8));
  v_journal_number := 'RCV-' || upper(substr(replace(v_journal_id::text, '-', ''), 1, 12));

  insert into public.journal_entries (
    id, business_id, journal_number, entry_date, description,
    reference, source_type, source_id, posted_by
  ) values (
    v_journal_id, p_business_id, v_journal_number,
    (now() at time zone 'Africa/Nairobi')::date,
    'Goods received · ' || v_order.order_number,
    v_reference, 'purchase_receipt', p_purchase_order_id, v_user_id
  );
  insert into public.journal_lines (business_id, journal_entry_id, account_name, debit, description)
  values (p_business_id, v_journal_id, 'Inventory', round(v_total_value, 2), 'Goods received into stock');
  insert into public.journal_lines (business_id, journal_entry_id, account_name, credit, description)
  values (p_business_id, v_journal_id, 'Accounts payable', round(v_total_value, 2), 'Supplier liability recognised');

  return v_journal_id;
end;
$$;

create or replace function app_private.post_supplier_payment(
  p_business_id uuid,
  p_supplier_id uuid,
  p_amount numeric,
  p_channel text,
  p_reference text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_supplier public.suppliers%rowtype;
  v_payment_id uuid := gen_random_uuid();
  v_journal_id uuid := gen_random_uuid();
  v_cash_account text;
  v_reference text := nullif(trim(coalesce(p_reference, '')), '');
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not app_private.has_business_role(p_business_id, array['owner', 'manager', 'finance']) then
    raise exception 'You do not have permission to settle supplier balances' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Supplier payment must be greater than zero' using errcode = '22023';
  end if;
  if p_channel is null or p_channel not in ('mpesa', 'cash', 'bank', 'card') then
    raise exception 'Unsupported supplier payment channel' using errcode = '22023';
  end if;

  select * into v_supplier
  from public.suppliers
  where id = p_supplier_id and business_id = p_business_id
  for update;
  if not found then
    raise exception 'Supplier not found in this business' using errcode = '22023';
  end if;
  if round(p_amount, 2) > v_supplier.current_balance then
    raise exception 'Supplier payment exceeds the outstanding balance' using errcode = '22023';
  end if;

  update public.suppliers
  set current_balance = current_balance - round(p_amount, 2)
  where id = p_supplier_id and business_id = p_business_id;

  v_cash_account := case p_channel
    when 'mpesa' then 'M-Pesa clearing'
    when 'cash' then 'Cash on hand'
    when 'bank' then 'Bank account'
    when 'card' then 'Card clearing'
  end;

  insert into public.cash_movements (
    business_id, movement_date, channel, direction, amount,
    description, reference, source_type, source_id, created_by
  ) values (
    p_business_id, (now() at time zone 'Africa/Nairobi')::date,
    p_channel, 'out', round(p_amount, 2),
    'Supplier payment · ' || v_supplier.name, v_reference,
    'supplier_payment', v_payment_id, v_user_id
  );

  insert into public.journal_entries (
    id, business_id, journal_number, entry_date, description,
    reference, source_type, source_id, posted_by
  ) values (
    v_journal_id, p_business_id,
    'SUP-' || upper(substr(replace(v_payment_id::text, '-', ''), 1, 12)),
    (now() at time zone 'Africa/Nairobi')::date,
    'Supplier payment · ' || v_supplier.name, v_reference,
    'supplier_payment', v_payment_id, v_user_id
  );
  insert into public.journal_lines (business_id, journal_entry_id, account_name, debit, description)
  values (p_business_id, v_journal_id, 'Accounts payable', round(p_amount, 2), 'Supplier balance settled');
  insert into public.journal_lines (business_id, journal_entry_id, account_name, credit, description)
  values (p_business_id, v_journal_id, v_cash_account, round(p_amount, 2), 'Cash paid to supplier');

  return v_payment_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Inventory adjustments and server-calculated daily digest
-- ---------------------------------------------------------------------------

create or replace function app_private.post_stock_adjustment(
  p_business_id uuid,
  p_product_id uuid,
  p_quantity_delta numeric,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_product public.products%rowtype;
  v_movement_id uuid := gen_random_uuid();
  v_journal_id uuid := gen_random_uuid();
  v_new_quantity numeric(14,3);
  v_delta numeric(14,3);
  v_value numeric(14,2);
  v_debit_account text;
  v_credit_account text;
  v_reference text;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not app_private.has_business_role(p_business_id, array['owner', 'manager', 'inventory']) then
    raise exception 'You do not have permission to adjust stock' using errcode = '42501';
  end if;
  v_delta := round(p_quantity_delta, 3);
  if v_delta is null or v_delta = 0 then
    raise exception 'Stock adjustment must be at least 0.001 units' using errcode = '22023';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A reason is required for every stock adjustment' using errcode = '22023';
  end if;

  select * into v_product from public.products
  where id = p_product_id and business_id = p_business_id and is_active = true
  for update;
  if not found then
    raise exception 'Product not found in this business' using errcode = '22023';
  end if;

  v_new_quantity := v_product.quantity_on_hand + v_delta;
  if v_new_quantity < 0 then
    raise exception 'Stock adjustment would make the quantity negative' using errcode = '22023';
  end if;
  v_value := round(abs(v_delta) * v_product.cost_price, 2);

  update public.products
  set quantity_on_hand = v_new_quantity
  where id = p_product_id and business_id = p_business_id;

  if v_delta > 0 then
    v_debit_account := 'Inventory';
    v_credit_account := 'Stock adjustment gain';
  else
    v_debit_account := 'Stock shrinkage';
    v_credit_account := 'Inventory';
  end if;

  v_reference := 'ADJ-' || upper(substr(replace(v_movement_id::text, '-', ''), 1, 10));
  insert into public.inventory_movements (
    id, business_id, product_id, movement_type, quantity_delta,
    unit_cost, total_cost, source_type, source_id, reference, note, created_by
  ) values (
    v_movement_id, p_business_id, p_product_id, 'adjustment',
    v_delta, v_product.cost_price, v_value,
    'stock_adjustment', v_movement_id, v_reference, trim(p_reason), v_user_id
  );

  insert into public.journal_entries (
    id, business_id, journal_number, entry_date, description,
    reference, source_type, source_id, posted_by
  ) values (
    v_journal_id, p_business_id, v_reference,
    (now() at time zone 'Africa/Nairobi')::date,
    'Stock adjustment · ' || v_product.name, v_reference,
    'stock_adjustment', v_movement_id, v_user_id
  );
  if v_value > 0 then
    insert into public.journal_lines (business_id, journal_entry_id, account_name, debit, description)
    values (p_business_id, v_journal_id, v_debit_account, v_value, trim(p_reason));
    insert into public.journal_lines (business_id, journal_entry_id, account_name, credit, description)
    values (p_business_id, v_journal_id, v_credit_account, v_value, trim(p_reason));
  end if;

  return v_movement_id;
end;
$$;

create or replace function app_private.get_daily_digest(
  p_business_id uuid,
  p_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone text;
  v_date date;
  v_sales numeric(14,2);
  v_received numeric(14,2);
  v_expenses numeric(14,2);
  v_gross_profit numeric(14,2);
  v_invoice_count bigint;
  v_units_sold numeric(14,3);
  v_low_stock bigint;
begin
  if auth.uid() is null or not app_private.is_business_member(p_business_id) then
    raise exception 'Business membership required' using errcode = '42501';
  end if;
  select timezone into v_timezone
  from public.businesses where id = p_business_id;
  if not found then
    raise exception 'Business not found' using errcode = '22023';
  end if;
  v_date := coalesce(p_date, (now() at time zone v_timezone)::date);

  select
    coalesce(sum(total_amount), 0),
    count(*)
  into v_sales, v_invoice_count
  from public.invoices
  where business_id = p_business_id and issue_date = v_date and status <> 'void';

  select coalesce(sum(amount), 0)
  into v_received
  from public.payments
  where business_id = p_business_id
    and status = 'succeeded'
    and (received_at at time zone v_timezone)::date = v_date;

  select coalesce(sum(amount), 0)
  into v_expenses
  from public.expenses
  where business_id = p_business_id and expense_date = v_date;

  select coalesce(sum(
    coalesce(lines.margin_total, 0) - i.discount_amount
  ), 0)
  into v_gross_profit
  from public.invoices i
  left join lateral (
    select sum(ii.line_total - (ii.quantity * ii.unit_cost)) as margin_total
    from public.invoice_items ii
    where ii.invoice_id = i.id and ii.business_id = i.business_id
  ) lines on true
  where i.business_id = p_business_id and i.issue_date = v_date and i.status <> 'void';

  select coalesce(sum(quantity), 0)
  into v_units_sold
  from public.invoice_items ii
  join public.invoices i on i.id = ii.invoice_id and i.business_id = ii.business_id
  where ii.business_id = p_business_id and i.issue_date = v_date and i.status <> 'void';

  select count(*)
  into v_low_stock
  from public.products
  where business_id = p_business_id and is_active = true
    and quantity_on_hand <= reorder_level;

  return jsonb_build_object(
    'business_id', p_business_id,
    'date', v_date,
    'currency', 'KES',
    'sales_total', round(v_sales, 2),
    'payments_received', round(v_received, 2),
    'expenses_total', round(v_expenses, 2),
    'gross_profit', round(v_gross_profit, 2),
    'invoice_count', v_invoice_count,
    'units_sold', v_units_sold,
    'low_stock_count', v_low_stock,
    'generated_at', now()
  );
end;
$$;


create or replace function public.create_product(
  p_business_id uuid, p_sku text, p_name text, p_category text, p_unit text,
  p_initial_quantity numeric, p_reorder_level numeric, p_cost_price numeric,
  p_selling_price numeric, p_supplier_id uuid default null
)
returns uuid language sql security invoker set search_path = ''
as $ select app_private.create_product($1,$2,$3,$4,$5,$6,$7,$8,$9,$10); $;

-- Public Data API entry points are SECURITY INVOKER wrappers only. The
-- SECURITY DEFINER implementations above live in the non-exposed app_private
-- schema and perform explicit user, business and role validation.
create or replace function public.post_sale(
  p_business_id uuid, p_customer_name text, p_customer_phone text,
  p_due_date date, p_discount numeric, p_payment_channel text,
  p_source text, p_items jsonb
)
returns uuid language sql security invoker set search_path = ''
as $$ select app_private.post_sale($1,$2,$3,$4,$5,$6,$7,$8); $$;

create or replace function public.post_payment(
  p_business_id uuid, p_invoice_id uuid, p_amount numeric, p_channel text,
  p_provider_reference text default null, p_origin text default 'manual',
  p_phone text default null, p_idempotency_key text default null, p_note text default null
)
returns uuid language sql security invoker set search_path = ''
as $$ select app_private.post_payment($1,$2,$3,$4,$5,$6,$7,$8,$9); $$;

create or replace function public.post_expense(
  p_business_id uuid, p_category text, p_description text, p_amount numeric,
  p_channel text, p_expense_date date default null, p_reference text default null
)
returns uuid language sql security invoker set search_path = ''
as $$ select app_private.post_expense($1,$2,$3,$4,$5,$6,$7); $$;

create or replace function public.create_purchase_order(
  p_business_id uuid, p_supplier_id uuid, p_expected_date date,
  p_items jsonb, p_note text default null
)
returns uuid language sql security invoker set search_path = ''
as $$ select app_private.create_purchase_order($1,$2,$3,$4,$5); $$;

create or replace function public.post_purchase_receipt(
  p_business_id uuid, p_purchase_order_id uuid, p_items jsonb, p_note text default null
)
returns uuid language sql security invoker set search_path = ''
as $$ select app_private.post_purchase_receipt($1,$2,$3,$4); $$;

create or replace function public.post_supplier_payment(
  p_business_id uuid, p_supplier_id uuid, p_amount numeric,
  p_channel text, p_reference text default null, p_note text default null
)
returns uuid language sql security invoker set search_path = ''
as $$ select app_private.post_supplier_payment($1,$2,$3,$4,$5,$6); $$;

create or replace function public.post_stock_adjustment(
  p_business_id uuid, p_product_id uuid, p_quantity_delta numeric, p_reason text
)
returns uuid language sql security invoker set search_path = ''
as $$ select app_private.post_stock_adjustment($1,$2,$3,$4); $$;

create or replace function public.get_daily_digest(
  p_business_id uuid, p_date date default null
)
returns jsonb language sql security invoker set search_path = ''
as $$ select app_private.get_daily_digest($1,$2); $$;

-- Restrict private implementations and public RPC wrappers to signed-in users.
revoke all on all functions in schema app_private from public, anon;
revoke all on function public.create_product(uuid, text, text, text, text, numeric, numeric, numeric, numeric, uuid) from public, anon;
revoke all on function public.post_sale(uuid, text, text, date, numeric, text, text, jsonb) from public, anon;
revoke all on function public.post_payment(uuid, uuid, numeric, text, text, text, text, text, text) from public, anon;
revoke all on function public.post_expense(uuid, text, text, numeric, text, date, text) from public, anon;
revoke all on function public.create_purchase_order(uuid, uuid, date, jsonb, text) from public, anon;
revoke all on function public.post_purchase_receipt(uuid, uuid, jsonb, text) from public, anon;
revoke all on function public.post_supplier_payment(uuid, uuid, numeric, text, text, text) from public, anon;
revoke all on function public.post_stock_adjustment(uuid, uuid, numeric, text) from public, anon;
revoke all on function public.get_daily_digest(uuid, date) from public, anon;

grant execute on function app_private.create_product(uuid, text, text, text, text, numeric, numeric, numeric, numeric, uuid) to authenticated;
grant execute on function app_private.post_sale(uuid, text, text, date, numeric, text, text, jsonb) to authenticated;
grant execute on function app_private.post_payment(uuid, uuid, numeric, text, text, text, text, text, text) to authenticated;
grant execute on function app_private.post_expense(uuid, text, text, numeric, text, date, text) to authenticated;
grant execute on function app_private.create_purchase_order(uuid, uuid, date, jsonb, text) to authenticated;
grant execute on function app_private.post_purchase_receipt(uuid, uuid, jsonb, text) to authenticated;
grant execute on function app_private.post_supplier_payment(uuid, uuid, numeric, text, text, text) to authenticated;
grant execute on function app_private.post_stock_adjustment(uuid, uuid, numeric, text) to authenticated;
grant execute on function app_private.get_daily_digest(uuid, date) to authenticated;

grant execute on function public.create_product(uuid, text, text, text, text, numeric, numeric, numeric, numeric, uuid) to authenticated;
grant execute on function public.post_sale(uuid, text, text, date, numeric, text, text, jsonb) to authenticated;
grant execute on function public.post_payment(uuid, uuid, numeric, text, text, text, text, text, text) to authenticated;
grant execute on function public.post_expense(uuid, text, text, numeric, text, date, text) to authenticated;
grant execute on function public.create_purchase_order(uuid, uuid, date, jsonb, text) to authenticated;
grant execute on function public.post_purchase_receipt(uuid, uuid, jsonb, text) to authenticated;
grant execute on function public.post_supplier_payment(uuid, uuid, numeric, text, text, text) to authenticated;
grant execute on function public.post_stock_adjustment(uuid, uuid, numeric, text) to authenticated;
grant execute on function public.get_daily_digest(uuid, date) to authenticated;

commit;
