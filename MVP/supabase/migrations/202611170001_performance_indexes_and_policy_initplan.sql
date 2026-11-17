begin;
create index if not exists business_members_user_id_idx on public.business_members(user_id);
create index if not exists businesses_owner_id_idx on public.businesses(owner_id);
create index if not exists cash_movements_business_id_idx on public.cash_movements(business_id);
create index if not exists cash_movements_created_by_idx on public.cash_movements(created_by);
create index if not exists digest_delivery_logs_business_id_idx on public.digest_delivery_logs(business_id);
create index if not exists expenses_created_by_idx on public.expenses(created_by);
create index if not exists inventory_movements_created_by_idx on public.inventory_movements(created_by);
create index if not exists inventory_movements_product_business_idx on public.inventory_movements(product_id,business_id);
create index if not exists invoice_items_invoice_business_idx on public.invoice_items(invoice_id,business_id);
create index if not exists invoice_items_product_business_idx on public.invoice_items(product_id,business_id);
create index if not exists invoices_created_by_idx on public.invoices(created_by);
create index if not exists journal_entries_posted_by_idx on public.journal_entries(posted_by);
create index if not exists journal_lines_entry_business_idx on public.journal_lines(journal_entry_id,business_id);
create index if not exists payments_created_by_idx on public.payments(created_by);
create index if not exists products_supplier_business_idx on public.products(supplier_id,business_id);
create index if not exists purchase_order_items_order_business_idx on public.purchase_order_items(purchase_order_id,business_id);
create index if not exists purchase_order_items_product_business_idx on public.purchase_order_items(product_id,business_id);
create index if not exists purchase_orders_created_by_idx on public.purchase_orders(created_by);
create index if not exists purchase_orders_supplier_business_idx on public.purchase_orders(supplier_id,business_id);
create index if not exists unmatched_receipts_created_by_idx on public.unmatched_receipts(created_by);
create index if not exists unmatched_receipts_invoice_business_idx on public.unmatched_receipts(matched_invoice_id,business_id);
alter policy profiles_select_self on public.profiles using (id=(select auth.uid()));
alter policy profiles_insert_self on public.profiles with check (id=(select auth.uid()));
alter policy profiles_update_self on public.profiles using (id=(select auth.uid())) with check (id=(select auth.uid()));
alter policy business_members_update_owner on public.business_members
  using ((user_id<>(select auth.uid())) and (role<>'owner') and app_private.has_business_role(business_id,array['owner']::text[]))
  with check ((user_id<>(select auth.uid())) and (role<>'owner') and app_private.has_business_role(business_id,array['owner']::text[]));
alter policy business_members_delete_owner_or_manager on public.business_members
  using ((user_id<>(select auth.uid())) and (role<>'owner') and (app_private.has_business_role(business_id,array['owner']::text[]) or (app_private.has_business_role(business_id,array['manager']::text[]) and role=any(array['sales','inventory','finance']::text[]))));
commit;