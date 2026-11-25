import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  Activity, AlertTriangle, ArrowDownLeft, ArrowRight, ArrowUpRight, BarChart3, BookOpen, Eye, EyeOff,
  Bell, Boxes, CalendarDays, Check, CheckCircle2, ChevronDown,
  ChevronRight, CircleDollarSign, Clock3, Download,
  FileCheck2, FileSpreadsheet, FileText, Filter, LayoutDashboard, Link2, MessageCircle, Moon, Sun,
  Menu, MoreHorizontal, Mic, Minus, Package, PanelLeftClose, Plus, Receipt,
  Search, Send, Settings, ShieldCheck, ShoppingCart, Smartphone,
  Store, TrendingDown, TrendingUp, Truck, Wallet, X, LogOut,
  type LucideIcon,
} from 'lucide-react';
import { allocateIncomingPayment, buildJournalPair, buildTrialBalance, calculateGrossProfit, isJournalBalanced, isTrialBalanceBalanced, outstandingBalance, planPurchaseReceipt, weightedAverageUnitCost } from './finance';
import { addBusinessDays, businessDate, formatBusinessDate, formatBusinessDateTime, formatBusinessDay } from './business-time';
import { makePublicDemoData } from './demo-data';
import { createXlsxWorkbook } from './xlsx';
const EMPTY_WORKSPACE_DATA: AppData = {
  profile: {
    name: 'Your business', legalName: '', owner: '', email: '', phone: '',
    location: '', currency: 'KES', taxPin: '', industry: 'Other',
  },
  products: [], invoices: [], payments: [], unmatchedReceipts: [], expenses: [],
  cashMovements: [], inventoryMovements: [], suppliers: [], purchaseOrders: [], teamMembers: [], teamInvitations: [], journal: [],
  events: [], openingBalances: { cash: 0, mpesa: 0, bank: 0, inventory: 0 },
  nextInvoice: 1001, nextPurchaseOrder: 1,
};
import {
  acceptCloudBusinessInvitation, adjustCloudStock, createBusiness, createCloudProduct, createCloudSupplier, createCloudBusinessInvitation,
  createCloudPurchaseOrder, getBusinessSettings, getCloudWorkspace,
  listMyBusinesses, postCloudExpense, postCloudPayment, postCloudSaleWithType,
  postCloudSupplierPayment, postCloudUnmatchedReceipt, matchCloudUnmatchedReceipt, receiveCloudPurchaseOrder, restoreCloudSession,
  saveBusinessPreferences, saveCloudBusinessProfile, saveCloudWhatsAppDestination, updateCloudBusinessMember, revokeCloudBusinessInvitation,
  sendPasswordRecoveryEmail, signInWithPassword, signOut, signUpWithPassword, updatePasswordFromRecovery,
  type SignUpInput, type SupabaseUser,
} from './lib/supabase';
import type {
  AppData, BusinessProfile, Invoice, InvoiceStatus, ModuleKey, NewInvoiceInput, SaleType,
  NewPaymentInput, NewPurchaseInput, NewUnmatchedReceiptInput, Payment, PaymentChannel, Product,
  PurchaseOrder, ReceiptRail, Supplier, TeamInvitation, TeamMember, TeamRole, UnmatchedReceipt,
} from './types';

type Notice = { title: string; detail?: string } | null;
type DialogState =
  | { kind: 'sale' }
  | { kind: 'stk'; invoiceId?: string }
  | { kind: 'receipt' }
  | { kind: 'match-receipt'; receiptId: string }
  | { kind: 'expense' }
  | { kind: 'product'; returnToPurchase?: boolean }
  | { kind: 'supplier'; returnToPurchase?: boolean }
  | { kind: 'purchase'; productId?: string; quantity?: number }
  | { kind: 'receive-purchase'; purchaseOrderId: string }
  | { kind: 'invoice'; invoiceId: string }
  | { kind: 'supplier-payment'; supplierId: string }
  | { kind: 'adjust'; productId: string }
  | { kind: 'stock-picker' }
  | { kind: 'stock-actions' }
  | { kind: 'stock-add' }
  | { kind: 'stock-remove' }
  | { kind: 'profile' }
  | null;

const NAV_GROUPS: Array<{ title: string; items: Array<{ id: ModuleKey; label: string; icon: LucideIcon }> }> = [
  { title: 'WORKSPACE', items: [
    { id: 'overview', label: 'Home', icon: LayoutDashboard },
    { id: 'sales', label: 'Sales', icon: Receipt },
    { id: 'payments', label: 'Payments', icon: Wallet },
    { id: 'inventory', label: 'Stock', icon: Package },
    { id: 'more', label: 'More', icon: MoreHorizontal },
  ] },
];

const moduleMeta: Record<ModuleKey, { title: string; description: string }> = {
  overview: { title: 'Business overview', description: 'A live view of the money, stock and obligations moving through your business.' },
  sales: { title: 'Sales & invoices', description: 'Every sale, invoice and outstanding customer balance in one register.' },
  payments: { title: 'Payments', description: 'See what customers have paid and what still needs attention.' },
  inventory: { title: 'Inventory', description: 'Know what is on hand, what is moving and what needs to be reordered.' },
  procurement: { title: 'Purchasing', description: 'Replenish stock, manage suppliers and follow deliveries.' },
  accounts: { title: 'Financials', description: 'Understand cash, customer balances, supplier commitments and profit.' },
  reports: { title: 'Reports', description: 'Understand trading performance, cash movement and working capital.' },
  integrations: { title: 'Sales channels', description: 'Bring in-store, online and wholesale orders into one business view.' },
  settings: { title: 'Team & settings', description: 'Manage your business profile and the people who run it.' },
  more: { title: 'More', description: 'Supplier orders, reports, financial records and workspace preferences.' },

};

const roleAccess: Record<TeamRole, ModuleKey[]> = {
  Owner: ['overview', 'sales', 'payments', 'inventory', 'procurement', 'accounts', 'reports', 'integrations', 'settings', 'more'],
  Manager: ['overview', 'sales', 'payments', 'inventory', 'procurement', 'accounts', 'reports', 'integrations', 'settings', 'more'],
  Sales: ['overview', 'sales', 'payments', 'reports', 'more'],
  Inventory: ['overview', 'inventory', 'procurement', 'more'],
  Finance: ['overview', 'sales', 'payments', 'accounts', 'reports', 'more'],
};

const money = (value: number) => new Intl.NumberFormat('en-KE', {
  style: 'currency', currency: 'KES', maximumFractionDigits: 0,
}).format(Math.round(value || 0)).replace('KES', 'KSh');

const numberText = (value: number) => new Intl.NumberFormat('en-KE', { maximumFractionDigits: 0 }).format(value || 0);
const dateKey = businessDate;
const today = () => businessDate(new Date());
const addDays = addBusinessDays;
const dateLabel = (value: string) => formatBusinessDate(value);
const dateTimeLabel = (value: string) => formatBusinessDateTime(value);
const makeId = (prefix: string) => prefix + '-' + Math.random().toString(36).slice(2, 9).toUpperCase();
const channelLabel = (channel: PaymentChannel) => ({
  mpesa: 'M-Pesa', cash: 'Cash', bank: 'Bank transfer', card: 'Card', credit: 'On credit',
}[channel]);
const saleTypeLabel = (saleType: SaleType = 'walk_in') => ({ walk_in: 'Walk-in', pay_on_delivery: 'Pay on delivery', credit: 'Customer credit', enquiry: 'Enquiry / quote' }[saleType]);
const statusLabel = (status: InvoiceStatus) => ({
  draft: 'Draft', sent: 'Awaiting payment', partial: 'Part paid', paid: 'Paid', overdue: 'Overdue',
}[status]);
const statusClass = (status: string) => 'status-pill status-' + (status === 'succeeded' || status === 'received' ? 'delivered' : status === 'reversed' ? 'failed' : status.replaceAll('_', '-'));
const channelClass = (channel: PaymentChannel) => 'channel-badge channel-' + channel;
const shortRef = (value: string) => value.length > 15 ? value.slice(0, 13) + '…' : value;
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const invoiceBalance = (invoice: Invoice) => outstandingBalance(invoice.total, invoice.paid);
const productValue = (product: Product) => product.quantity * product.costPrice;
const marginValue = (invoice: Invoice) => calculateGrossProfit(invoice.lines, invoice.discount);
const sourceLabel = (source: Invoice['source']) => ({
  hesabu: 'Hesabu', website: 'Website', pos: 'Point of sale', manual: 'Manual',
}[source]);

function Button({
  children, onClick, variant = 'primary', size = 'md', disabled = false, className = '', type = 'button', block = false,
}: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg'; disabled?: boolean; className?: string; type?: 'button' | 'submit'; block?: boolean;
}) {
  return <button type={type} onClick={onClick} disabled={disabled} className={'btn btn-' + variant + ' btn-' + size + ' ' + className + (block ? ' btn-block' : '')}>
    {children}
  </button>;
}

function IconButton({ children, onClick, label, className = '' }: {
  children: ReactNode; onClick?: () => void; label: string; className?: string;
}) {
  return <button type="button" onClick={onClick} aria-label={label} title={label} className={'icon-button ' + className}>{children}</button>;
}

function Field({
  label, value, onChange, placeholder, type = 'text', required = false, min, step, hint, disabled = false,
}: {
  label: string; value: string | number; onChange: (value: string) => void;
  placeholder?: string; type?: string; required?: boolean; min?: number; step?: number;
  hint?: string; disabled?: boolean;
}) {
  return <label className="field">
    <span className="field-label">{label}</span>
    <input className="field-input" value={value} type={type} onChange={event => onChange(event.target.value)}
      placeholder={placeholder} required={required} min={min} step={step} disabled={disabled} />
    {hint && <span className="field-hint">{hint}</span>}
  </label>;
}

function SelectField({ label, value, onChange, options, hint }: {
  label: string; value: string; onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>; hint?: string;
}) {
  return <label className="field">
    <span className="field-label">{label}</span>
    <select className="field-input" value={value} onChange={event => onChange(event.target.value)}>
      {options.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}
    </select>
    {hint && <span className="field-hint">{hint}</span>}
  </label>;
}

function Modal({ title, detail, children, onClose, size = 'md' }: {
  title: string; detail?: string; children: ReactNode; onClose: () => void; size?: 'md' | 'lg';
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    document.body.classList.add('modal-open');
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      document.body.classList.remove('modal-open');
    };
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={event => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <section className={'modal modal-' + size} role="dialog" aria-modal="true" aria-label={title}>
      <header className="modal-header">
        <div>
          <h2>{title}</h2>
          {detail && <p>{detail}</p>}
        </div>
        <IconButton label="Close dialog" onClick={onClose}><X size={18} /></IconButton>
      </header>
      {children}
    </section>
  </div>;
}

function PageHeader({ eyebrow, title, description, actions }: {
  eyebrow?: string; title: string; description: string; actions?: ReactNode;
}) {
  return <div className="page-header">
    <div className="page-header-copy">
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
    {actions && <div className="page-actions">{actions}</div>}
  </div>;
}

function MetricCard({ label, value, note, trend }: {
  label: string; value: string; note: string; icon: LucideIcon;
  tone?: 'green' | 'blue' | 'amber' | 'slate'; trend?: string;
}) {
  return <div className="metric-card">
    <div className="metric-top"><span>{label}</span></div>
    <div className="metric-value">{value}</div>
    <div className="metric-foot">
      <span>{note}</span>
      {trend && <span className="metric-trend"><TrendingUp size={12} /> {trend}</span>}
    </div>
  </div>;
}

function StatusPill({ children, status }: { children: ReactNode; status: string }) {
  return <span className={statusClass(status)}><span className="status-dot" />{children}</span>;
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return <div className="empty-state">
    
    <strong>{title}</strong>
    <p>{body}</p>
    {action && <div className="empty-state-action">{action}</div>}
  </div>;
}

function DataTable({ children, headers, className = '' }: {
  children: ReactNode; headers: string[]; className?: string;
}) {
  return <div className={'table-scroll ' + className}>
    <table className="data-table">
      <thead><tr>{headers.map(header => <th key={header}>{header}</th>)}</tr></thead>
      <tbody>{children}</tbody>
    </table>
  </div>;
}

function SectionCard({ title, detail, action, children, className = '' }: {
  title: string; detail?: string; action?: ReactNode; children: ReactNode; className?: string;
}) {
  return <section className={'surface-card ' + className}>
    <div className="surface-card-header">
      <div><h2>{title}</h2>{detail && <p>{detail}</p>}</div>
      {action && <div>{action}</div>}
    </div>
    {children}
  </section>;
}

function MiniBars({ values, labels }: { values: number[]; labels: string[] }) {
  const maximum = Math.max(1, ...values);
  return <div className="mini-bars">
    {values.map((value, index) => <div className="mini-bar-col" key={labels[index]}>
      <div className="mini-bar-track">
        <div className="mini-bar" style={{ height: Math.max(3, (value / maximum) * 100) + '%' }} />
      </div>
      <span>{labels[index]}</span>
    </div>)}
  </div>;
}

function Initials({ name }: { name: string }) {
  const letters = name.split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  return <span className="avatar">{letters || 'H'}</span>;
}

function SaleDialog({ products, onClose, onCreate, onAddProduct, cloudMode }: {
  products: Product[]; onClose: () => void; onCreate: (input: NewInvoiceInput) => void;
  onAddProduct: () => void; cloudMode: boolean;
}) {
  const [customer, setCustomer] = useState('Walk-in customer');
  const [dueDate, setDueDate] = useState(addDays(today(), 7));
  const [discount, setDiscount] = useState('0');
  const [channel, setChannel] = useState<PaymentChannel>('mpesa');
  const [saleType, setSaleType] = useState<SaleType>('walk_in');
  const [source, setSource] = useState<Invoice['source']>('pos');
  const [searchTerm, setSearchTerm] = useState('');
  const [items, setItems] = useState<Array<{ productId: string; quantity: string }>>([]);
  const [formError, setFormError] = useState('');
  const productFor = (id: string) => products.find(product => product.id === id);
  const subtotal = sum(items.map(item => (productFor(item.productId)?.sellingPrice || 0) * (Number(item.quantity) || 0)));
  const discountValue = Math.max(0, Number(discount) || 0);
  const total = Math.max(0, subtotal - discountValue);
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const productResults = products
    .filter(product => !normalizedSearch || (product.name + ' ' + product.sku + ' ' + product.category).toLowerCase().includes(normalizedSearch))
    .slice(0, normalizedSearch ? 12 : 6);
  const itemCount = items.reduce((count, item) => count + (Number(item.quantity) || 0), 0);

  const addProduct = (product: Product) => {
    if (saleType !== 'enquiry' && product.quantity <= 0) return;
    setItems(current => {
      const existing = current.find(item => item.productId === product.id);
      if (!existing) return [...current, { productId: product.id, quantity: '1' }];
      return current.map(item => {
        if (item.productId !== product.id) return item;
        const nextQuantity = (Number(item.quantity) || 0) + 1;
        return { ...item, quantity: String(saleType === 'enquiry' ? nextQuantity : Math.min(product.quantity, nextQuantity)) };
      });
    });
    setSearchTerm('');
    setFormError('');
  };
  const updateQuantity = (productId: string, quantity: string) => {
    setItems(current => current.map(item => item.productId === productId ? { ...item, quantity } : item));
    setFormError('');
  };
  const stepQuantity = (productId: string, change: number) => {
    const product = productFor(productId);
    if (!product) return;
    setItems(current => current.map(item => {
      if (item.productId !== productId) return item;
      const next = Math.max(1, (Number(item.quantity) || 0) + change);
      return { ...item, quantity: String(saleType === 'enquiry' ? next : Math.min(product.quantity, next)) };
    }));
    setFormError('');
  };
  const removeProduct = (productId: string) => setItems(current => current.filter(item => item.productId !== productId));

  const changeSaleType = (value: string) => {
    const nextType = value as SaleType;
    setSaleType(nextType);
    if (nextType === 'walk_in') setChannel(current => current === 'credit' ? 'mpesa' : current);
    else setChannel('credit');
    setFormError('');
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const validItems = items.map(item => ({ productId: item.productId, quantity: Number(item.quantity) }));
    if (!validItems.length) {
      setFormError('Search for a product and add it to the sale first.');
      return;
    }
    if (validItems.some(item => !Number.isFinite(item.quantity) || item.quantity <= 0)) {
      setFormError('Enter a quantity of at least 1 for every item.');
      return;
    }
    if (discountValue > subtotal) {
      setFormError('Discount cannot be greater than the sale subtotal.');
      return;
    }
    if (saleType !== 'enquiry') {
      for (const item of validItems) {
        const product = productFor(item.productId);
        if (!product || item.quantity > product.quantity) {
          setFormError(product
            ? 'Only ' + numberText(product.quantity) + ' ' + product.unit + ' of ' + product.name + ' are available.'
            : 'One of the selected products is no longer available.');
          return;
        }
      }
    }
    if (saleType === 'walk_in' && total <= 0) {
      setFormError('Enter a sale amount greater than zero.');
      return;
    }
    onCreate({
      customer: customer.trim() || 'Walk-in customer',
      phone: '',
      dueDate: saleType === 'enquiry' ? '' : dueDate,
      discount: discountValue,
      channel: saleType === 'walk_in' ? channel : 'credit',
      saleType,
      items: validItems,
      source,
    });
  };

  return <Modal title={saleType === 'enquiry' ? 'Save an enquiry' : 'Record a sale'} detail={saleType === 'enquiry'
    ? 'Prepare a quote without recording income, deducting stock or changing customer balances.'
    : 'Add items, then record payment or leave a balance due.'} onClose={onClose} size="lg">
    <form className="modal-body sale-entry-form" onSubmit={submit}>
      <Field label="Customer or account (optional)" value={customer} onChange={setCustomer} placeholder="Walk-in customer" />
      <div className="field-hint">A phone number is not required to record a sale.</div>

      <div className="sale-type-row">
        <SelectField label="Transaction type" value={saleType} onChange={changeSaleType} options={[
          { value: 'walk_in', label: 'Walk-in sale' },
          { value: 'pay_on_delivery', label: 'Pay on delivery' },
          { value: 'credit', label: 'Customer credit / debt' },
          { value: 'enquiry', label: 'Enquiry / quote only' },
        ]} />
        <div className="sale-type-explainer">
          {saleType === 'walk_in' && 'Payment is recorded now using the method selected below.'}
          {saleType === 'pay_on_delivery' && 'The sale and stock are recorded now. Payment remains outstanding until delivery.'}
          {saleType === 'credit' && 'Record the sale and stock now. The customer balance remains unpaid.'}
          {saleType === 'enquiry' && 'Saves a draft quote only. No income, stock movement or receivable is recorded.'}
        </div>
      </div>

      {products.length === 0 ? <div className="sale-inventory-required">
        <span className="sale-inventory-icon"><Package size={22} /></span>
        <strong>Your product list is empty</strong>
        <p>Add the products you sell and enter the quantity you have. Hesabu will then use those stock levels when you record sales.</p>
        <Button onClick={onAddProduct}><Plus size={15} /> Add your first product</Button>
        <small>You can save a product with zero stock, but it cannot be sold until stock is added.</small>
      </div> : <>
      <div className="sale-picker-heading">
        <div><strong>Find items</strong><small>{products.length} products in your catalogue</small></div>
        <span>{itemCount} {itemCount === 1 ? 'unit' : 'units'} in basket</span>
      </div>
      <label className="field sale-product-search">
        <span className="field-label">Search by product name, SKU or category</span>
        <span className="sale-search-input-wrap"><Search size={16} /><input autoFocus className="field-input" value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="e.g. bread, sugar, BAK-003…" /></span>
      </label>
      <div className="sale-product-results" aria-label="Matching products">
        {productResults.length ? productResults.map(product => {
          const alreadyAdded = items.some(item => item.productId === product.id);
          const unavailable = saleType !== 'enquiry' && product.quantity <= 0;
          return <button type="button" className="sale-product-result" key={product.id} onClick={() => addProduct(product)} disabled={unavailable}>
            <span className="sale-product-result-main"><strong>{product.name}</strong><small>{product.sku || product.category} · {numberText(product.quantity)} {product.unit} available</small></span>
            <span className="sale-product-result-price">{money(product.sellingPrice)}</span>
            <span className="sale-product-result-add" aria-hidden="true">{alreadyAdded ? '+' : 'Add'}</span>
          </button>;
        }) : <div className="sale-product-empty">No matching products. Check the spelling or SKU.</div>}
      </div>
      </>}

      <div className="sale-cart-heading"><strong>Sale basket</strong><span>{items.length} {items.length === 1 ? 'item' : 'items'}</span></div>
      {items.length ? <div className="sale-cart-list">
        {items.map(item => {
          const product = productFor(item.productId);
          if (!product) return null;
          const quantity = Number(item.quantity) || 0;
          return <div className="sale-cart-row" key={item.productId}>
            <div className="sale-cart-product"><strong>{product.name}</strong><small>{money(product.sellingPrice)} per {product.unit} · {numberText(product.quantity)} in stock</small></div>
            <div className="sale-quantity-control">
              <button type="button" className="sale-quantity-step" aria-label={'Reduce ' + product.name + ' quantity'} onClick={() => stepQuantity(product.id, -1)} disabled={quantity <= 1}><Minus size={13} /></button>
              <input className="sale-quantity-input" type="number" min={1} step={1} inputMode="numeric" aria-label={product.name + ' quantity'} value={item.quantity} onChange={event => updateQuantity(product.id, event.target.value)} />
              <button type="button" className="sale-quantity-step" aria-label={'Increase ' + product.name + ' quantity'} onClick={() => stepQuantity(product.id, 1)} disabled={saleType !== 'enquiry' && quantity >= product.quantity}><Plus size={13} /></button>
            </div>
            <strong className="sale-cart-line-total">{money(product.sellingPrice * quantity)}</strong>
            <button type="button" className="sale-cart-remove" aria-label={'Remove ' + product.name} onClick={() => removeProduct(product.id)}><X size={15} /></button>
          </div>;
        })}
      </div> : <div className="sale-cart-empty">Search the catalogue and tap an item to add it here. Selecting an item again increases its quantity.</div>}

      {formError && <div className="sale-form-error" role="alert">{formError}</div>}
      <div className="form-grid form-grid-two">
        <Field label="Discount (KSh)" type="number" min={0} value={discount} onChange={value => { setDiscount(value); setFormError(''); }} />
        {saleType === 'walk_in'
          ? <SelectField label="Payment received through" value={channel} onChange={value => setChannel(value as PaymentChannel)} options={[
            { value: 'mpesa', label: 'M-Pesa received' }, { value: 'cash', label: 'Cash received' },
            { value: 'bank', label: 'Bank transfer received' }, { value: 'card', label: 'Card payment received' },
          ]} />
          : saleType !== 'enquiry'
            ? <Field label="Expected payment date" type="date" value={dueDate} onChange={setDueDate} />
            : <div className="sale-enquiry-note">No payment is requested or recorded for an enquiry.</div>}
      </div>
      <SelectField label="Recorded through" value={source} onChange={value => setSource(value as Invoice['source'])} options={cloudMode
        ? [{ value: 'pos', label: 'Shop counter / POS' }, { value: 'manual', label: 'Manual entry' }]
        : [{ value: 'pos', label: 'Shop counter / POS' }, { value: 'website', label: 'Website' }, { value: 'hesabu', label: 'Hesabu checkout' }, { value: 'manual', label: 'Manual entry' }]} />

      <div className="dialog-total">
        <span><span>Items</span><strong>{items.length}</strong></span>
        <span><span>Subtotal</span><strong>{money(subtotal)}</strong></span>
        <span><span>Discount</span><strong>−{money(discountValue)}</strong></span>
        <span className="dialog-total-final"><span>{saleType === 'enquiry' ? 'Quote total' : saleType === 'walk_in' ? 'Paid now' : 'Amount outstanding'}</span><strong>{money(total)}</strong></span>
      </div>
      <div className="modal-footer">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={!items.length || total <= 0}><Check size={16} /> {saleType === 'enquiry' ? 'Save enquiry' : 'Post sale'}</Button>
      </div>
    </form>
  </Modal>;
}

function StkDialog({ invoices, initialInvoiceId, onClose, onCreate, cloudMode }: {
  invoices: Invoice[]; initialInvoiceId?: string; onClose: () => void;
  onCreate: (input: NewPaymentInput) => void; cloudMode: boolean;
}) {
  const outstandingInvoices = invoices.filter(invoice => invoice.status !== 'draft' && invoiceBalance(invoice) > 0);
  const [invoiceId, setInvoiceId] = useState(initialInvoiceId || outstandingInvoices[0]?.id || '');
  const invoice = outstandingInvoices.find(item => item.id === invoiceId);
  const [phone, setPhone] = useState(invoice?.phone || '');
  const [amount, setAmount] = useState(String(invoice ? invoiceBalance(invoice) : 0));
  const [channel, setChannel] = useState<Exclude<PaymentChannel, 'credit'>>('mpesa');
  const [reference, setReference] = useState('');
  const [idempotencyKey] = useState(() => 'manual-payment:' + makeId('IDEM'));
  const [demoStep, setDemoStep] = useState<'ready' | 'prompted' | 'approved' | 'declined'>('ready');
  useEffect(() => {
    const selected = outstandingInvoices.find(item => item.id === invoiceId);
    if (selected) {
      setAmount(String(invoiceBalance(selected)));
      setPhone(selected.phone || '');
      setDemoStep('ready');
    }
  }, [invoiceId]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = Number(amount);
    if (!invoice || value <= 0 || value > invoiceBalance(invoice)) return;
    onCreate({
      invoiceId, phone, amount: value, channel,
      origin: cloudMode ? 'manual' : 'daraja_demo',
      reference: reference.trim(),
      idempotencyKey,
    });
  };
  return <Modal
    title={cloudMode ? 'Record a payment' : 'Request a payment'}
    detail={cloudMode
      ? 'Record money already received against an outstanding customer sale. This does not initiate an M-Pesa STK prompt.'
      : 'Preview the sample payment request and follow-up flow.'}
    onClose={onClose}
  >
    <form className="modal-body" onSubmit={submit}>
      {outstandingInvoices.length === 0 ? <EmptyState title="No unpaid invoices" body="Create a sale with an outstanding balance before recording a payment." /> : <>
        {!cloudMode && <div className="demo-notice"><Smartphone size={17} /><span><strong>Sample payment request</strong><small>No real Safaricom request will be sent in this preview.</small></span></div>}
        <SelectField label="Invoice" value={invoiceId} onChange={setInvoiceId} options={outstandingInvoices.map(item => ({
          value: item.id, label: item.number + ' · ' + item.customer + ' · ' + money(invoiceBalance(item)),
        }))} />
        <div className="form-grid form-grid-two">
          <Field label="Customer phone" value={phone} onChange={setPhone} placeholder="07XX XXX XXX" />
          <Field label="Amount (KSh)" type="number" min={1} value={amount} onChange={setAmount} required />
        </div>
        {cloudMode && <>
          <SelectField label="Received through" value={channel} onChange={value => setChannel(value as Exclude<PaymentChannel, 'credit'>)} options={[
            { value: 'mpesa', label: 'M-Pesa already received' },
            { value: 'cash', label: 'Cash received' },
            { value: 'bank', label: 'Bank transfer received' },
            { value: 'card', label: 'Card payment received' },
          ]} />
          <Field label="Transaction / receipt reference (optional)" value={reference} onChange={setReference} placeholder="e.g. QTX8AB12CD" />
        </>}
        {invoice && <div className="balance-hint"><span>Unpaid invoice balance</span><strong>{money(invoiceBalance(invoice))}</strong></div>}
        {!cloudMode && invoice && <div className="stk-demo-panel">
          <div className="stk-demo-heading"><Smartphone size={17} /><span><strong>STK push training simulator</strong><small>Simulates the customer prompt. It never contacts Safaricom or updates this invoice.</small></span></div>
          {demoStep === 'ready' && <Button variant="outline" block onClick={() => setDemoStep('prompted')} disabled={!phone.trim() || Number(amount) <= 0 || !invoice || Number(amount) > invoiceBalance(invoice)}>Preview simulated STK prompt</Button>}
          {demoStep === 'prompted' && <div className="stk-demo-phone">
            <span>HESABU TRAINING SIMULATION</span>
            <strong>Pay {money(Number(amount) || 0)}?</strong>
            <small>Simulated request to {phone}. No message was sent to this number.</small>
            <div><Button size="sm" onClick={() => setDemoStep('approved')}>Simulate approval</Button><Button size="sm" variant="outline" onClick={() => setDemoStep('declined')}>Simulate decline</Button></div>
          </div>}
          {demoStep === 'approved' && <div className="stk-demo-result stk-demo-approved"><CheckCircle2 size={16} /><span><strong>Demo payment approved</strong><small>Training result only. No payment, cash balance or invoice was changed.</small></span></div>}
          {demoStep === 'declined' && <div className="stk-demo-result stk-demo-declined"><AlertTriangle size={16} /><span><strong>Demo payment declined</strong><small>Training result only. No payment record was created.</small></span></div>}
          {demoStep !== 'ready' && <Button size="sm" variant="ghost" onClick={() => setDemoStep('ready')}>Reset simulation</Button>}
        </div>}
        {!cloudMode && <div className="payment-flow-note">
          <span className="flow-step flow-step-active">1 <small>Request</small></span><span className="flow-line" />
          <span className="flow-step">2 <small>Customer PIN</small></span><span className="flow-line" />
          <span className="flow-step">3 <small>Callback</small></span><span className="flow-line" />
          <span className="flow-step">4 <small>Reconcile</small></span>
        </div>}
        <div className="modal-footer">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!invoice || Number(amount) <= 0 || Number(amount) > invoiceBalance(invoice)}>
            {cloudMode ? 'Save payment' : 'Create sample request'}
          </Button>
        </div>
      </>}
    </form>
  </Modal>;
}

function ExpenseDialog({ onClose, onCreate }: {
  onClose: () => void; onCreate: (expense: { category: string; description: string; amount: number; channel: 'cash' | 'mpesa' | 'bank' }) => void;
}) {
  const [category, setCategory] = useState('Operating costs');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [channel, setChannel] = useState<'cash' | 'mpesa' | 'bank'>('mpesa');
  return <Modal title="Record an expense" detail="Record the expense and the account it was paid from." onClose={onClose}>
    <form className="modal-body" onSubmit={event => {
      event.preventDefault();
      if (Number(amount) > 0 && description.trim()) onCreate({ category, description: description.trim(), amount: Number(amount), channel });
    }}>
      <SelectField label="Expense category" value={category} onChange={setCategory} options={[
        { value: 'Operating costs', label: 'Operating costs' }, { value: 'Rent', label: 'Rent' },
        { value: 'Utilities', label: 'Utilities' }, { value: 'Staff costs', label: 'Staff costs' },
        { value: 'Transport', label: 'Transport' }, { value: 'Repairs', label: 'Repairs' },
        { value: 'Other', label: 'Other' },
      ]} />
      <Field label="Description" value={description} onChange={setDescription} placeholder="What was this expense for?" required />
      <div className="form-grid form-grid-two">
        <Field label="Amount (KSh)" type="number" min={1} value={amount} onChange={setAmount} required />
        <SelectField label="Paid from" value={channel} onChange={value => setChannel(value as 'cash' | 'mpesa' | 'bank')} options={[
          { value: 'cash', label: 'Cash on hand' }, { value: 'mpesa', label: 'M-Pesa' }, { value: 'bank', label: 'Bank account' },
        ]} />
      </div>
      <div className="modal-footer"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!description.trim() || Number(amount) <= 0}>Save expense</Button></div>
    </form>
  </Modal>;
}

function ProductDialog({ onClose, onCreate }: {
  onClose: () => void; onCreate: (product: Omit<Product, 'id' | 'updatedAt'>) => void;
}) {
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState('General');
  const [unit, setUnit] = useState('piece');
  const [quantity, setQuantity] = useState('0');
  const [reorder, setReorder] = useState('5');
  const [cost, setCost] = useState('');
  const [price, setPrice] = useState('');
  return <Modal title="Add inventory item" detail="Create a product record with its current quantity and unit economics." onClose={onClose}>
    <form className="modal-body" onSubmit={event => {
      event.preventDefault();
      if (!name.trim() || Number(price) <= 0) return;
      onCreate({
        name: name.trim(), sku: sku.trim() || makeId('SKU'), category, unit,
        quantity: Math.max(0, Number(quantity) || 0), reorderLevel: Math.max(0, Number(reorder) || 0),
        costPrice: Math.max(0, Number(cost) || 0), sellingPrice: Number(price),
      });
    }}>
      <Field label="Product name" value={name} onChange={setName} placeholder="e.g. Long-grain rice 2kg" required />
      <div className="form-grid form-grid-two">
        <Field label="SKU / product code" value={sku} onChange={setSku} placeholder="Assigned if empty" />
        <Field label="Category" value={category} onChange={setCategory} placeholder="Food staples" />
      </div>
      <div className="form-grid form-grid-three">
        <Field label="Unit" value={unit} onChange={setUnit} placeholder="packet" required />
        <Field label="Opening quantity" type="number" min={0} value={quantity} onChange={setQuantity} />
        <Field label="Reorder at" type="number" min={0} value={reorder} onChange={setReorder} />
      </div>
      <div className="form-grid form-grid-two">
        <Field label="Cost price (KSh)" type="number" min={0} value={cost} onChange={setCost} required />
        <Field label="Selling price (KSh)" type="number" min={1} value={price} onChange={setPrice} required />
      </div>
      <div className="modal-footer"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!name.trim() || Number(price) <= 0}>Add item</Button></div>
    </form>
  </Modal>;
}

function PurchaseDialog({ suppliers, products, initialProductId, initialQuantity, onClose, onCreate, onAddSupplier, onAddProduct }: {
  suppliers: Supplier[]; products: Product[]; initialProductId?: string; initialQuantity?: number;
  onClose: () => void; onCreate: (input: NewPurchaseInput) => void;
  onAddSupplier: () => void; onAddProduct: () => void;
}) {
  const initialProduct = products.find(product => product.id === initialProductId) || products[0];
  const [supplierId, setSupplierId] = useState(suppliers.find(item => item.id === initialProduct?.supplierId)?.id || suppliers[0]?.id || '');
  const [expectedAt, setExpectedAt] = useState(addDays(today(), 2));
  const [items, setItems] = useState(() => initialProduct ? [{
    productId: initialProduct.id, quantity: String(Math.max(1, initialQuantity || 10)), unitCost: initialProduct.costPrice,
  }] : []);
  const updateItem = (index: number, patch: Partial<(typeof items)[number]>) => {
    setItems(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  };
  const addItem = () => {
    const product = products.find(candidate => !items.some(item => item.productId === candidate.id));
    if (product) setItems(current => [...current, { productId: product.id, quantity: '1', unitCost: product.costPrice }]);
  };
  const total = sum(items.map(item => (Number(item.quantity) || 0) * item.unitCost));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const valid = items.map(item => ({ ...item, quantity: Number(item.quantity) })).filter(item => item.productId && Number.isFinite(item.quantity) && item.quantity > 0 && item.unitCost > 0);
    if (supplierId && valid.length) onCreate({ supplierId, expectedAt, items: valid });
  };
  return <Modal title="Create purchase order" detail="Build a supplier order with multiple lines. Inventory and accounts payable update when goods are received." onClose={onClose} size="lg">
    <form className="modal-body" onSubmit={submit}>
      {suppliers.length ? <SelectField label="Supplier" value={supplierId} onChange={setSupplierId} options={suppliers.map(item => ({ value: item.id, label: item.name }))} /> :
        <div className="sale-inventory-required">
          <span className="sale-inventory-icon"><Store size={21} /></span>
          <strong>Add a supplier to continue</strong>
          <p>Hesabu needs a supplier record to track who supplied these goods and any amount you owe.</p>
          <Button type="button" onClick={onAddSupplier}><Plus size={15} /> Add supplier</Button>
        </div>}
      {products.length ? <>
      <div className="subsection-label">Order items</div>
      <div className="sale-items">
        {items.map((item, index) => {
          const selected = products.find(product => product.id === item.productId);
          const available = products.filter(product => product.id === item.productId || !items.some(other => other.productId === product.id));
          return <div className="purchase-item-row" key={index}>
            <label className="field purchase-product-field">
              <span className="field-label">Product</span>
              <select className="field-input" value={item.productId} onChange={event => {
                const product = products.find(candidate => candidate.id === event.target.value);
                if (product) updateItem(index, { productId: product.id, unitCost: product.costPrice });
              }}>
                {available.map(product => <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}
              </select>
            </label>
            <Field label="Qty" type="number" min={1} step={1} value={item.quantity} onChange={value => updateItem(index, { quantity: value })} />
            <Field label="Unit cost" type="number" min={1} value={item.unitCost} onChange={value => updateItem(index, { unitCost: Math.max(0, Number(value) || 0) })} />
            <div className="sale-line-total"><span>Line total</span><strong>{money(selected ? (Number(item.quantity) || 0) * item.unitCost : 0)}</strong></div>
            {items.length > 1 && <IconButton label="Remove item" onClick={() => setItems(current => current.filter((_, itemIndex) => itemIndex !== index))}><X size={15} /></IconButton>}
          </div>;
        })}
      </div>
      <div className="inline-form-actions">
        <Button type="button" variant="outline" size="sm" onClick={addItem} disabled={items.length >= products.length}><Plus size={14} /> Add another item</Button>
        <span className="field-hint">Each line retains its purchase cost for stock valuation.</span>
      </div>
      <Field label="Expected delivery date" type="date" value={expectedAt} onChange={setExpectedAt} />
      </> : <div className="sale-inventory-required">
        <span className="sale-inventory-icon"><Package size={21} /></span>
        <strong>Add products before ordering stock</strong>
        <p>Create the item first, including its unit, cost price and selling price. Then return here to order it.</p>
        <Button type="button" onClick={onAddProduct}><Plus size={15} /> Add product</Button>
      </div>}
      {products.length > 0 && <div className="dialog-total"><span className="dialog-total-final"><span>Purchase order total</span><strong>{money(total)}</strong></span></div>}
      <div className="modal-footer"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!suppliers.length || !supplierId || !products.length || !items.length || total <= 0}>Create purchase order</Button></div>
    </form>
  </Modal>;
}



function ReceivePurchaseDialog({ order, onClose, onReceive }: {
  order: PurchaseOrder;
  onClose: () => void;
  onReceive: (items: Array<{ productId: string; quantity: number }>) => void;
}) {
  const remainingLines = order.lines.filter(line => line.received < line.quantity);
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(remainingLines.map(line => [line.productId, String(line.quantity - line.received)])),
  );
  const receiptItems = remainingLines.map(line => ({
    productId: line.productId,
    quantity: Math.max(0, Number(quantities[line.productId] ?? 0) || 0),
  }));
  const total = remainingLines.reduce((value, line) =>
    value + Math.max(0, Number(quantities[line.productId] ?? 0) || 0) * line.unitCost, 0,
  );
  const invalid = remainingLines.some(line => {
    const value = Number(quantities[line.productId] ?? 0);
    return !Number.isFinite(value) || value < 0 || value > line.quantity - line.received;
  });
  const hasQuantity = receiptItems.some(item => item.quantity > 0);
  return <Modal title="Receive supplier delivery" detail={order.number + ' · ' + order.supplierName} onClose={onClose} size="lg">
    <form className="modal-body" onSubmit={event => {
      event.preventDefault();
      if (!invalid && hasQuantity) onReceive(receiptItems);
    }}>
      <div className="receipt-match-summary">
        <div><span className="field-label">Purchase order</span><strong>{order.number}</strong></div>
        <div><span className="field-label">Order value</span><strong>{money(order.total)}</strong></div>
        <div><span className="field-label">Already received</span><strong>{numberText(order.lines.reduce((sum, line) => sum + line.received, 0))}</strong></div>
        <div><span className="field-label">Outstanding</span><strong>{money(order.lines.reduce((sum, line) => sum + (line.quantity - line.received) * line.unitCost, 0))}</strong></div>
      </div>
      <div className="subsection-label">Quantities received in this delivery</div>
      <div className="receive-lines">
        {remainingLines.map(line => {
          const remaining = line.quantity - line.received;
          const entered = Math.max(0, Number(quantities[line.productId] ?? 0) || 0);
          return <div className="receive-line" key={line.productId}>
            <div className="receive-line-copy">
              <strong>{line.name}</strong>
              <small>{numberText(line.received)} received · {numberText(remaining)} outstanding · {money(line.unitCost)} per unit</small>
            </div>
            <Field label="Received now" type="number" min={0} step={0.01} value={quantities[line.productId] ?? '0'}
              onChange={value => setQuantities(current => ({ ...current, [line.productId]: value }))} />
            <div className="receive-line-total"><span>Value</span><strong>{money(entered * line.unitCost)}</strong></div>
          </div>;
        })}
      </div>
      <div className="inline-form-actions">
        <Button variant="outline" size="sm" onClick={() => setQuantities(Object.fromEntries(remainingLines.map(line => [line.productId, String(line.quantity - line.received)])))}>
          Receive all remaining
        </Button>
        <span className="field-hint">Only entered quantities will increase stock and supplier payables.</span>
      </div>
      {invalid && <div className="validation-note"><AlertTriangle size={14} /> A received quantity cannot exceed the outstanding quantity.</div>}
      <div className="dialog-total"><span className="dialog-total-final"><span>Value of this delivery</span><strong>{money(total)}</strong></span></div>
      <div className="modal-footer">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={invalid || !hasQuantity || total <= 0}><Check size={15} /> Post goods received</Button>
      </div>
    </form>
  </Modal>;
}

function InvoiceDialog({ invoice, onClose, onRequestPayment, cloudMode }: {
  invoice: Invoice; onClose: () => void; onRequestPayment: () => void; cloudMode: boolean;
}) {
  return <Modal title={invoice.number} detail={invoice.status === 'draft' ? 'Quote draft. This record does not create a debt or payment.' : 'Invoice record and settlement history.'} onClose={onClose} size="lg">
    <div className="modal-body">
      <div className="invoice-detail-top">
        <div><span className="field-label">{invoice.status === 'draft' ? 'Prepared for' : 'Bill to'}</span><strong>{invoice.customer}</strong><small>{invoice.phone || 'No phone recorded'}</small></div>
        <div className="invoice-detail-status"><StatusPill status={invoice.status}>{statusLabel(invoice.status)}</StatusPill><small>{invoice.status === 'draft' ? 'Prepared' : 'Issued'} {dateLabel(invoice.date)}</small></div>
      </div>
      <DataTable headers={['Item', 'Qty', 'Unit price', 'Amount']}>
        {invoice.lines.map(line => <tr key={line.productId}>
          <td><strong>{line.name}</strong><small className="cell-sub">{line.sku}</small></td>
          <td>{line.quantity}</td><td>{money(line.unitPrice)}</td><td className="amount-cell">{money(line.lineTotal)}</td>
        </tr>)}
      </DataTable>
      <div className="invoice-total-box">
        <div><span>Subtotal</span><strong>{money(invoice.subtotal)}</strong></div>
        <div><span>Discount</span><strong>−{money(invoice.discount)}</strong></div>
        <div className="grand-total"><span>{invoice.status === 'draft' ? 'Quote total' : 'Invoice total'}</span><strong>{money(invoice.total)}</strong></div>
        {invoice.status !== 'draft' && <><div><span>Paid to date</span><strong>{money(invoice.paid)}</strong></div>
        <div className="grand-total balance-total"><span>Balance due</span><strong>{money(invoiceBalance(invoice))}</strong></div></>}
      </div>
      <div className="invoice-detail-meta">
        <span>Transaction <strong>{saleTypeLabel(invoice.saleType)}</strong></span>
        <span>Source <strong>{sourceLabel(invoice.source)}</strong></span>
        {invoice.status !== 'draft' && <span>Payment terms <strong>{dateLabel(invoice.dueDate)}</strong></span>}
        {invoice.status !== 'draft' && <span>Preferred channel <strong>{channelLabel(invoice.channel)}</strong></span>}
      </div>
      <div className="modal-footer">
        <Button variant="ghost" onClick={onClose}>Close</Button>
        {invoice.status !== 'draft' && invoiceBalance(invoice) > 0 && <Button onClick={onRequestPayment}><Send size={15} /> {cloudMode ? 'Record payment' : 'Request balance'}</Button>}
      </div>
    </div>
  </Modal>;
}

function SupplierPaymentDialog({ supplier, onClose, onPay }: {
  supplier: Supplier; onClose: () => void; onPay: (amount: number, channel: Exclude<PaymentChannel, 'credit'>) => void;
}) {
  const [amount, setAmount] = useState(String(supplier.balance));
  const [channel, setChannel] = useState<Exclude<PaymentChannel, 'credit'>>('bank');
  return <Modal title="Record supplier payment" detail={supplier.name} onClose={onClose}>
    <form className="modal-body" onSubmit={event => {
      event.preventDefault();
      const value = Number(amount);
      if (value > 0 && value <= supplier.balance) onPay(value, channel);
    }}>
      <div className="balance-hint"><span>Outstanding supplier balance</span><strong>{money(supplier.balance)}</strong></div>
      <Field label="Payment amount (KSh)" type="number" min={1} value={amount} onChange={setAmount} />
      <SelectField label="Paid from" value={channel} onChange={value => setChannel(value as Exclude<PaymentChannel, 'credit'>)} options={[
        { value: 'bank', label: 'Bank account' }, { value: 'mpesa', label: 'M-Pesa' },
        { value: 'cash', label: 'Cash on hand' },
      ]} />
      <div className="field-hint">Choose the account the money was actually paid from.</div>
      <div className="modal-footer"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={Number(amount) <= 0 || Number(amount) > supplier.balance}>Record payment</Button></div>
    </form>
  </Modal>;
}


function ReceiptDialog({ onClose, onCreate }: {
  onClose: () => void; onCreate: (input: NewUnmatchedReceiptInput) => void;
}) {
  const [rail, setRail] = useState<ReceiptRail>('Till / PayBill');
  const [payer, setPayer] = useState('');
  const [phone, setPhone] = useState('');
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState('');
  return <Modal title="Record a payment received" detail="Capture a receipt that arrived without a clear invoice allocation. Match it after saving." onClose={onClose}>
    <form className="modal-body" onSubmit={event => {
      event.preventDefault();
      const value = Number(amount);
      if (value > 0 && reference.trim()) onCreate({
        rail, payer: payer.trim() || 'Unknown payer', phone: phone.trim(),
        reference: reference.trim().toUpperCase(), amount: value,
      });
    }}>
      <SelectField label="Received through" value={rail} onChange={value => setRail(value as ReceiptRail)} options={[
        { value: 'Till / PayBill', label: 'M-Pesa Till / PayBill' },
        { value: 'Pochi la Biashara', label: 'Pochi la Biashara' },
        { value: 'Send Money to business', label: 'Send Money to business phone' },
        { value: 'Bank transfer', label: 'Bank transfer' },
        { value: 'Manual M-Pesa receipt', label: 'Other M-Pesa receipt' },
      ]} />
      <div className="form-grid form-grid-two">
        <Field label="Receipt / transaction reference" value={reference} onChange={setReference} placeholder="e.g. QKH72F9M3" required />
        <Field label="Amount received (KSh)" type="number" min={1} value={amount} onChange={setAmount} required />
      </div>
      <div className="form-grid form-grid-two">
        <Field label="Payer name" value={payer} onChange={setPayer} placeholder="Name shown on the receipt" />
        <Field label="Payer phone" value={phone} onChange={setPhone} placeholder="07XX XXX XXX" />
      </div>
      <div className="demo-notice"><ShieldCheck size={16} /><span><strong>Manual receipt record</strong><small>This does not verify the payment with Safaricom or the bank. It records the reference you checked.</small></span></div>
      <div className="modal-footer">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={!reference.trim() || Number(amount) <= 0}><Plus size={15} /> Save receipt</Button>
      </div>
    </form>
  </Modal>;
}

function MatchReceiptDialog({ receipt, invoices, onClose, onMatch }: {
  receipt: UnmatchedReceipt; invoices: Invoice[]; onClose: () => void; onMatch: (invoiceId: string) => void;
}) {
  const eligible = invoices.filter(invoice => invoice.status !== 'draft' && invoiceBalance(invoice) > 0);
  const likely = eligible.find(invoice => invoice.customer.toLowerCase() === receipt.payer.toLowerCase());
  const [invoiceId, setInvoiceId] = useState(likely?.id || eligible[0]?.id || '');
  const invoice = eligible.find(item => item.id === invoiceId);
  const balance = invoice ? invoiceBalance(invoice) : 0;
  const excess = Math.max(0, receipt.amount - balance);
  return <Modal title="Match payment to invoice" detail="Apply the invoice portion and retain any excess as customer credit." onClose={onClose}>
    <div className="modal-body">
      <div className="receipt-match-summary">
        <div><span className="field-label">Amount received</span><strong>{money(receipt.amount)}</strong></div>
        <div><span className="field-label">Payer</span><strong>{receipt.payer}</strong></div>
        <div><span className="field-label">Receipt</span><strong className="mono-text">{receipt.reference}</strong></div>
        <div><span className="field-label">Rail</span><strong>{receipt.rail}</strong></div>
      </div>
      {eligible.length ? <>
        <SelectField label="Apply to invoice" value={invoiceId} onChange={setInvoiceId} options={eligible.map(item => ({
          value: item.id,
          label: item.number + ' · ' + item.customer + ' · balance ' + money(invoiceBalance(item)),
        }))} />
        {invoice && <div className="invoice-total-box">
          <div><span>Invoice balance</span><strong>{money(balance)}</strong></div>
          <div><span>Applied to invoice</span><strong>{money(Math.min(receipt.amount, balance))}</strong></div>
          <div className="grand-total balance-total"><span>Unapplied customer credit</span><strong>{money(excess)}</strong></div>
        </div>}
        {excess > 0 && <div className="demo-notice"><ShieldCheck size={16} /><span><strong>Excess amount will be retained</strong><small>The invoice will not be overpaid. The difference will be posted to customer advances for later allocation or refund.</small></span></div>}
        <div className="field-hint">This records an allocation from the receipt already captured. It does not verify the receipt with the payment provider.</div>
        <div className="modal-footer">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onMatch(invoiceId)} disabled={!invoiceId}><Check size={15} /> Confirm allocation</Button>
        </div>
      </> : <EmptyState title="No open invoice" body="There is no outstanding invoice to allocate this receipt against. Keep it in the queue until the correct customer invoice is available." />}
    </div>
  </Modal>;
}

function AdjustStockDialog({ product, onClose, onAdjust }: {
  product: Product; onClose: () => void; onAdjust: (quantity: number, reason: string) => void;
}) {
  const [quantity, setQuantity] = useState(String(product.quantity));
  const [reason, setReason] = useState('Stock count adjustment');
  const counted = Math.max(0, Number(quantity) || 0);
  const difference = counted - product.quantity;
  const valueImpact = Math.abs(difference * product.costPrice);
  return <Modal title="Count stock" detail={product.name} onClose={onClose}>
    <form className="modal-body" onSubmit={event => {
      event.preventDefault();
      const next = Number(quantity);
      if (Number.isFinite(next) && next >= 0) onAdjust(next, reason);
    }}>
      <div className="stock-count-summary">
        <div><span>Recorded</span><strong>{numberText(product.quantity)} {product.unit}</strong></div>
        <div><span>Counted</span><strong>{numberText(counted)} {product.unit}</strong></div>
        <div><span>Difference</span><strong className={difference < 0 ? 'negative-text' : difference > 0 ? 'positive-text' : ''}>{difference > 0 ? '+' : ''}{numberText(difference)} {product.unit}</strong></div>
        <div><span>Value difference</span><strong>{money(valueImpact)}</strong></div>
      </div>
      <Field label="Physical quantity counted" type="number" min={0} step={0.01} value={quantity} onChange={setQuantity} required />
      <SelectField label="Reason for difference" value={reason} onChange={setReason} options={[
        { value: 'Stock count adjustment', label: 'Routine stock count' },
        { value: 'Damaged or expired', label: 'Damaged or expired goods' },
        { value: 'Opening balance correction', label: 'Opening count correction' },
        { value: 'Other stock movement', label: 'Other stock movement' },
      ]} />
      <div className="field-hint">The new count is saved with its adjustment reason.</div>
      <div className="modal-footer"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit">Save stock count</Button></div>
    </form>
  </Modal>;
}

function StockPickerDialog({ products, onClose, onAdjust }: {
  products: Product[];
  onClose: () => void;
  onAdjust: (productId: string, quantity: number, reason: string) => void;
}) {
  const [productId, setProductId] = useState(products[0]?.id || '');
  const product = products.find(item => item.id === productId);
  const [quantity, setQuantity] = useState(String(products[0]?.quantity ?? 0));
  const [reason, setReason] = useState('Stock count adjustment');
  const counted = Math.max(0, Number(quantity) || 0);
  const difference = product ? counted - product.quantity : 0;
  const valueImpact = Math.abs(difference * (product?.costPrice || 0));
  return <Modal title="Update stock" detail="Choose the product and enter the quantity you have counted." onClose={onClose}>
    <form className="modal-body" onSubmit={event => {
      event.preventDefault();
      const next = Number(quantity);
      if (product && Number.isFinite(next) && next >= 0) onAdjust(product.id, next, reason);
    }}>
      <SelectField label="Product" value={productId} onChange={value => {
        setProductId(value);
        const selected = products.find(item => item.id === value);
        setQuantity(String(selected?.quantity ?? 0));
      }} options={products.map(item => ({
        value: item.id, label: item.name + ' · ' + numberText(item.quantity) + ' ' + item.unit,
      }))} />
      {product && <div className="stock-count-summary">
        <div><span>Recorded</span><strong>{numberText(product.quantity)} {product.unit}</strong></div>
        <div><span>Counted</span><strong>{numberText(counted)} {product.unit}</strong></div>
        <div><span>Difference</span><strong className={difference < 0 ? 'negative-text' : difference > 0 ? 'positive-text' : ''}>{difference > 0 ? '+' : ''}{numberText(difference)} {product.unit}</strong></div>
        <div><span>Value difference</span><strong>{money(valueImpact)}</strong></div>
      </div>}
      <Field label="Physical quantity counted" type="number" min={0} step={0.01} value={quantity} onChange={setQuantity} required />
      <SelectField label="Reason for difference" value={reason} onChange={setReason} options={[
        { value: 'Stock count adjustment', label: 'Routine stock count' },
        { value: 'Damaged or expired', label: 'Damaged or expired goods' },
        { value: 'Opening balance correction', label: 'Opening count correction' },
        { value: 'Other stock movement', label: 'Other stock movement' },
      ]} />
      <div className="modal-footer"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!product || !Number.isFinite(Number(quantity)) || Number(quantity) < 0}>Save stock update</Button></div>
    </form>
  </Modal>;
}

function StockActionsDialog({ products, onClose, onAddProduct, onAddStock, onUpdateStock, onRemoveStock }: {
  products: Product[]; onClose: () => void; onAddProduct: () => void;
  onAddStock: () => void; onUpdateStock: () => void; onRemoveStock: () => void;
}) {
  return <Modal title="Manage stock" detail="Choose what you want to do with the products in your shop." onClose={onClose}>
    <div className="modal-body stock-actions-menu">
      <button type="button" className="stock-action-option" onClick={onAddProduct}>
        <span><Plus size={18} /></span><div><strong>Add a product</strong><small>Create a new item in your inventory</small></div><ChevronRight size={16} />
      </button>
      <button type="button" className="stock-action-option" onClick={onAddStock} disabled={!products.length}>
        <span><Package size={18} /></span><div><strong>Receive stock</strong><small>Record supplier goods and update inventory value</small></div><ChevronRight size={16} />
      </button>
      <button type="button" className="stock-action-option" onClick={onUpdateStock} disabled={!products.length}>
        <span><Boxes size={18} /></span><div><strong>Count stock</strong><small>Set the quantity you physically have</small></div><ChevronRight size={16} />
      </button>
      <button type="button" className="stock-action-option" onClick={onRemoveStock} disabled={!products.length}>
        <span><Minus size={18} /></span><div><strong>Remove stock</strong><small>Record damaged, expired, missing or used items</small></div><ChevronRight size={16} />
      </button>
      {!products.length && <p className="muted-copy">Add your first product to enable stock movements.</p>}
    </div>
  </Modal>;
}

function StockMovementDialog({ products, mode, onClose, onSave }: {
  products: Product[]; mode: 'add' | 'remove'; onClose: () => void;
  onSave: (productId: string, nextQuantity: number, reason: string) => void;
}) {
  const [productId, setProductId] = useState(products[0]?.id || '');
  const product = products.find(item => item.id === productId);
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState(mode === 'add' ? 'New stock received' : 'Damaged or expired');
  const amount = Number(quantity);
  const valid = Boolean(product && Number.isFinite(amount) && amount > 0 && (mode === 'add' || amount <= product.quantity));
  return <Modal title={mode === 'add' ? 'Add stock' : 'Remove stock'} detail={mode === 'add'
    ? 'Enter the quantity received. This will be added to the current stock balance.'
    : 'Enter the quantity being removed. This will reduce the current stock balance.'} onClose={onClose}>
    <form className="modal-body" onSubmit={event => {
      event.preventDefault();
      if (!product || !valid) return;
      onSave(product.id, product.quantity + (mode === 'add' ? amount : -amount), reason);
    }}>
      <SelectField label="Product" value={productId} onChange={setProductId} options={products.map(item => ({
        value: item.id, label: item.name + ' · ' + numberText(item.quantity) + ' ' + item.unit + ' available',
      }))} />
      {product && <div className="stock-count-summary">
        <div><span>Current stock</span><strong>{numberText(product.quantity)} {product.unit}</strong></div>
        <div><span>After this movement</span><strong>{numberText(product.quantity + (mode === 'add' ? (Number.isFinite(amount) ? amount : 0) : -(Number.isFinite(amount) ? amount : 0)))} {product.unit}</strong></div>
      </div>}
      <Field label={mode === 'add' ? 'Quantity received' : 'Quantity to remove'} type="number" min={0.01} step={0.01} value={quantity} onChange={setQuantity} placeholder="Enter quantity" required />
      <SelectField label="Reason" value={reason} onChange={setReason} options={mode === 'add' ? [
        { value: 'New stock received', label: 'New stock received' },
        { value: 'Customer return', label: 'Customer return' },
        { value: 'Opening balance correction', label: 'Opening stock correction' },
        { value: 'Other stock movement', label: 'Other' },
      ] : [
        { value: 'Damaged or expired', label: 'Damaged or expired' },
        { value: 'Missing stock', label: 'Missing stock' },
        { value: 'Internal use', label: 'Used by the business' },
        { value: 'Other stock movement', label: 'Other' },
      ]} />
      {mode === 'remove' && product && Number.isFinite(amount) && amount > product.quantity && <div className="sale-form-error" role="alert">You cannot remove more than the {numberText(product.quantity)} {product.unit} currently in stock.</div>}
      <div className="modal-footer"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!valid}>{mode === 'add' ? 'Add stock' : 'Remove stock'}</Button></div>
    </form>
  </Modal>;
}

function HesabuMark({ className = '' }: { className?: string }) {
  return <svg className={'hesabu-quill-mark ' + className} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
    <path d="M9 8.5v23M31 8.5v23" fill="none" stroke="currentColor" strokeWidth="4.2" strokeLinecap="round" />
    <path d="M9 19.8h8.2M22.8 19.8H31" fill="none" stroke="currentColor" strokeWidth="4.2" strokeLinecap="round" />
    <path d="M17.2 13.5h5.6M17.2 26.2h5.6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" opacity=".72" />
    <circle cx="20" cy="19.8" r="2.1" fill="#c9dc72" />
  </svg>;
}

function PublicLandingPage({
  onSignIn, onCreateAccount, onTryDemo, onInstall, appInstalled,
}: {
  onSignIn: () => void;
  onCreateAccount: () => void;
  onTryDemo: () => void;
  onInstall: () => void;
  appInstalled: boolean;
}) {
  return <div className="public-site">
    <header className="public-header">
      <div className="public-header-inner">
        <a className="public-brand" href="#top" aria-label="Hesabu home">
          <span className="brand-mark"><HesabuMark /></span>
          <span>Hesabu</span>
        </a>
        <nav className="public-nav" aria-label="Main navigation">
          <a href="#product">Product</a>
          <a href="#how-it-works">How it works</a>
          <a href="#businesses">Who it serves</a>
          <a href="#trust">Your records</a>
        </nav>
        <div className="public-header-actions">
          {!appInstalled && <button type="button" className="public-install-action" onClick={onInstall}><Download size={14} /> Install</button>}
          <button type="button" className="public-demo-action" onClick={onTryDemo}>Try demo</button>
          <button type="button" className="public-signin" onClick={onSignIn}>Sign in</button>
          <button type="button" className="public-get-started" onClick={onCreateAccount}>Get started <ArrowRight size={15} /></button>
        </div>
      </div>
    </header>

    <main id="top">
      <section className="public-hero">
        <div className="public-hero-copy">
          <span className="public-eyebrow">BUSINESS RECORDS, BROUGHT TOGETHER</span>
          <h1>Know what is happening in your business.</h1>
          <p>Record sales, payments, stock and expenses in one place. See what came in, what went out and what needs attention.</p>
          <div className="public-hero-actions">
            <button type="button" className="public-primary-action" onClick={onTryDemo}>Try the interactive demo <ArrowRight size={16} /></button>
            <button type="button" className="public-explore-action" onClick={onCreateAccount}>Start with your business</button>
            <a className="public-explore-action" href="#product">Explore features</a>
          </div>
          <div className="public-hero-note"><ShieldCheck size={15} /> Designed around the everyday work of Kenyan businesses</div>
        </div>
        <div className="public-hero-visual public-photo-visual">
          <img src="/hesabu-shop-owner.webp" alt="A shop owner reviewing business records on her phone at the counter" width="800" height="450" fetchPriority="high" />
          <div className="public-photo-caption">
            <span>BUILT AROUND EVERYDAY BUSINESS</span>
            <strong>From the counter to a clearer picture.</strong>
          </div>
        </div>
      </section>

      <section className="public-value-section" id="product">
        <div className="public-section-intro">
          <span className="public-eyebrow">WHAT HESABU DOES</span>
          <h2>The important parts of the business, in one place.</h2>
          <p>See sales, collections, spending and follow-ups together.</p>
        </div>
        <div className="public-value-grid">
          <article><span className="public-value-number">01</span><h3>Sales and payments</h3><p>Record what was sold, how the customer paid and what remains outstanding.</p></article>
          <article><span className="public-value-number">02</span><h3>Stock and suppliers</h3><p>Track quantities, purchase orders, goods received and the cost of stock.</p></article>
          <article><span className="public-value-number">03</span><h3>Expenses and performance</h3><p>Understand daily costs, margins, cash movement and business activity.</p></article>
        </div>
      </section>

      <section className="public-workflow-section" id="how-it-works">
        <div className="public-section-intro">
          <span className="public-eyebrow">HOW IT FITS YOUR DAY</span>
          <h2>Record the work. Understand the result.</h2>
        </div>
        <div className="public-workflow">
          <div><span>1</span><strong>Capture daily activity</strong><p>Record a sale, receipt, expense or stock change.</p></div>
          <div><span>2</span><strong>Keep records connected</strong><p>Keep each entry connected to its products, customers and suppliers.</p></div>
          <div><span>3</span><strong>Review your business</strong><p>Review daily figures and prepare a summary for your team.</p></div>
        </div>
      </section>

      <section className="public-business-section" id="businesses">
        <div>
          <span className="public-eyebrow">BUILT FOR EVERYDAY OPERATIONS</span>
          <h2>Useful from the counter to the back office.</h2>
          <p>Hesabu is designed for shops, food businesses, wholesalers, distributors and service businesses that need clear daily records.</p>
        </div>
        <div className="public-business-list">
          <span>Retail and convenience shops</span>
          <span>Food, bakeries and hospitality</span>
          <span>Wholesale and distribution</span>
          <span>Service and production businesses</span>
        </div>
      </section>

      <section className="public-trust-section" id="trust">
        <div className="public-trust-mark"><ShieldCheck size={21} /></div>
        <div><span className="public-eyebrow">YOUR BUSINESS, YOUR RECORDS</span><h2>Clear access. Clear records. Clear decisions.</h2><p>Your workspace is private to your business. M-Pesa entries are recorded manually; live STK Push and automatic reconciliation are not yet available. Hesabu is not eTIMS-certified.</p></div>
        <button type="button" className="public-secondary-action" onClick={onCreateAccount}>Set up your workspace <ArrowRight size={15} /></button>
      </section>
    </main>

    <footer className="public-footer">
      <div className="public-footer-main">
        <div className="public-footer-brand">
          <a className="public-brand" href="#top"><span className="brand-mark"><HesabuMark /></span><span>hesabu<span>.</span></span></a>
          <p>Clear business records for the people who run the business every day.</p>
        </div>
        <div className="public-footer-group"><strong>Product</strong><a href="#product">Sales and payments</a><a href="#product">Stock and purchasing</a><a href="#product">Reports and digest</a></div>
        <div className="public-footer-group"><strong>Learn</strong><a href="#how-it-works">How it works</a><a href="#businesses">Who Hesabu serves</a><a href="#trust">Your records</a></div>
        <div className="public-footer-group"><strong>Your account</strong><button type="button" onClick={onSignIn}>Sign in</button><button type="button" onClick={onCreateAccount}>Create a business account</button></div>
      </div>
      <div className="public-footer-bottom"><span>© 2026 Hesabu. Built for business operations in Kenya.</span><span>Built for everyday business in Kenya.</span></div>
    </footer>
  </div>;
}

function AuthPage({
  onSignIn, onSignUp, onResetPassword, initialMessage, initialMode, initialEmail, onBack, inviteMode = false,
}: {
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (input: SignUpInput) => Promise<void>;
  onResetPassword: (email: string, password: string) => Promise<void>;
  initialMessage?: string;
  initialMode: 'signin' | 'signup' | 'reset';
  initialEmail?: string;
  onBack: () => void; inviteMode?: boolean;
}) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>(initialMode);
  const [signupStep, setSignupStep] = useState<1 | 2>(1);
  const [fullName, setFullName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [industry, setIndustry] = useState('Retail / shop');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(initialMessage ?? '');

  useEffect(() => {
    setMode(initialMode);
    setSignupStep(1);
    if (initialEmail) setEmail(initialEmail);
  }, [initialMode, initialEmail]);

  useEffect(() => {
    if (initialMessage) setMessage(initialMessage);
  }, [initialMessage]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      if (mode === 'signin') {
        await onSignIn(email, password);
      } else if (mode === 'reset') {
        await onResetPassword(email, password);
      } else {
        if (signupStep === 1 && !inviteMode) {
          if (!fullName.trim() || !email.trim() || password.length < 8) {
            setMessage('Enter your name, a valid email address and a password of at least 8 characters.');
            return;
          }
          setSignupStep(2);
          return;
        }
        if (!fullName.trim() || (!inviteMode && !businessName.trim())) {
          setMessage('Enter your name and business name to continue.');
          return;
        }
        await onSignUp({
          fullName, businessName: inviteMode ? '' : businessName, industry: inviteMode ? '' : industry, phone: inviteMode ? '' : phone, email, password,
          aiAssistantEnabled: false, whatsappDigestEnabled: false, whatsappRecipientPhone: '',
        });
        setMessage('Account created. Opening your business workspace…');
      }
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? String((error as Error & { code?: string }).code ?? '') : '';
      const status = error instanceof Error && 'status' in error ? Number((error as Error & { status?: number }).status ?? 0) : 0;
      if (code === 'user_already_exists') {
        setMode('signin');
        setMessage('An account may already exist for this email address. Try signing in instead.');
      } else if (code === 'invalid_credentials' || status === 400) {
        setMessage('The email or password is incorrect. Check both details and try again.');
      } else if (code === 'email_not_confirmed' || code === 'session_not_created' || code === 'account_setup_failed') {
        setMessage('We could not complete account setup. Please try again. If the problem continues, contact Hesabu support.');
      } else if (status === 0) {
        setMessage('Connection problem. Check your internet connection and try again.');
      } else {
        setMessage('We could not complete that request. Please check your details and try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return <main className="auth-page">
    <section className="auth-shell">
      <div className="auth-form-panel">
        <div className="auth-brand">
          <span className="brand-mark"><HesabuMark /></span>
          <span className="brand-text"><strong>hesabu<span>.</span></strong><small>BUSINESS WORKSPACE</small></span>
        </div>
        <button type="button" className="auth-back-button" onClick={onBack}><ChevronRight size={13} /> Back to Hesabu</button>
        <div className="auth-copy">
          <span className="auth-kicker">BUSINESS, IN BALANCE</span>
          <h1>{mode === 'reset' ? 'Choose a new password.' : inviteMode ? (mode === 'signin' ? 'Sign in to join your team.' : 'Create your team account.') : (mode === 'signin' ? 'Your business, clearly in view.' : 'Set up your Hesabu account.')}</h1>
          <p>{mode === 'reset' ? 'Enter the email address for your account and choose a new password.' : inviteMode ? 'Use the email address this invitation was sent to. Your access activates when you accept the invitation.' : 'Keep sales, payments, stock and expenses together in one workspace.'}</p>
        </div>
        {mode === 'signup' && !inviteMode && <div className="auth-step-indicator"><span className={signupStep === 1 ? 'current' : 'complete'}>1 <small>Account</small></span><i /><span className={signupStep === 2 ? 'current' : ''}>2 <small>Business</small></span></div>}
        {mode !== 'reset' && <div className="auth-tabs" role="tablist" aria-label="Account access">
          <button type="button" role="tab" aria-selected={mode === 'signin'} className={mode === 'signin' ? 'active' : ''} onClick={() => { setMode('signin'); setMessage(''); }}>Sign in</button>
          <button type="button" role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setSignupStep(1); setMessage(''); }}>Create account</button>
        </div>}
        <form className="auth-form" onSubmit={submit}>
          {mode === 'signup' && <>
            {inviteMode || signupStep === 1 ? <label className="auth-field"><span>Your full name</span><input autoComplete="name" value={fullName} onChange={event => setFullName(event.target.value)} placeholder="Your name" required /></label> : <>
              <label className="auth-field"><span>Business name</span><input autoComplete="organization" value={businessName} onChange={event => setBusinessName(event.target.value)} placeholder="e.g. Muriuki Stores" required /></label>
              <label className="auth-field"><span>Business type</span><select value={industry} onChange={event => setIndustry(event.target.value)}><option>Retail / shop</option><option>Food & hospitality</option><option>Wholesale / distribution</option><option>Services</option><option>Manufacturing / production</option><option>Other</option></select></label>
              <label className="auth-field"><span>Business phone <small>(optional)</small></span><input type="tel" autoComplete="tel" value={phone} onChange={event => setPhone(event.target.value)} placeholder="07XX XXX XXX" /></label>
            </>}
          </>}
          {(mode !== 'signup' || signupStep === 1 || inviteMode) && <label className="auth-field"><span>Email address</span><input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@business.com" required /></label>}
          {(mode !== 'signup' || signupStep === 1 || inviteMode) && <label className="auth-field"><span>{mode === 'reset' ? 'New password' : 'Password'}</span><span className="auth-password-wrap"><input type={showPassword ? 'text' : 'password'} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter your password" minLength={8} required /><button type="button" className="auth-password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>}
          {mode === 'signup' && !inviteMode && signupStep === 2 && <p className="auth-step-note">You can change these details later in business settings.</p>}
          {mode === 'signin' && <button type="button" className="auth-forgot-link" onClick={async () => { if (!email.trim()) { setMessage('Enter your email address first.'); return; } setBusy(true); setMessage(''); try { await sendPasswordRecoveryEmail(email); setMessage('If an account exists for that email, a password reset link has been sent. Check your inbox.'); } catch { setMessage('We could not send the reset email. Check the address and try again.'); } finally { setBusy(false); } }}>Forgot password?</button>}
          {mode === 'signup' && !inviteMode && signupStep === 2 && <button type="button" className="auth-forgot-link auth-step-back" onClick={() => { setSignupStep(1); setMessage(''); }}>Back to account details</button>}
          <Button type="submit" block disabled={busy}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'reset' ? 'Save new password' : signupStep === 1 && !inviteMode ? 'Continue' : 'Create account'} <ArrowRight size={15} /></Button>
          {mode === 'reset' && <button type="button" className="auth-forgot-link" onClick={() => { setMode('signin'); setMessage(''); }}>Back to sign in</button>}
        </form>
        {message && <p className="auth-message" role="status">{message}</p>}
        <p className="auth-footnote">{inviteMode ? "The invitation is single-use and tied to the invited email address." : "Your business records are stored in your secure Hesabu account and are separate from every other business."}</p>
      </div>
      <aside className="auth-aside">
        <div className="auth-aside-top"><span className="auth-aside-mark"><HesabuMark /></span><span>Hesabu workspace</span><span className="auth-live-label">BUSINESS OPERATIONS</span></div>
        <div className="auth-aside-copy">
          <span>ONE VIEW OF THE BUSINESS</span>
          <h2>One record for the work behind every sale.</h2>
          <p>See what was sold, what was paid and what needs follow-up.</p>
        </div>
        <div className="auth-preview-stack">
          <div className="auth-preview-row"><span className="auth-preview-icon"><TrendingUp size={17} /></span><span><strong>Sales & performance</strong><small>Daily totals, margin and trends</small></span><ChevronRight size={17} /></div>
          <div className="auth-preview-row"><span className="auth-preview-icon"><Package size={17} /></span><span><strong>Stock & purchasing</strong><small>Quantities, cost and reorder points</small></span><ChevronRight size={17} /></div>
          <div className="auth-preview-row"><span className="auth-preview-icon"><Wallet size={17} /></span><span><strong>Cash & customer balances</strong><small>See what came in and what is due</small></span><ChevronRight size={17} /></div>
        </div>
        <div className="auth-aside-footer"><span>Built for everyday business operations</span><span>Hesabu · Kenya</span></div>
      </aside>
    </section>
  </main>;
}

function getWorkspaceAnswer(data: AppData, question: string) {
  const query = question.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/ +/g, ' ').trim();
  const digest = getDailyDigest(data);
  const todayDate = today();
  const weekStart = addDays(todayDate, -6);
  const monthStart = todayDate.slice(0, 7) + '-01';
  const invoices = data.invoices.filter(item => item.status !== 'draft');
  const week = invoices.filter(item => item.date >= weekStart && item.date <= todayDate);
  const month = invoices.filter(item => item.date >= monthStart && item.date <= todayDate);
  const sales = (rows: Invoice[]) => sum(rows.map(item => item.total));
  const unpaid = invoices.filter(item => invoiceBalance(item) > 0);
  const unpaidTotal = sum(unpaid.map(invoiceBalance));
  const lowStock = data.products.filter(item => item.quantity <= item.reorderLevel);
  const outOfStock = data.products.filter(item => item.quantity <= 0);
  if (/^(hi|hello|hey|habari|sasa|good morning|good afternoon|good evening|help|what can you do)$/.test(query))
    return 'Hello. I’m Hesabu, your business-record assistant. I can explain sales, payments, customer balances, expenses, supplier balances, stock levels, best-selling products and gross profit using records saved in this workspace. Try asking: “How much did we sell this month?”';
  if (/stock|inventory|reorder|out of stock|product|slow mov/.test(query)) {
    const names = lowStock.slice(0, 5).map(item => item.name + ' (' + numberText(item.quantity) + ' ' + item.unit + ')');
    return 'There are ' + data.products.length + ' products recorded. ' + outOfStock.length + ' are out of stock and ' + lowStock.length + ' are at or below reorder level. ' + (names.length ? 'Needs attention: ' + names.join(', ') + '. ' : 'No products currently need restocking. ') + 'Stock value at cost is ' + money(sum(data.products.map(productValue))) + '.';
  }
  if (/owe|debt|receivable|unpaid|customer balance|who.*pay|outstanding|credit sale/.test(query)) {
    const names = unpaid.slice(0, 4).map(item => item.customer + ' (' + money(invoiceBalance(item)) + ')');
    return 'Customers owe ' + money(unpaidTotal) + ' across ' + unpaid.length + ' unpaid invoices. ' + (names.length ? 'Largest balances: ' + names.join(', ') + '.' : 'There are no unpaid customer invoices in the current records.');
  }
  if (/expense|spend|spent|cost today/.test(query)) {
    const monthExpenses = data.expenses.filter(item => item.date >= monthStart && item.date <= todayDate);
    return 'Expenses recorded today total ' + money(digest.expenseTotal) + '. Month-to-date operating expenses total ' + money(sum(monthExpenses.map(item => item.amount))) + '. Supplier payments are tracked separately.';
  }
  if (/supplier|vendor|payable|we owe/.test(query)) {
    const due = data.suppliers.filter(item => item.balance > 0).sort((a,b) => b.balance-a.balance);
    return 'There are ' + data.suppliers.length + ' suppliers recorded. Outstanding supplier balances total ' + money(sum(due.map(item => item.balance))) + '. ' + (due.length ? 'Largest balances: ' + due.slice(0,4).map(item => item.name + ' (' + money(item.balance) + ')').join(', ') + '.' : 'No supplier balances are currently outstanding.');
  }
  if (/best sell|top sell|popular|fast mov|most sold|best product/.test(query)) {
    const cutoff = addDays(todayDate, -29);
    const ranked = data.products.map(product => ({ product, units: sum(invoices.filter(invoice => invoice.date >= cutoff && invoice.date <= todayDate).flatMap(invoice => invoice.lines.filter(line => line.productId === product.id).map(line => line.quantity))) })).filter(item => item.units > 0).sort((a,b) => b.units-a.units).slice(0,5);
    return ranked.length ? 'Top products by units sold in the last 30 days: ' + ranked.map((item,index) => (index+1) + '. ' + item.product.name + ' — ' + numberText(item.units) + ' ' + item.product.unit).join('; ') + '.' : 'No product sales are recorded in the last 30 days, so I cannot rank best sellers yet.';
  }
  if (/profit|margin|gross/.test(query)) {
    const rows = /month|monthly/.test(query) ? month : week;
    return 'Estimated gross profit for ' + (/month|monthly/.test(query) ? 'this month' : 'the last 7 days') + ' is ' + money(sum(rows.map(item => calculateGrossProfit(item.lines, item.discount)))) + ' from ' + money(sales(rows)) + ' in recorded sales. This is before operating expenses, not net profit.';
  }
  if (/payment|cash received|collected|collection|mpesa|m pesa/.test(query))
    return 'Payments received today total ' + money(digest.receivedTotal) + '. There are ' + data.payments.filter(item => item.status === 'pending').length + ' pending payment records. Customer balances still outstanding total ' + money(unpaidTotal) + '.';
  if (/month|monthly/.test(query))
    return 'Month-to-date sales are ' + money(sales(month)) + ' across ' + month.length + ' invoices. Outstanding customer balances are ' + money(unpaidTotal) + '. Recorded expenses this month total ' + money(sum(data.expenses.filter(item => item.date >= monthStart && item.date <= todayDate).map(item => item.amount))) + '.';
  if (/week|weekly|last 7|seven day/.test(query))
    return 'Over the last 7 days, sales total ' + money(sales(week)) + ' across ' + week.length + ' invoices. Daily average: ' + money(sales(week)/7) + '. Gross profit: ' + money(sum(week.map(item => calculateGrossProfit(item.lines, item.discount)))) + '.';
  if (/today|daily|how are sales|sales doing|sales summary|revenue/.test(query))
    return 'Today: ' + money(digest.salesTotal) + ' in sales across ' + digest.sales.length + ' invoices. Payments received: ' + money(digest.receivedTotal) + '. Gross profit: ' + money(digest.grossProfit) + '. Seven-day daily sales average: ' + money(sales(week)/7) + '.';
  if (/invoice|customer/.test(query))
    return 'There are ' + invoices.length + ' recorded invoices. ' + unpaid.length + ' still have a balance, totalling ' + money(unpaidTotal) + '. Ask “Who still owes us?” for the largest balances.';
  return 'I can answer questions about sales today, this week or this month; payments received; customer balances; expenses; supplier balances; stock and reorder alerts; best-selling products; and gross profit. I use only records saved in this Hesabu workspace. Try one of the suggested questions.';
}
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
};

function FloatingAssistant({
  data, whatsappNumber, onWhatsAppNumberChange, onRecordSale, onRecordExpense, onUpdateStock, cloudMode, demoMode,
}: {
  data: AppData;
  cloudMode: boolean;
  demoMode: boolean;
  whatsappNumber: string;
  onWhatsAppNumberChange: (value: string) => void;
  onRecordSale: () => void;
  onRecordExpense: () => void;
  onUpdateStock: () => void;
}) {
  const [panel, setPanel] = useState<'assistant' | 'digest' | null>(null);
  const [question, setQuestion] = useState('');
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([]);
  const [digestError, setDigestError] = useState('');
  const digest = getDailyDigest(data);
  const ask = (value: string) => {
    const clean = value.trim();
    if (!clean) return;
    setMessages(current => [...current, { role: 'user', text: clean }, { role: 'assistant', text: getWorkspaceAnswer(data, clean) }]);
    setQuestion('');
  };
  const togglePanel = (next: 'assistant' | 'digest') => {
    setDigestError('');
    setPanel(current => current === next ? null : next);
  };
  const startVoiceCapture = () => {
    setVoiceError('');
    const speechWindow = window as Window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceError('Voice typing is not supported in this browser. Use your keyboard microphone or type your question.');
      return;
    }
    const recognition = new Recognition();
    recognition.lang = 'en-KE';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = event => {
      const transcript = Array.from(event.results).map(result => result[0]?.transcript || '').join(' ').trim();
      if (transcript) setQuestion(transcript);
    };
    recognition.onerror = () => {
      setVoiceListening(false);
      setVoiceError('Could not capture speech. Check microphone permission and try again.');
    };
    recognition.onend = () => setVoiceListening(false);
    setVoiceListening(true);
    try { recognition.start(); } catch {
      setVoiceListening(false);
      setVoiceError('Microphone is busy. Try again in a moment.');
    }
  };
  const shareDigest = () => {
    setDigestError('');
    if (demoMode) {
      setDigestError('External WhatsApp messages are disabled in the sample workspace.');
      return;
    }
    const destination = whatsappNumber || data.profile.phone;
    const normalized = normaliseWhatsAppNumber(destination);
    if (!normalized) {
      setDigestError('No valid recipient is saved. Add a WhatsApp number in More → Team & Settings → Preferences, then save it.');
      return;
    }
    setWhatsAppNumber(normalized);
    openDailyDigestWhatsApp(data, normalized, () => {
      setDigestError('Enter a valid WhatsApp number to prepare this summary.');
    });
  };
  const suggestions = ['How much did we sell today?', 'How are sales this month?', 'Which products need restocking?', 'Who still owes us?', 'What are our expenses?', 'What is our gross profit?'];
  return <>
    {panel === 'assistant' && <section className="assistant-drawer" role="dialog" aria-modal="false" aria-label="Hesabu">
      <header className="assistant-drawer-header">
        <span className="assistant-drawer-mark"><HesabuMark /></span>
        <span><strong>Hesabu</strong><small>Business assistant · {cloudMode ? 'Your saved records' : 'This workspace'}</small></span>
        <button type="button" className="icon-button" aria-label="Close assistant" onClick={() => setPanel(null)}><X size={18} /></button>
      </header>
      <div className="assistant-drawer-body">
        {messages.length === 0 ? <>
          <div className="assistant-welcome-message"><strong>What would you like to understand?</strong><p>I can explain sales, payments, customer balances, expenses, supplier obligations and stock using records saved in this workspace.</p></div>
          <div className="assistant-suggestions">{suggestions.map(item => <button key={item} type="button" onClick={() => ask(item)}>{item}<ArrowRight size={13} /></button>)}</div>
        </> : <div className="assistant-conversation" aria-live="polite">
          {messages.map((message,index) => <div className={'assistant-message assistant-message-' + message.role} key={index}>
            {message.role === 'assistant' && <span className="assistant-message-brand"><HesabuMark /></span>}
            <p>{message.text}</p>
          </div>)}
          <div className="assistant-followups">{suggestions.slice(0,3).map(item => <button key={item} type="button" onClick={() => ask(item)}>{item}</button>)}</div>
        </div>}
        <div className="assistant-quick-actions">
          <span>Record something</span>
          <div>
            <button type="button" onClick={() => { setPanel(null); onRecordSale(); }}><Receipt size={14} /> Sale</button>
            <button type="button" onClick={() => { setPanel(null); onRecordExpense(); }}><TrendingDown size={14} /> Expense</button>
            <button type="button" onClick={() => { setPanel(null); onUpdateStock(); }}><Package size={14} /> Stock</button>
          </div>
        </div>
      </div>
      {voiceError && <p className="assistant-voice-error" role="status">{voiceError}</p>}
      <form className="assistant-drawer-entry" onSubmit={event => { event.preventDefault(); ask(question); }}>
        <button type="button" className={'assistant-voice-button ' + (voiceListening ? 'assistant-voice-active' : '')} aria-label={voiceListening ? 'Listening for your question' : 'Ask Hesabu by voice'} title={voiceListening ? 'Listening…' : 'Speak to Hesabu'} onClick={startVoiceCapture}><Mic size={17} /></button>
        <input aria-label="Ask Hesabu" value={question} onChange={event => setQuestion(event.target.value)} placeholder={voiceListening ? 'Listening… speak now' : 'Ask or speak to Hesabu…'} />
        <button type="submit" aria-label="Send question" disabled={!question.trim()}><ArrowUpRight size={18} /></button>
      </form>
      <p className="assistant-drawer-note">{cloudMode
        ? 'Answers are calculated from saved records. If a figure is missing, add the transaction first.'
        : 'Answers use saved records and fixed calculations; no figures are invented.'}</p>
    </section>}
    {panel === 'digest' && <section className="assistant-drawer digest-drawer" role="dialog" aria-modal="false" aria-label="Daily WhatsApp digest">
      <header className="assistant-drawer-header">
        <span className="assistant-drawer-mark"><MessageCircle size={19} /></span>
        <span><strong>Daily business digest</strong><small>{data.profile.name} · {dateLabel(digest.date)}</small></span>
        <button type="button" className="icon-button" aria-label="Close daily digest" onClick={() => setPanel(null)}><X size={18} /></button>
      </header>
      <div className="assistant-drawer-body">
        <div className="digest-floating-grid">
          <div><span>Sales</span><strong>{money(digest.salesTotal)}</strong></div>
          <div><span>Payments received</span><strong>{money(digest.receivedTotal)}</strong></div>
          <div><span>Expenses</span><strong>{money(digest.expenseTotal)}</strong></div>
          <div><span>Gross profit</span><strong>{money(digest.grossProfit)}</strong></div>
        </div>
        {!demoMode && <label className="digest-floating-recipient">
          <span>WhatsApp destination</span>
          <input value={whatsappNumber} onChange={event => { onWhatsAppNumberChange(event.target.value); setDigestError(''); }} placeholder="2547XXXXXXXX" inputMode="tel" />
        </label>}
        {digestError && <p className="digest-floating-error" role="alert">{digestError}</p>}
        <button type="button" className="digest-share-button" onClick={shareDigest} disabled={demoMode}><MessageCircle size={16} /> {demoMode ? 'Unavailable in demo' : 'Open WhatsApp'}</button>
        <p className="digest-floating-note">{demoMode
          ? 'This is a sample digest. External WhatsApp messages are disabled in the demo.'
          : 'Hesabu fills the message for you. Review it in WhatsApp and press Send. Automatic delivery is not enabled.'}</p>
      </div>
    </section>}
    <div className="floating-tools-dock">
      <button
        type="button"
        className={'floating-whatsapp-launcher ' + (panel === 'digest' ? 'floating-tool-active' : '')}
        aria-label={panel === 'digest' ? 'Close daily digest' : 'Open WhatsApp daily digest'}
        aria-expanded={panel === 'digest'}
        onClick={() => togglePanel('digest')}
        title="Daily digest"
      >
        {panel === 'digest' ? <X size={20} /> : <MessageCircle size={21} />}
      </button>
      <button
        type="button"
        className={'assistant-launcher ' + (panel === 'assistant' ? 'assistant-launcher-open' : '')}
        aria-label={panel === 'assistant' ? 'Close Hesabu' : 'Open Hesabu'}
        aria-expanded={panel === 'assistant'}
        onClick={() => togglePanel('assistant')}
        title="Ask Hesabu"
      >
        {panel === 'assistant' ? <X size={21} /> : <HesabuMark />}
      </button>
    </div>
  </>;
}

function OverviewPage({ data, metrics, role, onCreateSale, onCreateProduct, onNavigate, onSelectInvoice, onRecordExpense, onRecordPayment, onRecordReceipt, onCreatePurchase, onQuickStock }: {
  data: AppData; metrics: ReturnType<typeof getMetrics>; role: TeamRole;
  onCreateSale: () => void; onCreateProduct: () => void;
  onNavigate: (section: ModuleKey) => void; onSelectInvoice: (id: string) => void;
  onRecordExpense: () => void; onRecordPayment: () => void; onRecordReceipt: () => void;
  onCreatePurchase: () => void; onQuickStock: () => void;
}) {
  const postedInvoices = data.invoices.filter(invoice => invoice.status !== 'draft');
  const chartDays = Array.from({ length: 7 }, (_, index) => addDays(today(), index - 6));
  const stockProducts = [...data.products].sort((a, b) => b.quantity - a.quantity).slice(0, 7);
  const chartValues = role === 'Inventory'
    ? stockProducts.map(product => product.quantity)
    : chartDays.map(day => sum(postedInvoices.filter(invoice => invoice.date === day).map(invoice => invoice.total)));
  const chartLabels = role === 'Inventory'
    ? stockProducts.map(product => product.name.length > 9 ? product.name.slice(0, 8) + '…' : product.name)
    : chartDays.map(day => formatBusinessDay(day, { weekday: 'short' }));
  const lowStock = data.products.filter(product => product.quantity <= product.reorderLevel);
  const zeroStock = data.products.filter(product => product.quantity === 0);
  const slowStock = data.products.filter(product => product.quantity > 0 && !postedInvoices.some(invoice =>
    invoice.date >= addDays(today(), -30) && invoice.lines.some(line => line.productId === product.id),
  ));
  const unsettled = postedInvoices.filter(invoice => invoiceBalance(invoice) > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 3);

  type RecentActivity = {
    id: string; title: string; detail: string; time: string;
    amount: number | null; direction: 'in' | 'out' | 'neutral';
    invoiceId?: string; label?: string;
  };
  const activity: RecentActivity[] = [
    ...data.payments.filter(payment => payment.status === 'succeeded').map(payment => ({
      id: 'payment-' + payment.id,
      title: payment.customer || 'Customer payment',
      detail: (payment.invoiceNumber ? payment.invoiceNumber + ' · ' : '') + channelLabel(payment.channel) +
        (payment.reference && payment.reference !== '—' ? ' · ' + shortRef(payment.reference) : ''),
      time: payment.createdAt, amount: payment.amount, direction: 'in' as const, invoiceId: payment.invoiceId,
    })),
    ...data.expenses.map(expense => ({
      id: 'expense-' + expense.id, title: expense.description || 'Business expense',
      detail: expense.category + ' · ' + channelLabel(expense.channel),
      time: expense.date + 'T12:00:00', amount: expense.amount, direction: 'out' as const,
    })),
    ...(data.cashMovements ?? []).filter(movement => movement.direction === 'out').map(movement => ({
      id: 'movement-' + movement.id, title: movement.description || 'Business payment',
      detail: movement.source === 'supplier_payment' ? 'Supplier payment · ' + (movement.reference || channelLabel(movement.channel)) : channelLabel(movement.channel),
      time: movement.date + 'T12:00:00', amount: movement.amount, direction: 'out' as const,
    })),
    ...postedInvoices.filter(invoice => invoice.total > 0 && invoice.paid === 0).map(invoice => ({
      id: 'credit-' + invoice.id, title: invoice.customer || 'Credit sale',
      detail: invoice.number + ' · Sale on credit', time: invoice.date + 'T12:00:00',
      amount: invoice.total, direction: 'neutral' as const, invoiceId: invoice.id, label: 'On credit',
    })),
    ...(role === 'Inventory' ? data.purchaseOrders.map(order => ({
      id: 'order-' + order.id, title: order.supplierName || 'Supplier order',
      detail: order.number + ' · ' + order.status.replaceAll('_', ' '),
      time: order.createdAt + 'T12:00:00', amount: order.total,
      direction: 'neutral' as const, label: 'Purchase order',
    })) : []),
  ].sort((a, b) => b.time.localeCompare(a.time)).slice(0, 7);

  const quickActions: Array<{ label: string; icon: LucideIcon; run: () => void }> =
    role === 'Owner' || role === 'Manager' ? [
      { label: 'Sale', icon: ArrowUpRight, run: onCreateSale },
      { label: 'Expense', icon: ArrowDownLeft, run: onRecordExpense },
      { label: 'Payment', icon: Wallet, run: onRecordPayment },
      { label: 'Stock', icon: Package, run: onQuickStock },
    ] : role === 'Sales' ? [
      { label: 'Sale', icon: ArrowUpRight, run: onCreateSale },
      { label: 'Payment', icon: Wallet, run: onRecordPayment },
      { label: 'Receipt', icon: ArrowDownLeft, run: onRecordReceipt },
      { label: 'Follow up', icon: Receipt, run: () => onNavigate('sales') },
    ] : role === 'Inventory' ? [
      { label: 'Add item', icon: Package, run: onCreateProduct },
      { label: 'Count stock', icon: Boxes, run: onQuickStock },
      { label: 'Purchase', icon: ShoppingCart, run: onCreatePurchase },
      { label: 'Suppliers', icon: Truck, run: () => onNavigate('procurement') },
    ] : [
      { label: 'Expense', icon: ArrowDownLeft, run: onRecordExpense },
      { label: 'Payment', icon: Wallet, run: onRecordPayment },
      { label: 'Receipt', icon: ArrowDownLeft, run: onRecordReceipt },
      { label: 'Reports', icon: BarChart3, run: () => onNavigate('reports') },
    ];

  const heroTitle = role === 'Sales' ? 'Sales recorded today' : role === 'Inventory' ? 'Stock at cost' : 'Business cash position';
  const heroValue = role === 'Sales' ? metrics.salesToday : role === 'Inventory' ? metrics.inventoryValue : metrics.cashPosition;
  const heroDetail = role === 'Sales' ? 'Customer sales entered today'
    : role === 'Inventory' ? 'Recorded value of stock on hand'
    : 'Recorded cash, M-Pesa, bank and card balances';

  return <div className="page-stack">
    <div className="overview-welcome">
      <div><div className="eyebrow">HESABU · BUSINESS OVERVIEW</div><h2>{data.profile.name}</h2><p>Your business, at a glance.</p></div>
      <div className="overview-welcome-actions"><span className="date-chip"><CalendarDays size={14} /> {dateLabel(today())}</span></div>
    </div>
    <section className="finance-balance-hero" aria-label={heroTitle}>
      <div className="finance-balance-top">
        <div><span>{heroTitle}</span><small>{heroDetail}</small></div>
        <span className="finance-balance-mark"><Wallet size={20} /></span>
      </div>
      <strong className="finance-balance-value">{money(heroValue)}</strong>
      <div className="finance-balance-actions" aria-label="Quick business actions">
        {quickActions.map(({ label, icon: Icon, run }) => <button type="button" key={label} onClick={run}>
          <span><Icon size={19} /></span><strong>{label}</strong>
        </button>)}
      </div>
    </section>
    <SectionCard title="Recent transactions" detail="Money in, money out and the latest business activity." action={<button className="text-link" onClick={() => onNavigate(role === 'Inventory' ? 'procurement' : 'payments')}>See all <ArrowRight size={13} /></button>}>
      {activity.length ? <div className="recent-activity-list">
        {activity.map(item => <button type="button" className="recent-activity-row" key={item.id}
          onClick={() => item.invoiceId ? onSelectInvoice(item.invoiceId) : onNavigate(role === 'Inventory' ? 'procurement' : item.direction === 'out' ? 'accounts' : 'payments')}>
          <span className={'recent-activity-icon ' + (item.direction === 'in' ? 'is-in' : item.direction === 'out' ? 'is-out' : 'is-neutral')}>
            {item.direction === 'in' ? <ArrowDownLeft size={17} /> : item.direction === 'out' ? <ArrowUpRight size={17} /> : <Receipt size={17} />}
          </span>
          <span className="recent-activity-copy"><strong>{item.title}</strong><small>{item.detail} · {dateTimeLabel(item.time)}</small></span>
          <span className={'recent-activity-amount ' + (item.direction === 'in' ? 'positive' : item.direction === 'out' ? 'negative' : '')}>
            {item.label ?? ((item.direction === 'out' ? '−' : item.direction === 'in' ? '+' : '') + money(item.amount ?? 0))}
          </span>
        </button>)}
      </div> : <EmptyState title="No transactions yet" body="Sales, receipts and operating payments will appear here once your team records them." action={role === 'Sales' || role === 'Owner' || role === 'Manager' ? <Button onClick={onCreateSale}>Record a sale</Button> : undefined} />}
    </SectionCard>
    <section className="daily-summary-section" aria-label="Daily business figures">
      <div className="daily-summary-heading"><h3>{role === 'Inventory' ? 'Inventory at a glance' : role === 'Sales' ? 'Sales at a glance' : 'Business at a glance'}</h3><span>Today's figures</span></div>
      <div className="daily-summary-grid">
        {role === 'Inventory' ? <>
          <div className="daily-summary-item daily-summary-sales"><div className="daily-summary-top"><span>Products</span><span className="daily-summary-icon"><Package size={16} /></span></div><strong>{numberText(data.products.length)}</strong><small>Active inventory items</small></div>
          <div className="daily-summary-item daily-summary-stock"><div className="daily-summary-top"><span>Stock alerts</span><span className="daily-summary-icon"><AlertTriangle size={16} /></span></div><strong>{numberText(lowStock.length)}</strong><small>At or below reorder level</small></div>
          <div className="daily-summary-item daily-summary-expenses"><div className="daily-summary-top"><span>Out of stock</span><span className="daily-summary-icon"><Package size={16} /></span></div><strong>{numberText(zeroStock.length)}</strong><small>Unavailable to sell</small></div>
          <div className="daily-summary-item daily-summary-payables"><div className="daily-summary-top"><span>Stock at cost</span><span className="daily-summary-icon"><Wallet size={16} /></span></div><strong>{money(metrics.inventoryValue)}</strong><small>Current stock valuation</small></div>
        </> : <>
          <div className="daily-summary-item daily-summary-sales"><div className="daily-summary-top"><span>Sales today</span><span className="daily-summary-icon"><TrendingUp size={16} /></span></div><strong>{money(metrics.salesToday)}</strong><small>Recorded customer sales</small></div>
          <div className="daily-summary-item daily-summary-expenses"><div className="daily-summary-top"><span>Payments received</span><span className="daily-summary-icon"><ArrowDownLeft size={16} /></span></div><strong>{money(metrics.collectedToday)}</strong><small>Customer payments recorded</small></div>
          {role !== 'Sales' && <div className="daily-summary-item daily-summary-stock"><div className="daily-summary-top"><span>Expenses today</span><span className="daily-summary-icon"><TrendingDown size={16} /></span></div><strong>{money(sum(data.expenses.filter(expense => expense.date === today()).map(expense => expense.amount)))}</strong><small>Business costs recorded</small></div>}
          <div className="daily-summary-item daily-summary-payables"><div className="daily-summary-top"><span>{role === 'Sales' ? 'Open invoices' : 'Stock alerts'}</span><span className="daily-summary-icon"><Package size={16} /></span></div><strong>{numberText(role === 'Sales' ? metrics.unpaidInvoices : lowStock.length)}</strong><small>{role === 'Sales' ? money(metrics.receivables) + ' awaiting collection' : 'Products at reorder level'}</small></div>
        </>}
      </div>
    </section>
    <SectionCard title={role === 'Inventory' ? 'Stock by item' : 'Sales trend'} detail={role === 'Inventory' ? 'Current units on hand across the largest stock lines.' : 'Recorded sales over the last seven days.'}>
      <div className="chart-summary"><strong>{role === 'Inventory' ? numberText(sum(chartValues)) + ' units' : money(sum(chartValues))}</strong><span>{role === 'Inventory' ? 'Top stock lines' : 'Last 7 days'}</span></div>
      {chartValues.length ? <MiniBars values={chartValues} labels={chartLabels} /> : <EmptyState title="No stock items yet" body="Products will appear here after the first inventory item is added." />}
    </SectionCard>
    <div className="content-grid content-grid-main">
      {role === 'Sales' ? <SectionCard title="Customer follow-up" detail="Customer balances requiring attention.">
        {unsettled.length ? <div className="followup-list">
          {unsettled.map(invoice => <button key={invoice.id} onClick={() => onSelectInvoice(invoice.id)}>
            <span><strong>{invoice.customer}</strong><small>{invoice.number} · Due {dateLabel(invoice.dueDate)}</small></span>
            <strong>{money(invoiceBalance(invoice))}</strong>
          </button>)}
        </div> : <EmptyState title="No balances to follow up" body="Unpaid and part-paid sales will appear here." />}
      </SectionCard> : role === 'Finance' ? <SectionCard title="Collections & obligations" detail="Customer and supplier balances that require attention.">
        <div className="working-capital-list">
          <div><span>Customer receivables</span><strong>{money(metrics.receivables)}</strong></div>
          <div><span>Open customer invoices</span><strong>{numberText(metrics.unpaidInvoices)}</strong></div>
          <div><span>Supplier payables</span><strong className="negative-text">{money(metrics.payables)}</strong></div>
          <div><span>Unapplied customer advances</span><strong>{money(metrics.customerAdvances)}</strong></div>
        </div>
        <button className="text-link stock-watch-link" onClick={() => onNavigate('accounts')}>Review financial records <ArrowRight size={13} /></button>
      </SectionCard> : <SectionCard title="Stock watch" detail="Products that could interrupt sales or tie up cash.">
        <div className="stock-watch-list">
          <button onClick={() => onNavigate('inventory')}><span><strong>Out of stock</strong><small>Products unavailable to sell</small></span><b>{zeroStock.length}</b></button>
          <button onClick={() => onNavigate('inventory')}><span><strong>Reorder soon</strong><small>At or below the reorder point</small></span><b>{lowStock.length}</b></button>
          {role !== 'Inventory' && <button onClick={() => onNavigate('inventory')}><span><strong>Slow stock</strong><small>No recorded sale in 30 days</small></span><b>{slowStock.length}</b></button>}
        </div>
        <button className="text-link stock-watch-link" onClick={() => onNavigate('inventory')}>Review inventory <ArrowRight size={13} /></button>
      </SectionCard>}
    </div>
    
  </div>;
}
function SalesPage({ data, search, onSearch, onCreateSale, onSelectInvoice }: {
  data: AppData; search: string; onSearch: (value: string) => void; onCreateSale: () => void; onSelectInvoice: (id: string) => void;
}) {
  const [filter, setFilter] = useState('all');
  const list = data.invoices.filter(invoice => {
    const text = (invoice.number + ' ' + invoice.customer + ' ' + sourceLabel(invoice.source) + ' ' + saleTypeLabel(invoice.saleType)).toLowerCase();
    const matchesSearch = text.includes(search.toLowerCase());
    const matchesFilter = filter === 'all' || invoice.status === filter;
    return matchesSearch && matchesFilter;
  }).sort((a, b) => b.date.localeCompare(a.date));
  const postedInvoices = data.invoices.filter(invoice => invoice.status !== 'draft');
  const totalInvoiced = sum(postedInvoices.map(invoice => invoice.total));
  const totalCollected = sum(data.invoices.map(invoice => invoice.paid));
  return <div className="page-stack">
    <PageHeader title="Sales & invoices" description="Keep every sale traceable, whether it starts at the counter, on your website or in Hesabu." actions={<Button onClick={onCreateSale}><Plus size={16} /> Record sale</Button>} />
    <div className="metric-grid metric-grid-four compact-metrics">
      <MetricCard label="Invoiced" value={money(totalInvoiced)} note="All recorded invoices" icon={Receipt} tone="blue" />
      <MetricCard label="Collected" value={money(totalCollected)} note="Payments confirmed" icon={CheckCircle2} tone="green" />
      <MetricCard label="Outstanding" value={money(totalInvoiced - totalCollected)} note="Customer balances" icon={Clock3} tone="amber" />
      <MetricCard label="Invoices" value={numberText(postedInvoices.length)} note={data.invoices.filter(invoice => invoice.status === 'draft').length + ' saved enquiries'} icon={FileText} tone="slate" />
    </div>
    <SectionCard title="Invoice register" detail="Search by invoice number, customer or source.">
      <div className="table-toolbar">
        <div className="table-search"><Search size={15} /><input value={search} onChange={event => onSearch(event.target.value)} placeholder="Search invoices…" /></div>
        <div className="filter-control"><Filter size={14} /><select value={filter} onChange={event => setFilter(event.target.value)}>
          <option value="all">All records</option><option value="draft">Enquiries / quotes</option><option value="paid">Paid</option><option value="partial">Part paid</option><option value="sent">Awaiting payment</option>
        </select></div>
        <span className="table-count">{list.length} records</span>
      </div>
      {list.length ? <DataTable headers={['Invoice', 'Customer', 'Issue date', 'Source', 'Payment channel', 'Status', 'Total', 'Balance']}>
        {list.map(invoice => <tr key={invoice.id} className="clickable-row" onClick={() => onSelectInvoice(invoice.id)}>
          <td><strong>{invoice.number}</strong><small className="cell-sub">{saleTypeLabel(invoice.saleType)}</small></td><td>{invoice.customer}<small className="cell-sub">{invoice.phone || 'No phone recorded'}</small></td>
          <td>{dateLabel(invoice.date)}</td><td>{sourceLabel(invoice.source)}</td><td>{invoice.status === 'draft' ? '—' : <span className={channelClass(invoice.channel)}>{channelLabel(invoice.channel)}</span>}</td>
          <td><StatusPill status={invoice.status}>{statusLabel(invoice.status)}</StatusPill></td>
          <td className="amount-cell">{money(invoice.total)}</td><td className="amount-cell">{invoice.status === 'draft' ? '—' : money(invoiceBalance(invoice))}</td>
        </tr>)}
      </DataTable> : <EmptyState title="No matching invoices" body="Change the search or status filter, or record a sale to create an invoice." action={<Button onClick={onCreateSale}><Plus size={15} /> Record sale</Button>} />}
    </SectionCard>
  </div>;
}

function PaymentsPage({ data, metrics, search, onSearch, onRequestPayment, onResolvePayment, onAddReceipt, onMatchReceipt, cloudMode }: {
  data: AppData; metrics: ReturnType<typeof getMetrics>; search: string; onSearch: (value: string) => void;
  onRequestPayment: () => void; onResolvePayment: (id: string, success: boolean) => void;
  onAddReceipt: () => void; onMatchReceipt: (receiptId: string) => void; cloudMode: boolean;
}) {
  const list = [...data.payments].filter(payment =>
    (payment.invoiceNumber + ' ' + payment.customer + ' ' + payment.reference + ' ' + (payment.rail || '')).toLowerCase().includes(search.toLowerCase()),
  ).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pending = data.payments.filter(payment => payment.status === 'pending').length;
  const failed = data.payments.filter(payment => payment.status === 'failed').length;
  const unmatched = [...data.unmatchedReceipts].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  const unmatchedValue = sum(unmatched.map(receipt => receipt.amount));
  return <div className="page-stack">
    <PageHeader title="Payments" description="See what customers have paid and what still needs your attention." actions={<>
      <Button variant="outline" onClick={onAddReceipt}><Plus size={15} /> Record receipt</Button>
      <Button onClick={onRequestPayment}><Plus size={15} /> {cloudMode ? 'Record payment' : 'Request payment'}</Button>
    </>} />
    <div className="metric-grid metric-grid-four compact-metrics">
      <MetricCard label="Received today" value={money(metrics.collectedToday)} note="Payments recorded today" icon={CircleDollarSign} tone="green" />
      <MetricCard label="Awaiting payment" value={numberText(pending)} note="Requests awaiting a response" icon={Clock3} tone="amber" />
      <MetricCard label="Receipts to match" value={numberText(unmatched.length)} note={money(unmatchedValue) + ' without an invoice'} icon={AlertTriangle} tone="blue" />
      <MetricCard label="Needs attention" value={numberText(failed)} note="Payments that did not complete" icon={Activity} tone="slate" />
    </div>
    <div className="content-grid content-grid-main">
      <SectionCard title="Money received by method" detail="Recorded collection balances across your business.">
        <div className="payment-method-summary">
          <div><span>M-Pesa</span><strong>{money(metrics.channelBalances.mpesa)}</strong></div>
          <div><span>Cash</span><strong>{money(metrics.channelBalances.cash)}</strong></div>
          <div><span>Bank</span><strong>{money(metrics.channelBalances.bank)}</strong></div>
          <div><span>Card</span><strong>{money(metrics.channelBalances.card)}</strong></div>
        </div>
        <div className="channel-total"><span>Total recorded funds</span><strong>{money(metrics.cashPosition)}</strong></div>
      </SectionCard>
      <SectionCard title="Receipts to match" detail="Payments received that still need to be linked to a customer sale.">
        {unmatched.length ? <div className="attention-list">
          {unmatched.slice(0, 6).map(receipt => <button key={receipt.id} onClick={() => onMatchReceipt(receipt.id)}>
            <span><strong>{receipt.payer || 'Unidentified payer'}</strong><small>{receipt.rail} · {shortRef(receipt.reference)}</small></span>
            <strong>{money(receipt.amount)}</strong><span className="table-action">Match</span>
          </button>)}
        </div> : <EmptyState title="All receipts matched" body="Record a receipt when money arrives without a clear invoice allocation. It will appear here until it is allocated." />}
      </SectionCard>
    </div>
    <SectionCard title="Payment activity" detail="Collections recorded against customer sales.">
      <div className="table-toolbar">
        <div className="table-search"><Search size={15} /><input value={search} onChange={event => onSearch(event.target.value)} placeholder="Search customer, invoice or reference…" /></div>
        <span className="table-count">{list.length} payments</span>
      </div>
      {list.length ? <DataTable headers={['Customer', 'Sale', 'Method', 'Reference', 'Date', 'Amount', 'Status', '']}>
        {list.map(payment => <tr key={payment.id}>
          <td><strong>{payment.customer}</strong><small className="cell-sub">{payment.phone || 'No phone recorded'}</small></td>
          <td>{payment.invoiceNumber}</td><td>{channelLabel(payment.channel)}</td>
          <td className="mono-text">{shortRef(payment.reference)}</td><td>{dateTimeLabel(payment.createdAt)}</td>
          <td className="amount-cell">{money(payment.amount)}{(payment.unappliedAmount ?? 0) > 0 && <small className="cell-sub">{money(payment.unappliedAmount ?? 0)} customer credit</small>}</td>
          <td><StatusPill status={payment.status}>{payment.status === 'succeeded' ? 'Received' : payment.status === 'pending' ? 'Awaiting' : payment.status === 'failed' ? 'Unsuccessful' : 'Reversed'}</StatusPill></td>
          <td>{payment.status === 'pending' ? <div className="row-actions">
            <Button size="sm" variant="secondary" onClick={() => onResolvePayment(payment.id, true)}>Mark received</Button>
            <Button size="sm" variant="ghost" onClick={() => onResolvePayment(payment.id, false)}>Mark failed</Button>
          </div> : <span className="muted-copy">—</span>}</td>
        </tr>)}
      </DataTable> : <EmptyState title="No payment activity" body="Payments linked to sales will appear here." />}
    </SectionCard>
  </div>;
}

function InventoryPage({ data, search, onSearch, onAddProduct, onAdjust, onOrder }: {
  data: AppData; search: string; onSearch: (value: string) => void;
  onAddProduct: () => void; onAdjust: (id: string) => void; onOrder: (id: string, quantity: number) => void;
}) {
  const [view, setView] = useState<'all' | 'attention' | 'slow'>('all');
  const since = addDays(today(), -30);
  const soldByProduct = new Map<string, number>();
  data.inventoryMovements
    .filter(movement => movement.type === 'sale' && dateKey(new Date(movement.occurredAt)) >= since)
    .forEach(movement => {
      soldByProduct.set(movement.productId, (soldByProduct.get(movement.productId) ?? 0) + Math.abs(movement.quantityDelta));
    });
  const incomingByProduct = new Map<string, number>();
  data.purchaseOrders.filter(order => order.status === 'sent' || order.status === 'partially_received')
    .forEach(order => order.lines.forEach(line => {
      incomingByProduct.set(line.productId, (incomingByProduct.get(line.productId) ?? 0) + Math.max(0, line.quantity - line.received));
    }));
  const signals = data.products.map(product => {
    const unitsSold = soldByProduct.get(product.id) ?? 0;
    const dailyVelocity = unitsSold / 30;
    const daysCover = dailyVelocity > 0 ? product.quantity / dailyVelocity : null;
    const incomingUnits = incomingByProduct.get(product.id) ?? 0;
    const targetUnits = Math.ceil((dailyVelocity * 14) + product.reorderLevel);
    const suggestedOrder = Math.max(0, targetUnits - product.quantity - incomingUnits);
    const needsAttention = product.quantity <= product.reorderLevel || product.quantity === 0 || (daysCover !== null && daysCover <= 14);
    const slowMoving = product.quantity > 0 && (unitsSold === 0 || (daysCover !== null && daysCover > 45));
    return { product, unitsSold, daysCover, onOrder: incomingUnits, suggestedOrder, needsAttention, slowMoving };
  });
  const low = signals.filter(item => item.needsAttention);
  const slow = signals.filter(item => item.slowMoving);
  const stockValue = sum(data.products.map(productValue));
  const slowStockValue = sum(slow.map(item => productValue(item.product)));
  const unitsSold30 = sum(signals.map(item => item.unitsSold));
  const outOfStock = signals.filter(item => item.product.quantity === 0).length;
  const list = signals.filter(item => {
    const matches = (item.product.name + ' ' + item.product.sku + ' ' + item.product.category).toLowerCase().includes(search.toLowerCase());
    return matches && (view === 'all' || (view === 'attention' ? item.needsAttention : item.slowMoving));
  }).sort((a, b) => {
    if (view === 'slow') return productValue(b.product) - productValue(a.product);
    if (a.daysCover === null) return -1;
    if (b.daysCover === null) return 1;
    return a.daysCover - b.daysCover;
  });
  const riskItems = [...low].sort((a, b) => (a.daysCover ?? 0) - (b.daysCover ?? 0)).slice(0, 5);
  const slowItems = [...slow].sort((a, b) => productValue(b.product) - productValue(a.product)).slice(0, 4);
  return <div className="page-stack">
    <PageHeader title="Stock" description="See what is on hand, what is moving and what needs reordering." actions={<Button onClick={onAddProduct}><Plus size={15} /> Add product</Button>} />
    <div className="metric-grid metric-grid-four compact-metrics">
      <MetricCard label="Stock at cost" value={money(stockValue)} note="Current stock value" icon={Boxes} tone="slate" />
      <MetricCard label="Units sold · 30 days" value={numberText(unitsSold30)} note="Recorded product movement" icon={TrendingUp} tone="blue" />
      <MetricCard label="Need replenishment" value={numberText(low.length)} note={outOfStock + ' currently out of stock'} icon={AlertTriangle} tone="amber" />
      <MetricCard label="Slow stock value" value={money(slowStockValue)} note={slow.length + ' items with low movement'} icon={Package} tone="slate" />
    </div>
    <div className="content-grid content-grid-main stock-health-grid">
      <SectionCard title="Replenish before sales are lost" detail="Suggested quantities cover about 14 days of recent demand, after incoming orders.">
        {riskItems.length ? <div className="stock-signal-list">
          {riskItems.map(item => <div className="stock-signal-row" key={item.product.id}>
            <div className="stock-signal-main"><strong>{item.product.name}</strong><small>{numberText(item.product.quantity)} {item.product.unit} left · {item.daysCover === null ? 'No recent sales history' : Math.max(0, Math.floor(item.daysCover)) + ' days of cover'}{item.onOrder > 0 ? ' · ' + numberText(item.onOrder) + ' on order' : ''}</small></div>
            <div className="stock-signal-action"><strong>{item.suggestedOrder > 0 ? numberText(item.suggestedOrder) : '—'}</strong><small>{item.suggestedOrder > 0 ? 'Suggested units' : 'Review count'}</small></div>
            {item.suggestedOrder > 0 ? <Button size="sm" variant="outline" onClick={() => onOrder(item.product.id, item.suggestedOrder)}>Order</Button>
              : <button className="table-action" onClick={() => onAdjust(item.product.id)}>Count</button>}
          </div>)}
        </div> : <EmptyState title="Stock cover looks healthy" body="No products are below the reorder floor or 14-day cover." />}
      </SectionCard>
      <SectionCard title="Cash tied in slow stock" detail="Products with over 45 days of cover or no sales in the last 30 days.">
        {slowItems.length ? <div className="stock-signal-list">
          {slowItems.map(item => <div className="stock-signal-row" key={item.product.id}>
            <div className="stock-signal-main"><strong>{item.product.name}</strong><small>{numberText(item.product.quantity)} {item.product.unit} on hand · {item.unitsSold} sold in 30 days</small></div>
            <div className="stock-signal-action"><strong>{money(productValue(item.product))}</strong><small>Stock at cost</small></div>
            <button className="table-action" onClick={() => onAdjust(item.product.id)}>Count</button>
          </div>)}
        </div> : <EmptyState title="No slow stock flagged" body="Products with low movement will be shown here for review." />}
      </SectionCard>
    </div>
    <SectionCard title="Product catalogue" detail="One live product list for counter, wholesale and online sales.">
      <div className="table-toolbar">
        <div className="table-search"><Search size={15} /><input value={search} onChange={event => onSearch(event.target.value)} placeholder="Search product, SKU or category…" /></div>
        <div className="segmented-control">
          <button className={view === 'all' ? 'active' : ''} onClick={() => setView('all')}>All</button>
          <button className={view === 'attention' ? 'active' : ''} onClick={() => setView('attention')}>Replenish <span>{low.length}</span></button>
          <button className={view === 'slow' ? 'active' : ''} onClick={() => setView('slow')}>Slow stock <span>{slow.length}</span></button>
        </div>
        <span className="table-count">{list.length} products</span>
      </div>
      {list.length ? <DataTable headers={['Product', 'On hand', 'Sold · 30d', 'On order', 'Days cover', 'Cost', 'Selling price', 'Unit margin', 'Status', 'Action']}>
        {list.map(({ product, unitsSold, daysCover, onOrder: incomingUnits, suggestedOrder, needsAttention, slowMoving }) => {
          const status = product.quantity === 0 ? 'Out of stock' : needsAttention ? 'Reorder soon' : slowMoving ? 'Slow moving' : 'In stock';
          return <tr key={product.id}>
            <td><strong>{product.name}</strong><small className="cell-sub mono-text">{product.sku}</small></td>
            <td><strong>{numberText(product.quantity)}</strong> <small>{product.unit}</small></td><td>{numberText(unitsSold)}</td>
            <td>{numberText(incomingUnits)}</td><td>{daysCover === null ? 'No history' : Math.floor(daysCover) + ' days'}</td>
            <td>{money(product.costPrice)}</td><td>{money(product.sellingPrice)}</td>
            <td className="amount-cell">{money(product.sellingPrice - product.costPrice)}</td>
            <td><StatusPill status={product.quantity === 0 ? 'failed' : needsAttention ? 'pending' : slowMoving ? 'draft' : 'delivered'}>{status}</StatusPill></td>
            <td>{suggestedOrder > 0 ? <button className="table-action" onClick={() => onOrder(product.id, suggestedOrder)}>Order {numberText(suggestedOrder)}</button> : <button className="table-action" onClick={() => onAdjust(product.id)}>Count</button>}</td>
          </tr>;
        })}
      </DataTable> : <EmptyState title="No products match" body="Change the search or choose another stock view." />}
    </SectionCard>
    <SectionCard title="Stock movement history" detail="Opening stock, sales, deliveries, count adjustments and returns.">
      {data.inventoryMovements.length ? <DataTable headers={['When', 'Product', 'Movement', 'Quantity', 'Reference', 'Note', 'Value']}>
        {data.inventoryMovements.slice(0, 20).map(movement => <tr key={movement.id}>
          <td>{dateTimeLabel(movement.occurredAt)}</td>
          <td><strong>{movement.productName}</strong></td>
          <td><StatusPill status={movement.type === 'sale' ? 'pending' : movement.type === 'adjustment' ? 'draft' : 'delivered'}>{movement.type.replaceAll('_', ' ')}</StatusPill></td>
          <td className={movement.quantityDelta < 0 ? 'negative-text' : 'amount-cell'}>
            {movement.quantityDelta > 0 ? '+' : ''}{new Intl.NumberFormat('en-KE', { maximumFractionDigits: 3 }).format(movement.quantityDelta)}
          </td>
          <td className="mono-text">{movement.reference || '—'}</td>
          <td>{movement.note || movement.source || '—'}</td>
          <td>{money(movement.totalCost)}</td>
        </tr>)}
      </DataTable> : <EmptyState title="No stock movements yet" body="Opening stock, sales, received deliveries and stock counts will be recorded here automatically." />}
    </SectionCard>
  </div>;
}

function ProcurementPage({ data, onCreatePurchase, onReceiveOrder, onPaySupplier, onAddSupplier }: {
  data: AppData;
  onCreatePurchase: () => void;
  onReceiveOrder: (id: string) => void;
  onPaySupplier: (id: string) => void;
  onAddSupplier: () => void;
}) {
  const openOrders = data.purchaseOrders.filter(order => order.status === 'sent' || order.status === 'partially_received');
  const payables = sum(data.suppliers.map(supplier => supplier.balance));
  return <div className="page-stack">
    <PageHeader title="Purchasing" description="Replenish stock, follow supplier deliveries and keep incoming goods on track." actions={<div className="page-header-actions">
      <Button variant="outline" onClick={onAddSupplier}><Plus size={15} /> Add supplier</Button>
      <Button onClick={onCreatePurchase}><Plus size={16} /> New purchase order</Button>
    </div>} />
    <div className="metric-grid metric-grid-four compact-metrics">
      <MetricCard label="Supplier balances" value={money(payables)} note="Recorded accounts payable" icon={Truck} tone="amber" />
      <MetricCard label="Open purchase orders" value={numberText(openOrders.length)} note="Sent or part received" icon={ShoppingCart} tone="blue" />
      <MetricCard label="Orders in register" value={numberText(data.purchaseOrders.length)} note="Draft through received" icon={FileCheck2} tone="slate" />
      <MetricCard label="Suppliers" value={numberText(data.suppliers.length)} note="Active supplier records" icon={Store} tone="green" />
    </div>
    <SectionCard title="Purchase orders" detail="Receiving goods increases inventory and records the supplier payable.">
      {data.purchaseOrders.length ? <DataTable headers={['Order', 'Supplier', 'Created', 'Expected', 'Items', 'Order value', 'Status', 'Action']}>
        {[...data.purchaseOrders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(order => <tr key={order.id}>
          <td><strong>{order.number}</strong></td><td>{order.supplierName}</td><td>{dateLabel(order.createdAt)}</td>
          <td>{dateLabel(order.expectedAt)}</td><td>{numberText(order.lines.reduce((sum, line) => sum + line.received, 0))} / {numberText(order.lines.reduce((sum, line) => sum + line.quantity, 0))} units received</td><td className="amount-cell"><strong>{money(order.total)}</strong><small className="cell-sub">{money(sum(order.lines.map(line => line.received * line.unitCost)))} received value</small></td>
          <td><StatusPill status={order.status}>{order.status === 'partially_received' ? 'Part received' : order.status === 'received' ? 'Received' : order.status === 'sent' ? 'Sent to supplier' : order.status}</StatusPill></td>
          <td>{order.status === 'sent' || order.status === 'partially_received' ? <Button size="sm" variant="secondary" onClick={() => onReceiveOrder(order.id)}>Receive goods</Button> : <span className="muted-copy">Complete</span>}</td>
        </tr>)}
      </DataTable> : <EmptyState title="No purchase orders" body="Create a supplier record, then create an order when your business is ready to replenish stock." />}
    </SectionCard>
    <SectionCard title="Supplier accounts" detail="Open balances are tracked separately from customer receivables.">
      {data.suppliers.length ? <DataTable headers={['Supplier', 'Contact', 'Payment terms', 'Outstanding', '']}>
        {data.suppliers.map(supplier => <tr key={supplier.id}>
          <td><strong>{supplier.name}</strong><small className="cell-sub">{supplier.email}</small></td>
          <td>{supplier.phone}</td><td>{supplier.terms}</td>
          <td className="amount-cell">{money(supplier.balance)}</td>
          <td>{supplier.balance > 0 ? <button className="table-action" onClick={() => onPaySupplier(supplier.id)}>Record payment</button> : <span className="muted-copy">Up to date</span>}</td>
        </tr>)}
      </DataTable> : <EmptyState title="No suppliers yet" body="Add the suppliers your business buys stock or services from." />}
    </SectionCard>
  </div>;
}

function SupplierDialog({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (input: { name: string; phone: string; email: string; terms: string }) => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [terms, setTerms] = useState('Cash on delivery');
  return <Modal title="Add supplier" detail="Create a supplier record for purchasing and payable tracking." onClose={onClose}>
    <form className="modal-body" onSubmit={event => {
      event.preventDefault();
      if (name.trim()) onCreate({ name: name.trim(), phone: phone.trim(), email: email.trim(), terms });
    }}>
      <Field label="Supplier or business name" value={name} onChange={setName} required />
      <div className="form-grid form-grid-two">
        <Field label="Phone" value={phone} onChange={setPhone} placeholder="07XX XXX XXX" />
        <Field label="Email (optional)" type="email" value={email} onChange={setEmail} />
      </div>
      <SelectField label="Payment terms" value={terms} onChange={setTerms} options={[
        { value: 'Cash on delivery', label: 'Cash on delivery' },
        { value: '7 days', label: '7 days' }, { value: '14 days', label: '14 days' },
        { value: '30 days', label: '30 days' }, { value: 'Custom', label: 'Custom agreement' },
      ]} />
      <div className="modal-footer"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!name.trim()}>Save supplier</Button></div>
    </form>
  </Modal>;
}

function AccountsPage({ data, metrics }: { data: AppData; metrics: ReturnType<typeof getMetrics> }) {
  const [tab, setTab] = useState<'balances' | 'trial-balance' | 'journal'>('balances');
  const accounts = [
    { name: 'Cash on hand', group: 'Current asset', amount: metrics.channelBalances.cash, type: 'asset' },
    { name: 'M-Pesa clearing', group: 'Current asset', amount: metrics.channelBalances.mpesa, type: 'asset' },
    { name: 'Bank account', group: 'Current asset', amount: metrics.channelBalances.bank, type: 'asset' },
    { name: 'Inventory', group: 'Current asset', amount: metrics.inventoryValue, type: 'asset' },
    { name: 'Accounts receivable', group: 'Current asset', amount: metrics.receivables, type: 'asset' },
    { name: 'Accounts payable', group: 'Current liability', amount: metrics.payables, type: 'liability' },
    { name: 'Customer advances', group: 'Current liability', amount: metrics.customerAdvances, type: 'liability' },
    { name: 'Sales revenue', group: 'Income', amount: metrics.totalRevenue, type: 'income' },
    { name: 'Cost of goods sold', group: 'Direct cost', amount: metrics.costOfGoodsSold, type: 'expense' },
    { name: 'Operating expenses', group: 'Operating cost', amount: metrics.expenses, type: 'expense' },
  ];
  const journal = [...data.journal].sort((a, b) => b.date.localeCompare(a.date));
  const debitTotal = sum(journal.map(line => line.debit));
  const creditTotal = sum(journal.map(line => line.credit));
  const journalBalanced = isJournalBalanced(journal);
  const trialBalance = buildTrialBalance(journal);
  const trialDebitTotal = sum(trialBalance.map(line => line.debitBalance));
  const trialCreditTotal = sum(trialBalance.map(line => line.creditBalance));
  const trialBalanceBalanced = isTrialBalanceBalanced(trialBalance);
  const accountNet = (name: string) => {
    const row = trialBalance.find(item => item.account === name);
    return row ? row.debitBalance - row.creditBalance : 0;
  };
  const subledgersTie =
    Math.abs(accountNet('Cash on hand') - metrics.channelBalances.cash) < 0.01 &&
    Math.abs(accountNet('M-Pesa clearing') - metrics.channelBalances.mpesa) < 0.01 &&
    Math.abs(accountNet('Bank account') - metrics.channelBalances.bank) < 0.01 &&
    Math.abs(accountNet('Inventory') - metrics.inventoryValue) < 0.01 &&
    Math.abs(accountNet('Accounts receivable') - metrics.receivables) < 0.01 &&
    Math.abs(-accountNet('Accounts payable') - metrics.payables) < 0.01 &&
    Math.abs(-accountNet('Customer advances') - metrics.customerAdvances) < 0.01;
  const controlsPass = journalBalanced && trialBalanceBalanced && subledgersTie;

  return <div className="page-stack">
    <PageHeader title="Financials" description="Understand customer balances, supplier commitments, expenses and profit." actions={
      <span className="accounting-balance"><ShieldCheck size={15} /> {controlsPass ? 'Ledger controls reconciled' : 'Ledger review required'}</span>
    } />
    <div className="metric-grid metric-grid-four compact-metrics">
      <MetricCard label="Accounts receivable" value={money(metrics.receivables)} note="Due from customers" icon={ArrowDownLeft} tone="amber" />
      <MetricCard label="Accounts payable" value={money(metrics.payables)} note="Due to suppliers" icon={ArrowUpRight} tone="blue" />
      <MetricCard label="Operating expenses" value={money(metrics.expenses)} note="Recorded expenses" icon={TrendingDown} tone="slate" />
      <MetricCard label="Gross profit · MTD" value={money(metrics.grossProfitMonth)} note="Sales less item cost" icon={TrendingUp} tone="green" />
    </div>
    <SectionCard title="Accounting register" detail="Account balances, trial balance and the underlying journal all use the same posted ledger entries.">
      <div className="section-tabs">
        <button className={tab === 'balances' ? 'active' : ''} onClick={() => setTab('balances')}>Account balances</button>
        <button className={tab === 'trial-balance' ? 'active' : ''} onClick={() => setTab('trial-balance')}>Trial balance</button>
        <button className={tab === 'journal' ? 'active' : ''} onClick={() => setTab('journal')}>Journal entries <span>{journal.length}</span></button>
      </div>
      {tab === 'balances' ? <DataTable headers={['Account', 'Classification', 'Balance', '']}>
        {accounts.map(account => <tr key={account.name}>
          <td><strong>{account.name}</strong></td><td>{account.group}</td>
          <td className="amount-cell">{money(account.amount)}</td>
          <td><span className={'account-type account-type-' + account.type}>{account.type}</span></td>
        </tr>)}
      </DataTable> : tab === 'trial-balance' ? <>
        <div className="journal-summary">
          <div><span>Total debit balances</span><strong>{money(trialDebitTotal)}</strong></div>
          <div><span>Total credit balances</span><strong>{money(trialCreditTotal)}</strong></div>
          <div><span>Difference</span><strong className={trialBalanceBalanced ? 'positive-text' : 'negative-text'}>{money(Math.abs(trialDebitTotal - trialCreditTotal))}</strong></div>
        </div>
        <DataTable headers={['Account', 'Debit balance', 'Credit balance']}>
          {trialBalance.map(line => <tr key={line.account}>
            <td><strong>{line.account}</strong></td>
            <td className="amount-cell">{line.debitBalance ? money(line.debitBalance) : '—'}</td>
            <td className="amount-cell">{line.creditBalance ? money(line.creditBalance) : '—'}</td>
          </tr>)}
          <tr className="table-total-row">
            <td><strong>Total</strong></td>
            <td className="amount-cell"><strong>{money(trialDebitTotal)}</strong></td>
            <td className="amount-cell"><strong>{money(trialCreditTotal)}</strong></td>
          </tr>
        </DataTable>
        <div className="accounting-note"><ShieldCheck size={15} /><span>{subledgersTie
          ? 'Cash, inventory, receivables and supplier balances agree with their corresponding general-ledger control accounts.'
          : 'At least one operational balance does not agree with its general-ledger control account. Review the opening position and posting history before relying on this report.'}</span></div>
      </> : <>
        <div className="journal-summary">
          <div><span>Debits posted</span><strong>{money(debitTotal)}</strong></div>
          <div><span>Credits posted</span><strong>{money(creditTotal)}</strong></div>
          <div><span>Difference</span><strong className={journalBalanced ? 'positive-text' : 'negative-text'}>{money(Math.abs(debitTotal - creditTotal))}</strong></div>
        </div>
        <DataTable headers={['Date', 'Account', 'Description', 'Reference', 'Debit', 'Credit']}>
          {journal.map(line => <tr key={line.id}>
            <td>{dateLabel(line.date)}</td><td><strong>{line.account}</strong></td><td>{line.description}</td>
            <td className="mono-text">{line.reference}</td><td className="amount-cell">{line.debit ? money(line.debit) : '—'}</td>
            <td className="amount-cell">{line.credit ? money(line.credit) : '—'}</td>
          </tr>)}
        </DataTable>
      </>}
    </SectionCard>
    <div className="accounting-note"><ShieldCheck size={16} /><span>This register reflects saved workspace records. Confirm tax treatment and period-end adjustments with your accountant before statutory reporting.</span></div>
  </div>;
}

function getDailyDigest(data: AppData) {
  const date = today();
  const sales = data.invoices.filter(invoice => invoice.status !== 'draft' && invoice.date === date);
  const payments = data.payments.filter(payment => payment.status === 'succeeded' && dateKey(new Date(payment.createdAt)) === date);
  const unmatchedReceipts = data.unmatchedReceipts.filter(receipt => dateKey(new Date(receipt.receivedAt)) === date);
  const expenses = data.expenses.filter(expense => expense.date === date);
  const supplierPayments = (data.cashMovements ?? []).filter(movement => movement.date === date && movement.source === 'supplier_payment');
  const purchaseOrders = data.purchaseOrders.filter(order => order.createdAt === date);
  const inventoryActivity = data.events.filter(event => dateKey(new Date(event.time)) === date && event.type.startsWith('inventory.'));
  const salesTotal = sum(sales.map(invoice => invoice.total));
  const receivedTotal = sum(payments.map(payment => payment.amount)) + sum(unmatchedReceipts.map(receipt => receipt.amount));
  const expenseTotal = sum(expenses.map(expense => expense.amount));
  const supplierPaymentTotal = sum(supplierPayments.map(payment => payment.amount));
  const grossProfit = sum(sales.map(marginValue));
  const unitsSold = sum(sales.flatMap(invoice => invoice.lines.map(line => line.quantity)));
  const lowStock = data.products.filter(product => product.quantity <= product.reorderLevel);
  return { date, sales, payments, unmatchedReceipts, expenses, supplierPayments, purchaseOrders, inventoryActivity, salesTotal, receivedTotal, expenseTotal, supplierPaymentTotal, grossProfit, unitsSold, lowStock };
}

function buildDailyDigestMessage(data: AppData) {
  const digest = getDailyDigest(data);
  return [
    data.profile.name + ' · Daily business summary', dateLabel(digest.date), '',
    'Sales: ' + money(digest.salesTotal) + ' (' + digest.sales.length + ' sales)',
    'Payments received: ' + money(digest.receivedTotal),
    'Expenses: ' + money(digest.expenseTotal),
    'Supplier payments: ' + money(digest.supplierPaymentTotal),
    'Gross profit: ' + money(digest.grossProfit),
    'Units sold: ' + numberText(digest.unitsSold),
    'Supplier orders raised: ' + numberText(digest.purchaseOrders.length),
    'Stock updates: ' + numberText(digest.inventoryActivity.length),
    'Low-stock items: ' + numberText(digest.lowStock.length), '',
    'Prepared from the Hesabu workspace records.',
  ].join('\n');
}

function normaliseWhatsAppNumber(value: string) {
  let digits = value.trim().replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('2540') && digits.length === 13) digits = '254' + digits.slice(4);
  else if (digits.startsWith('0') && digits.length === 10) digits = '254' + digits.slice(1);
  else if ((digits.startsWith('7') || digits.startsWith('1')) && digits.length === 9) digits = '254' + digits;
  return digits.length >= 10 && digits.length <= 15 ? digits : '';
}

function openDailyDigestWhatsApp(data: AppData, destination: string, onMissing: () => void) {
  const number = normaliseWhatsAppNumber(destination || data.profile.phone);
  if (!number) { onMissing(); return; }
  const message = encodeURIComponent(buildDailyDigestMessage(data));
  // Navigate directly from the user's tap. window.open(..., 'noopener') can
  // return null even when successful and triggered the old false fallback.
  // The API send URL hands off to the installed WhatsApp app on mobile or
  // WhatsApp Web in a desktop browser, with the recipient prefilled.
  window.location.assign('https://api.whatsapp.com/send?phone=' + number + '&text=' + message);
}

function downloadDailyWorkbook(data: AppData) {
  const digest = getDailyDigest(data);
  const sheets: Array<{ name: string; rows: Array<Array<string | number>> }> = [
    { name: 'Summary', rows: [
      ['Hesabu daily business report'], ['Business', data.profile.name], ['Date', digest.date], [],
      ['Measure', 'Value'], ['Sales invoiced', digest.salesTotal], ['Payments received', digest.receivedTotal],
      ['Expenses recorded', digest.expenseTotal], ['Supplier payments', digest.supplierPaymentTotal],
      ['Gross profit', digest.grossProfit], ['Sales count', digest.sales.length],
      ['Units sold', digest.unitsSold], ['Supplier orders raised', digest.purchaseOrders.length],
      ['Stock updates', digest.inventoryActivity.length], ['Low-stock products', digest.lowStock.length],
    ]},
    { name: 'Sales', rows: [
      ['Invoice', 'Customer', 'Date', 'Status', 'Payment method', 'Total (KSh)', 'Paid (KSh)', 'Balance (KSh)'],
      ...digest.sales.map(invoice => [invoice.number, invoice.customer, invoice.date, statusLabel(invoice.status), channelLabel(invoice.channel), invoice.total, invoice.paid, invoiceBalance(invoice)]),
    ]},
    { name: 'Payments', rows: [
      ['Reference', 'Customer', 'Received at', 'Method', 'Amount (KSh)', 'Invoice'],
      ...digest.payments.map(payment => [payment.reference, payment.customer, dateTimeLabel(payment.createdAt), channelLabel(payment.channel), payment.amount, payment.invoiceNumber]),
    ]},
    { name: 'Unmatched receipts', rows: [
      ['Reference', 'Payer', 'Received at', 'Rail', 'Amount (KSh)'],
      ...digest.unmatchedReceipts.map(receipt => [receipt.reference, receipt.payer, dateTimeLabel(receipt.receivedAt), receipt.rail, receipt.amount]),
    ]},
    { name: 'Expenses', rows: [
      ['Category', 'Description', 'Paid from', 'Amount (KSh)', 'Reference'],
      ...digest.expenses.map(expense => [expense.category, expense.description, channelLabel(expense.channel), expense.amount, expense.reference]),
    ]},
    { name: 'Supplier payments', rows: [
      ['Description', 'Date', 'Method', 'Amount (KSh)', 'Reference'],
      ...digest.supplierPayments.map(payment => [payment.description, payment.date, channelLabel(payment.channel), payment.amount, payment.reference]),
    ]},
    { name: 'Stock on hand', rows: [
      ['Product', 'SKU', 'Quantity on hand', 'Unit', 'Cost per unit (KSh)', 'Stock value (KSh)', 'Reorder level', 'Status'],
      ...data.products.map(product => [product.name, product.sku, product.quantity, product.unit, product.costPrice, productValue(product), product.reorderLevel, product.quantity <= product.reorderLevel ? 'Reorder' : 'In stock']),
    ]},
    { name: 'Stock activity', rows: [
      ['Time', 'Activity', 'Source', 'Reference', 'Details', 'Status'],
      ...digest.inventoryActivity.map(event => [dateTimeLabel(event.time), event.type, event.source, event.reference, event.detail, event.status]),
    ]},
    { name: 'Supplier orders', rows: [
      ['Order', 'Supplier', 'Created', 'Expected', 'Status', 'Order value (KSh)'],
      ...digest.purchaseOrders.map(order => [order.number, order.supplierName, order.createdAt, order.expectedAt, order.status, order.total]),
    ]},
  ];
  const bytes = createXlsxWorkbook(sheets);
  const blob = new Blob([bytes.buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'hesabu-daily-report-' + digest.date + '.xlsx';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function ReportsPage({ data, metrics, whatsappNumber, onWhatsAppUnavailable, role, demoMode }: {
  data: AppData; metrics: ReturnType<typeof getMetrics>; whatsappNumber: string;
  onWhatsAppUnavailable: () => void; role: TeamRole; demoMode: boolean;
}) {
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('month');
  const todayDate = today();
  const currentMonthStart = todayDate.slice(0, 7) + '-01';
  const yearStart = todayDate.slice(0, 4) + '-01-01';
  const startDate = period === 'week' ? addDays(todayDate, -6) : period === 'month' ? currentMonthStart : yearStart;
  const elapsedDays = Math.max(1, Math.floor((Date.parse(todayDate + 'T12:00:00Z') - Date.parse(startDate + 'T12:00:00Z')) / 86400000) + 1);
  const periodLabel = period === 'week' ? 'Weekly' : period === 'month' ? 'Monthly' : 'Yearly';
  const postedInvoices = data.invoices.filter(invoice => invoice.status !== 'draft');

  const weeklyRows = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(todayDate, index - 6);
    const invoices = postedInvoices.filter(invoice => invoice.date === date && invoice.date <= todayDate);
    return {
      key: date,
      label: formatBusinessDay(date, { weekday: 'short' }),
      title: dateLabel(date),
      sales: sum(invoices.map(invoice => invoice.total)),
      cost: sum(invoices.map(invoice => sum(invoice.lines.map(line => line.unitCost * line.quantity)))),
    };
  });
  const monthYear = Number(todayDate.slice(0, 4));
  const monthNumber = Number(todayDate.slice(5, 7));
  const monthDayCount = new Date(Date.UTC(monthYear, monthNumber, 0)).getUTCDate();
  const monthlyWeekRows = Array.from({ length: Math.ceil(monthDayCount / 7) }, (_, index) => {
    const firstDay = index * 7 + 1;
    const lastDay = Math.min(monthDayCount, firstDay + 6);
    const bucketStart = todayDate.slice(0, 7) + '-' + String(firstDay).padStart(2, '0');
    const bucketEnd = todayDate.slice(0, 7) + '-' + String(lastDay).padStart(2, '0');
    const invoices = postedInvoices.filter(invoice => invoice.date >= bucketStart && invoice.date <= bucketEnd && invoice.date <= todayDate);
    return {
      key: bucketStart,
      label: firstDay + '–' + lastDay,
      title: dateLabel(bucketStart) + ' to ' + dateLabel(bucketEnd),
      sales: sum(invoices.map(invoice => invoice.total)),
      cost: sum(invoices.map(invoice => sum(invoice.lines.map(line => line.unitCost * line.quantity)))),
    };
  });
  const monthlyRows = Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, '0');
    const key = todayDate.slice(0, 4) + '-' + month;
    const invoices = postedInvoices.filter(invoice => invoice.date.slice(0, 7) === key && invoice.date <= todayDate);
    return {
      key,
      label: formatBusinessDay(key + '-01', { month: 'short' }),
      title: formatBusinessDay(key + '-01', { month: 'long', year: 'numeric' }),
      sales: sum(invoices.map(invoice => invoice.total)),
      cost: sum(invoices.map(invoice => sum(invoice.lines.map(line => line.unitCost * line.quantity)))),
    };
  });
  const dayRows = period === 'week' ? weeklyRows : period === 'month' ? monthlyWeekRows : monthlyRows;
  const filteredInvoices = postedInvoices.filter(invoice => invoice.date >= startDate && invoice.date <= todayDate);
  const sales = sum(filteredInvoices.map(invoice => invoice.total));
  const averageDailySales = sales / elapsedDays;
  const averageOrderValue = filteredInvoices.length ? sales / filteredInvoices.length : 0;
  const unitsSoldInPeriod = sum(filteredInvoices.flatMap(invoice => invoice.lines.map(line => line.quantity)));
  const grossProfitInPeriod = sum(filteredInvoices.map(marginValue));
  const productPerformance = data.products.map(product => {
    let unitsSold = 0, netSales = 0, itemCost = 0;
    filteredInvoices.forEach(invoice => invoice.lines.filter(line => line.productId === product.id).forEach(line => {
      unitsSold += line.quantity;
      netSales += invoice.subtotal > 0 ? invoice.total * (line.lineTotal / invoice.subtotal) : 0;
      itemCost += line.unitCost * line.quantity;
    }));
    return { product, unitsSold, netSales, itemCost, grossProfit: netSales - itemCost,
      marginRate: netSales > 0 ? ((netSales - itemCost) / netSales) * 100 : 0 };
  }).filter(item => item.unitsSold > 0).sort((a, b) => b.grossProfit - a.grossProfit).slice(0, 10);
  const max = Math.max(1, ...dayRows.flatMap(row => [row.sales, row.cost]));
  const digest = getDailyDigest(data);

  return <div className="page-stack">
    <PageHeader title="Analytics" description="Understand sales, margin, customer balances and business performance." actions={<Button variant="outline" onClick={() => window.print()}><Download size={15} /> Print report</Button>} />
    <SectionCard title="Today's business digest" detail="Daily operations, with clear numbers and downloadable records." className="daily-digest-print">
      <div className="daily-digest-metrics">
        <div><span>Sales today</span><strong>{money(digest.salesTotal)}</strong><small>{digest.sales.length} sales recorded</small></div>
        <div><span>Payments received</span><strong>{money(digest.receivedTotal)}</strong><small>Matched and unmatched receipts</small></div>
        {role !== 'Sales' && <div><span>Expenses</span><strong>{money(digest.expenseTotal)}</strong><small>Operating expenses recorded</small></div>}
        <div><span>Gross profit</span><strong>{money(digest.grossProfit)}</strong><small>After recorded product cost</small></div>
      </div>
      <div className="daily-digest-lower">
        {role !== 'Sales' && <span>{money(digest.supplierPaymentTotal)} supplier payments</span>}
        <span>{numberText(digest.unitsSold)} units sold</span>
        {role !== 'Sales' && <span>{numberText(digest.purchaseOrders.length)} supplier orders raised</span>}
        {(role === 'Owner' || role === 'Manager') && <span>{numberText(digest.inventoryActivity.length)} stock updates</span>}
        <span>{numberText(digest.lowStock.length)} products at reorder level</span>
      </div>
      <div className="daily-digest-actions">
        <Button variant="outline" onClick={() => downloadDailyWorkbook(data)}><FileSpreadsheet size={16} /> Download Excel workbook</Button>
        <Button variant="outline" onClick={() => window.print()}><FileText size={16} /> Save as PDF</Button>
        {demoMode
          ? <Button variant="outline" disabled><MessageCircle size={16} /> WhatsApp disabled in demo</Button>
          : <Button onClick={() => openDailyDigestWhatsApp(data, whatsappNumber, onWhatsAppUnavailable)}><MessageCircle size={16} /> Prepare WhatsApp summary</Button>}
      </div>
      <p className="daily-digest-note">{demoMode
        ? 'These are illustrative sample figures. External sharing and live integrations are disabled while exploring the demo.'
        : 'The workbook is generated from the latest records loaded for this business. WhatsApp opens a prepared chat to your saved destination; review the message and send it in WhatsApp. Automatic delivery is not enabled.'}</p>
    </SectionCard>
    <div className="metric-grid metric-grid-six compact-metrics">
      <MetricCard label="Sales recorded" value={money(sales)} note={filteredInvoices.length + ' invoices · ' + periodLabel.toLowerCase()} icon={TrendingUp} tone="green" />
      <MetricCard label="Average daily sales" value={money(averageDailySales)} note="Includes days with no sales" icon={BarChart3} tone="green" />
      <MetricCard label="Average sale" value={money(averageOrderValue)} note="Sales value per invoice" icon={Receipt} tone="blue" />
      <MetricCard label="Gross profit" value={money(grossProfitInPeriod)} note="After recorded item cost" icon={Activity} tone="blue" />
      <MetricCard label="Gross margin" value={(sales > 0 ? (grossProfitInPeriod / sales) * 100 : 0).toFixed(1) + '%'} note="Gross profit as share of sales" icon={TrendingUp} tone="slate" />
      <MetricCard label="Units sold" value={numberText(unitsSoldInPeriod)} note="Across the selected period" icon={Package} tone="amber" />
    </div>
    <SectionCard title="Trading performance" detail="Sales and cost of goods sold grouped by day for the last week, week for the current month, or month for the current year." action={<div className="segmented-control">
      <button className={period === 'week' ? 'active' : ''} onClick={() => setPeriod('week')}>Weekly</button>
      <button className={period === 'month' ? 'active' : ''} onClick={() => setPeriod('month')}>Monthly</button>
      <button className={period === 'year' ? 'active' : ''} onClick={() => setPeriod('year')}>Yearly</button>
    </div>}>
      <div className="report-chart-legend"><span><i className="legend-dot legend-green" /> Sales</span><span><i className="legend-dot legend-blue" /> Cost of goods sold</span></div>
      <div className={'report-bars ' + (period === 'year' ? 'report-bars-year' : period === 'month' ? 'report-bars-month' : '')}>
        {dayRows.map(row => <div className="report-bar-column" key={row.key} title={row.title + ': ' + money(row.sales)}>
          <div className="report-bar-space">
            <div className="report-bar report-bar-sales" style={{ height: Math.max(2, row.sales / max * 100) + '%' }} />
            <div className="report-bar report-bar-cost" style={{ height: Math.max(2, row.cost / max * 100) + '%' }} />
          </div>
          <span>{row.label}</span>
        </div>)}
      </div>
    </SectionCard>
    <div className="content-grid content-grid-main">
      <SectionCard title="Product contribution" detail="Net sales, product cost and gross profit by item after allocating invoice discounts.">
        {productPerformance.length ? <DataTable headers={['Product', 'Units', 'Net sales', 'Item cost', 'Gross profit', 'Margin']}>
          {productPerformance.map(item => <tr key={item.product.id}>
            <td><strong>{item.product.name}</strong><small className="cell-sub">{item.product.sku}</small></td>
            <td>{numberText(item.unitsSold)}</td><td className="amount-cell">{money(item.netSales)}</td><td className="amount-cell">{money(item.itemCost)}</td>
            <td className="amount-cell">{money(item.grossProfit)}</td><td>{item.marginRate.toFixed(1)}%</td>
          </tr>)}
        </DataTable> : <EmptyState title="No product sales in this period" body="Recorded sales will show which products contribute most to gross profit." />}
      </SectionCard>
      {role === 'Sales' ? <SectionCard title="Customer balances" detail="Invoices that still need payment.">
        <div className="working-capital-list">
          <div><span>Customer receivables</span><strong>{money(metrics.receivables)}</strong></div>
          <div><span>Open invoices</span><strong>{numberText(metrics.unpaidInvoices)}</strong></div>
        </div>
      </SectionCard> : <SectionCard title="Working capital" detail="Short-term funds tied up in operations">
        <div className="working-capital-list">
          <div><span>Cash and bank balances</span><strong>{money(metrics.cashPosition)}</strong></div>
          <div><span>Customer receivables</span><strong>{money(metrics.receivables)}</strong></div>
          <div><span>Inventory at cost</span><strong>{money(metrics.inventoryValue)}</strong></div>
          <div><span>Supplier payables</span><strong className="negative-text">{money(metrics.payables)}</strong></div>
          <div className="working-capital-total"><span>Net operating working capital</span><strong>{money(metrics.cashPosition + metrics.receivables + metrics.inventoryValue - metrics.payables - metrics.customerAdvances)}</strong></div>
        </div>
      </SectionCard>}
    </div>
    <div className="report-footnote">Reports use the dates and costs recorded in this workspace. They are not audited financial statements or tax returns.</div>
  </div>;
}

function EmbeddedCheckoutDemo({ profile, products, onCreateOrder }: {
  profile: BusinessProfile;
  products: Product[];
  onCreateOrder: (input: { productId: string; quantity: number; customer: string; phone: string }) => void;
}) {
  const availableProducts = products.filter(product => product.quantity > 0);
  const [productId, setProductId] = useState(availableProducts[0]?.id || '');
  const [quantity, setQuantity] = useState('1');
  const [customer, setCustomer] = useState('Maua Cafe');
  const [phone, setPhone] = useState('0718 230 011');
  const product = availableProducts.find(item => item.id === productId);
  const qty = Math.max(0, Number(quantity) || 0);
  const total = product ? product.sellingPrice * qty : 0;
  const invalid = !product || !customer.trim() || !phone.trim() || qty <= 0 || qty > (product?.quantity ?? 0);

  return <div className="embedded-checkout-demo">
    <div className="embedded-demo-heading">
      <div>
        <div className="eyebrow">ONLINE ORDER</div>
        <h3>Place a sample order</h3>
        <p>Try the customer ordering experience using this business’s product catalogue.</p>
      </div>
      <StatusPill status="delivered">Sample store</StatusPill>
    </div>
    <div className="embedded-demo-layout">
      <div className="embedded-storefront">
        <div className="embedded-storefront-brand">
          <div className="embedded-storefront-mark">{profile.name.trim().charAt(0).toUpperCase() || 'S'}</div>
          <div><strong>{profile.name}</strong><small>Online order</small></div>
          <span className="secure-label">Sample storefront</span>
        </div>
        <div className="embedded-storefront-title">Complete your order</div>
        <form className="embedded-storefront-form" onSubmit={event => {
          event.preventDefault();
          if (!invalid && product) onCreateOrder({ productId, quantity: qty, customer: customer.trim(), phone: phone.trim() });
        }}>
          <SelectField label="Product" value={productId} onChange={value => setProductId(value)}
            options={availableProducts.map(item => ({ value: item.id, label: item.name + ' · ' + money(item.sellingPrice) }))} />
          <div className="form-grid form-grid-two">
            <Field label="Quantity" type="number" min={1} step={1} value={quantity} onChange={setQuantity} />
            <Field label="Customer name" value={customer} onChange={setCustomer} required />
          </div>
          <Field label="Customer phone" value={phone} onChange={setPhone} required placeholder="07XX XXX XXX" />
          <div className="embedded-checkout-total">
            <div><span>Order total</span><small>{product ? product.name + ' × ' + numberText(qty) : 'Select an in-stock item'}</small></div>
            <strong>{money(total)}</strong>
          </div>
          {product && qty > product.quantity && <div className="validation-note"><AlertTriangle size={14} /> Only {numberText(product.quantity)} units are currently available.</div>}
          <Button type="submit" block disabled={invalid}>Place sample order</Button>
          <div className="embedded-checkout-footnote">This is a sample order. It will appear in the Sales register and update the product quantity.</div>
        </form>
      </div>
      <div className="embedded-flow">
        <div className="embedded-flow-title">One connected business</div>
        <div className="embedded-flow-step"><span>1</span><div><strong>Easy for customers</strong><small>Choose an item and place an order</small></div></div>
        <div className="embedded-flow-step"><span>2</span><div><strong>Clear for your team</strong><small>Online orders appear with other sales</small></div></div>
        <div className="embedded-flow-step"><span>3</span><div><strong>Stock stays current</strong><small>Product quantities update as sales are recorded</small></div></div>
        <div className="embedded-flow-note">Keep the website you already have. Give the team one place to run the business.</div>
      </div>
    </div>
  </div>;
}

function SalesChannelsPage({ data, onCreateDemoOrder, cloudMode, onNavigate }: {
  data: AppData;
  onCreateDemoOrder: (input: { productId: string; quantity: number; customer: string; phone: string }) => void;
  cloudMode: boolean;
  onNavigate: (section: ModuleKey) => void;
}) {
  return <div className="page-stack sales-channels-page">
    <PageHeader title="Sales channels" description="Run counter and wholesale orders from one register. Connect your existing website when you are ready to receive online orders." />
    <div className="sales-channel-grid sales-channel-grid-detailed">
      <article className="sales-channel-card sales-channel-card-active">
        <div className="sales-channel-card-top">
          <span className="sales-channel-icon"><Store size={21} /></span>
          <span className="sales-channel-status is-available">Available now</span>
        </div>
        <div className="sales-channel-kicker">IN STORE</div>
        <h3>Counter sales</h3>
        <p>For customers buying directly from your shop. Each posted sale updates the product quantities and business records.</p>
        <ol className="sales-channel-steps">
          <li>Open Sales and choose Record sale.</li>
          <li>Select Walk-in sale, add products and quantities.</li>
          <li>Choose Cash, M-Pesa, bank or card, then post the sale.</li>
        </ol>
        <Button block onClick={() => onNavigate('sales')}>Open sales register <ArrowRight size={15} /></Button>
      </article>
      <article className="sales-channel-card">
        <div className="sales-channel-card-top">
          <span className="sales-channel-icon"><ShoppingCart size={21} /></span>
          <span className="sales-channel-status is-available">Available through Sales</span>
        </div>
        <div className="sales-channel-kicker">WHOLESALE & PHONE ORDERS</div>
        <h3>Bulk and repeat orders</h3>
        <p>For hotels, resellers and regular customers ordering by phone or in person. Use the same catalogue; do not create a second stock list.</p>
        <ol className="sales-channel-steps">
          <li>Open Sales and choose Record sale.</li>
          <li>Enter the customer or account name and add bulk quantities.</li>
          <li>Choose Customer credit / debt if payment is due later, or Pay on delivery if collecting on delivery.</li>
        </ol>
        <Button block variant="outline" onClick={() => onNavigate('sales')}>Record a bulk order <ArrowRight size={15} /></Button>
      </article>
      <article className="sales-channel-card sales-channel-card-online">
        <div className="sales-channel-card-top">
          <span className="sales-channel-icon"><Smartphone size={21} /></span>
          <span className="sales-channel-status is-unavailable">Not connected</span>
        </div>
        <div className="sales-channel-kicker">ONLINE</div>
        <h3>Website orders</h3>
        <p>For customers ordering from your own website. A secure connection must deliver each order into Hesabu before it can be treated as a real sale.</p>
        <div className="sales-channel-requirements">
          <strong>What needs to be connected</strong>
          <ul>
            <li>Your website checkout or ecommerce platform</li>
            <li>A secure order webhook and verification secret</li>
            <li>Product SKU matching and order-status handling</li>
          </ul>
        </div>
        <span className="sales-channel-unavailable-note">No live website is connected. Do not use the sample checkout to accept customer payments.</span>
      </article>
    </div>
    <SectionCard title="One order register, one stock balance" detail="Regardless of where the order starts, the intended workflow is the same.">
      <div className="sales-channel-flow">
        <div><span>01</span><strong>Order received</strong><p>At the counter, by phone, or through a connected website.</p></div>
        <div><span>02</span><strong>Products matched</strong><p>Hesabu uses the existing product catalogue and quantities.</p></div>
        <div><span>03</span><strong>Sale recorded</strong><p>Payment, outstanding balance and stock movement are recorded together.</p></div>
        <div><span>04</span><strong>Owner sees one view</strong><p>Sales, cash position, customer balances and reports stay together.</p></div>
      </div>
    </SectionCard>
    {cloudMode
      ? <SectionCard title="Website order connection" detail="Live online checkout is not enabled for this business yet.">
          <EmptyState title="No website is connected" body="Ask your website developer to integrate a secure Hesabu order webhook. Until that integration is configured and tested, record website or phone enquiries manually through Sales and confirm stock before accepting payment." />
        </SectionCard>
      : <SectionCard title="Sample online checkout" detail="This is a demonstration of the customer ordering experience, not a live storefront.">
          <div className="sales-channel-demo-warning">Sample mode only · Orders created here affect this local sample workspace. They are not sent to a real website, customer or payment provider.</div>
          <EmbeddedCheckoutDemo profile={data.profile} products={data.products} onCreateOrder={onCreateDemoOrder} />
        </SectionCard>}
  </div>;
}
function MorePage({ allowedModules, onNavigate }: {
  allowedModules: ModuleKey[]; onNavigate: (section: ModuleKey) => void;
}) {
  const allDestinations: Array<{ id: ModuleKey; title: string; description: string; icon: LucideIcon }> = [
    { id: 'reports', title: 'Reports & daily digest', description: 'Business numbers, Excel workbooks and PDF summaries.', icon: BarChart3 },
    { id: 'procurement', title: 'Supplier orders', description: 'Create orders, receive goods and follow supplier balances.', icon: ShoppingCart },
    { id: 'accounts', title: 'Financial records', description: 'Account balances, journals and trial balance.', icon: BookOpen },
    { id: 'integrations', title: 'Sales channels', description: 'Review counter, website and wholesale order flows.', icon: Link2 },
    { id: 'settings', title: 'Team & settings', description: 'Business details, team roles and appearance.', icon: Settings },
  ];
  const destinations = allDestinations.filter(item => allowedModules.includes(item.id));
  return <div className="page-stack">
    <PageHeader title="More" description="Less frequent tools are kept here so daily work stays simple." />
    <div className="more-destinations">{destinations.map(item => {
      const Icon = item.icon;
      return <button type="button" className="more-destination" key={item.id} onClick={() => onNavigate(item.id)}>
        <span className="more-destination-icon"><Icon size={21} /></span>
        <span className="more-destination-copy"><strong>{item.title}</strong><small>{item.description}</small></span>
        <ChevronRight size={18} />
      </button>;
    })}</div>
  </div>;
}

function SettingsPage({ profile, teamMembers, teamInvitations, onSave, onAddMember, onUpdateMember, onRevokeInvitation, onCopyInvitation, canManageTeam, canAssignManager, onReset, theme, onThemeChange, onOpenReports, whatsappNumber, onWhatsAppNumberChange, onSaveWhatsApp, cloudMode, onSignOut, demoMode }: {
  profile: BusinessProfile; teamMembers: TeamMember[]; teamInvitations: TeamInvitation[];
  onSave: (profile: BusinessProfile) => void;
  onAddMember: (input: { name: string; email: string; role: TeamRole }) => Promise<boolean>;
  onUpdateMember: (id: string, patch: Partial<TeamMember>) => void;
  onRevokeInvitation: (id: string) => void; onCopyInvitation: (token: string) => void;
  canManageTeam: boolean; canAssignManager: boolean;
  onReset: () => void; theme: 'dark' | 'light'; onThemeChange: (theme: 'dark' | 'light') => void; onOpenReports: () => void;
  whatsappNumber: string; onWhatsAppNumberChange: (value: string) => void;
  onSaveWhatsApp: () => void; cloudMode: boolean; onSignOut: () => void; demoMode: boolean;
}) {
  const [tab, setTab] = useState<'profile' | 'team' | 'preferences'>('profile');
  const [form, setForm] = useState(profile);
  const [saved, setSaved] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [memberName, setMemberName] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState<TeamRole>('Sales');
  const update = (key: keyof BusinessProfile, value: string) => {
    setSaved(false); setForm(current => ({ ...current, [key]: value }));
  };
  const roleDescriptions: Record<TeamRole, string> = {
    Owner: 'Business profile, all records and team administration',
    Manager: 'Sales, stock, purchasing and business reports',
    Sales: 'Counter sales, invoices and customer balances',
    Inventory: 'Product catalogue, stock counts and deliveries',
    Finance: 'Payments, account balances and financial reports',
  };
  const submitMember = async (event: FormEvent) => {
    event.preventDefault();
    if (!memberName.trim() || !memberEmail.trim()) return;
    const created = await onAddMember({ name: memberName.trim(), email: memberEmail.trim(), role: memberRole });
    if (!created) return;
    setMemberName(''); setMemberEmail(''); setMemberRole('Sales'); setShowAdd(false);
  };
  return <div className="page-stack">
    <PageHeader title={cloudMode ? 'Business settings' : 'Team & settings'} description={cloudMode
      ? 'Manage your business details and account preferences.'
      : 'Manage your business details and the people responsible for daily operations.'} />
    <SectionCard title="Business administration" detail="Business identity and team responsibilities.">
      <div className="section-tabs">
        <button className={tab === 'profile' ? 'active' : ''} onClick={() => setTab('profile')}>Business profile</button>
        <button className={tab === 'team' ? 'active' : ''} onClick={() => setTab('team')}>Team <span>{teamMembers.length}</span></button>
        <button className={tab === 'preferences' ? 'active' : ''} onClick={() => setTab('preferences')}>Preferences</button>
      </div>
      {tab === 'profile' ? <form className="settings-form" onSubmit={event => {
        event.preventDefault(); onSave(form); if (!cloudMode) setSaved(true);
      }}>
        <div className="form-grid form-grid-two">
          <Field label="Business name" value={form.name} onChange={value => update('name', value)} required />
          <Field label="Registered name" value={form.legalName} onChange={value => update('legalName', value)} />
        </div>
        <div className="form-grid form-grid-two">
          <Field label="Business phone" value={form.phone} onChange={value => update('phone', value)} />
          <Field label="Business email" value={form.email} onChange={value => update('email', value)} />
        </div>
        <div className="form-grid form-grid-two">
          <Field label="Location" value={form.location} onChange={value => update('location', value)} />
          <Field label="Business type" value={form.industry} onChange={value => update('industry', value)} />
        </div>
        <div className="settings-form-footer">{saved && <span className="saved-inline"><CheckCircle2 size={14} /> Saved</span>}<Button type="submit">Save changes</Button></div>
      </form> : tab === 'team' ? <>
        <div className="team-header-row">
          <div><strong>{teamMembers.filter(member => member.status === 'active').length} active team members</strong><p>Each person signs in with their own account. Permissions are enforced by the database.</p></div>
          {canManageTeam && <Button onClick={() => setShowAdd(value => !value)}><Plus size={15} /> Invite member</Button>}
        </div>
        {showAdd && <form className="team-invite-form" onSubmit={submitMember}>
          <div className="form-grid form-grid-two">
            <Field label="Full name" value={memberName} onChange={setMemberName} required placeholder="Team member name" />
            <Field label="Email address" value={memberEmail} onChange={setMemberEmail} required placeholder="name@business.com" />
          </div>
          <div className="form-grid form-grid-two">
            <SelectField label="Responsibility" value={memberRole} onChange={value => setMemberRole(value as TeamRole)} options={[
              ...(canAssignManager ? [{ value: 'Manager', label: 'Manager' }] : []),
              { value: 'Sales', label: 'Sales' }, { value: 'Inventory', label: 'Inventory' }, { value: 'Finance', label: 'Finance' },
            ]} />
            <div className="team-role-description"><strong>{memberRole}</strong><span>{roleDescriptions[memberRole]}</span></div>
          </div>
          <p className="team-invite-explainer">A single-use invitation link will be copied for sharing. The recipient must sign in or create an account with this email address to gain access. Links expire after seven days.</p>
          <div className="inline-form-actions"><Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button><Button type="submit" disabled={!memberName.trim() || !memberEmail.trim()}>Create invitation</Button></div>
        </form>}
        <div className="team-role-grid">
          {(Object.keys(roleDescriptions) as TeamRole[]).filter(role => role !== 'Owner').map(role => <div key={role}><strong>{role}</strong><span>{roleDescriptions[role]}</span></div>)}
        </div>
        <DataTable headers={['Team member', 'Responsibility', 'Status', '']}>
          {teamMembers.map(member => {
            const canManageMember = canManageTeam && member.role !== 'Owner' && (canAssignManager || member.role !== 'Manager');
            return <tr key={member.id}>
              <td><strong>{member.name}</strong><small className="cell-sub">{member.email}</small></td>
              <td>{member.role === 'Owner' ? 'Owner' : <select className="team-role-select" value={member.role} disabled={!canManageMember} onChange={event => onUpdateMember(member.id, { role: event.target.value as TeamRole })}>
                {canAssignManager && <option value="Manager">Manager</option>}
                <option value="Sales">Sales</option><option value="Inventory">Inventory</option><option value="Finance">Finance</option>
              </select>}</td>
              <td><StatusPill status={member.status === 'active' ? 'delivered' : 'draft'}>{member.status === 'active' ? 'Active' : 'Suspended'}</StatusPill></td>
              <td>{member.role === 'Owner' ? <span className="muted-copy">Owner</span> : <button className="table-action" disabled={!canManageMember} onClick={() => onUpdateMember(member.id, { status: member.status === 'active' ? 'suspended' : 'active' })}>{member.status === 'active' ? 'Suspend' : 'Activate'}</button>}</td>
            </tr>;
          })}
        </DataTable>
        {canManageTeam && <div className="team-invitations-section">
          <div className="team-invitations-heading"><strong>Invitations</strong><span>{teamInvitations.filter(item => item.status === 'pending').length} awaiting acceptance</span></div>
          {teamInvitations.length ? <DataTable headers={['Invited person', 'Role', 'Status', 'Expires', '']}>
            {teamInvitations.map(invitation => <tr key={invitation.id}>
              <td><strong>{invitation.name}</strong><small className="cell-sub">{invitation.email}</small></td>
              <td>{invitation.role}</td>
              <td><StatusPill status={invitation.status === 'accepted' ? 'delivered' : invitation.status === 'pending' ? 'pending' : 'failed'}>{invitation.status.charAt(0).toUpperCase() + invitation.status.slice(1)}</StatusPill></td>
              <td>{dateLabel(invitation.expiresAt.slice(0,10))}</td>
              <td>{invitation.status === 'pending' ? <><button className="table-action" onClick={() => onCopyInvitation(invitation.token)}>Copy link</button><button className="table-action" onClick={() => onRevokeInvitation(invitation.id)}>Revoke</button></> : <span className="muted-copy">—</span>}</td>
            </tr>)}
          </DataTable> : <EmptyState title="No invitations yet" body="New invitations appear here until accepted or expired." />}
        </div>}
      </> : <div className="settings-preferences">
        <section className="preference-block">
          <div><strong>Appearance</strong><p>White is the default. Choose dark mode if you prefer a darker workspace.</p></div>
          <div className="theme-choice-group">
            <button type="button" className={theme === 'dark' ? 'theme-choice theme-choice-active' : 'theme-choice'} onClick={() => onThemeChange('dark')}><Moon size={19} /><span><strong>Dark</strong><small>Dark workspace</small></span></button>
            <button type="button" className={theme === 'light' ? 'theme-choice theme-choice-active' : 'theme-choice'} onClick={() => onThemeChange('light')}><Sun size={19} /><span><strong>Light</strong><small>Default</small></span></button>
          </div>
        </section>
        {demoMode
          ? <section className="preference-block">
              <div><strong>External integrations</strong><p>Live M-Pesa requests, automatic reconciliation and external WhatsApp messages are not available in this sample workspace.</p></div>
              <div className="demo-integration-note">You can explore the payment-request simulator and reports using sample records. Nothing is sent to Safaricom or WhatsApp.</div>
              <div className="inline-form-actions"><Button variant="outline" onClick={onOpenReports}>Open daily digest</Button></div>
            </section>
          : <section className="preference-block">
              <div><strong>WhatsApp daily digest</strong><p>Choose the number that should receive the prepared daily summary. Hesabu opens the chat for you to review and send.</p></div>
              <Field label="WhatsApp destination" value={whatsappNumber} onChange={onWhatsAppNumberChange} placeholder="2547XXXXXXXX" hint="Use country code, e.g. 254712345678. You can also enter a Kenyan number beginning with 07 or 01." />
              <div className="inline-form-actions">
                <Button size="sm" variant="outline" disabled={!form.phone.trim()} onClick={() => onWhatsAppNumberChange(form.phone)}>
                  Use business phone{form.phone.trim() ? ' · ' + form.phone.trim() : ''}
                </Button>
              </div>
              <div className="whatsapp-connection-note"><MessageCircle size={16} /><span>{cloudMode
                ? 'Hesabu prepares the summary from saved business records and opens WhatsApp for you to review and send. Automatic scheduled delivery is not connected.'
                : 'Click-to-chat is available in this preview. Automatic scheduled messages and attachments need the WhatsApp Business API connected on a secure server.'}</span></div>
              <div className="inline-form-actions">
                {cloudMode && <Button variant="outline" onClick={onSaveWhatsApp}>Save destination</Button>}
                <Button variant="outline" onClick={onOpenReports}>Open daily digest</Button>
              </div>
            </section>}
      </div>}
    </SectionCard>
    {cloudMode
      ? <div className="settings-reset-row">
          <div><strong>Account session</strong><small>Sign out of {profile.email || 'this Hesabu account'} on this device.</small></div>
          <Button variant="outline" size="sm" onClick={onSignOut}><LogOut size={14} /> Sign out</Button>
        </div>
      : <div className="settings-reset-row">
          <div><strong>Reset sample workspace</strong><small>Restore the original example business and sample activity.</small></div>
          <Button variant="outline" size="sm" onClick={onReset}>Reset workspace</Button>
        </div>}
  </div>;
}

function getMetrics(data: AppData) {
  const currentMonth = today().slice(0, 7);
  const postedInvoices = data.invoices.filter(invoice => invoice.status !== 'draft');
  const monthInvoices = postedInvoices.filter(invoice => invoice.date.slice(0, 7) === currentMonth);
  const salesToday = sum(postedInvoices.filter(invoice => invoice.date === today()).map(invoice => invoice.total));
  const collectedToday = sum(data.payments.filter(payment =>
    payment.status === 'succeeded' && dateKey(new Date(payment.createdAt)) === today(),
  ).map(payment => payment.amount));
  const totalRevenue = sum(postedInvoices.map(invoice => invoice.total));
  const grossProfitMonth = sum(monthInvoices.map(marginValue));
  const receivables = sum(postedInvoices.map(invoiceBalance));
  const payables = sum(data.suppliers.map(supplier => supplier.balance));
  const customerAdvances = sum(data.payments.filter(payment => payment.status === 'succeeded').map(payment => payment.unappliedAmount ?? 0));
  const inventoryValue = sum(data.products.map(productValue));
  const totalExpenses = sum(data.expenses.map(expense => expense.amount));
  const channelOutflow = (channel: 'cash' | 'mpesa' | 'bank' | 'card') =>
    sum(data.expenses.filter(expense => expense.channel === channel).map(expense => expense.amount)) +
    sum((data.cashMovements ?? []).filter(movement => movement.channel === channel && movement.direction === 'out').map(movement => movement.amount));
  const channelBalances = {
    cash: data.openingBalances.cash + sum(data.payments.filter(payment => payment.status === 'succeeded' && payment.channel === 'cash').map(payment => payment.amount)) - channelOutflow('cash'),
    mpesa: data.openingBalances.mpesa + sum(data.payments.filter(payment => payment.status === 'succeeded' && payment.channel === 'mpesa').map(payment => payment.amount)) - channelOutflow('mpesa'),
    bank: data.openingBalances.bank + sum(data.payments.filter(payment => payment.status === 'succeeded' && payment.channel === 'bank').map(payment => payment.amount)) - channelOutflow('bank'),
    card: sum(data.payments.filter(payment => payment.status === 'succeeded' && payment.channel === 'card').map(payment => payment.amount)) - channelOutflow('card'),
  };
  const cashPosition = channelBalances.cash + channelBalances.mpesa + channelBalances.bank + channelBalances.card;
  const costOfGoodsSold = sum(postedInvoices.map(invoice => sum(invoice.lines.map(line => line.unitCost * line.quantity))));
  return {
    salesToday, collectedToday, grossProfitMonth, cashPosition, receivables, payables, customerAdvances,
    inventoryValue, expenses: totalExpenses, totalRevenue, costOfGoodsSold,
    channelBalances, unpaidInvoices: postedInvoices.filter(invoice => invoiceBalance(invoice) > 0).length,
  };
}

function recordJournal(
  current: AppData, accountDebit: string, accountCredit: string, amount: number,
  description: string, reference: string, postedDate = today(),
): AppData['journal'] {
  const journalId = makeId('JRN');
  return [
    ...current.journal,
    ...buildJournalPair({
      journalId, date: postedDate, debitAccount: accountDebit, creditAccount: accountCredit,
      amount, description, reference,
    }),
  ];
}

const PENDING_ONBOARDING_KEY = 'hesabu:pending-onboarding:v1';

function savePendingOnboarding(input: SignUpInput) {
  const { password: _password, ...safeDraft } = input;
  try { localStorage.setItem(PENDING_ONBOARDING_KEY, JSON.stringify(safeDraft)); }
  catch { /* The account can still be created; confirmation recovery may need the user to repeat setup. */ }
}

function readPendingOnboarding(
  email?: string,
  userMetadata?: Record<string, unknown>,
): Omit<SignUpInput, 'password'> | null {
  try {
    const raw = localStorage.getItem(PENDING_ONBOARDING_KEY);
    if (raw) {
      const draft = JSON.parse(raw) as Omit<SignUpInput, 'password'>;
      if (draft?.email && draft.businessName && (!email || draft.email.toLowerCase() === email.toLowerCase())) {
        return draft;
      }
    }
  } catch {
    // Fall back to the non-authoritative onboarding details in Auth user metadata.
  }

  const rawMetadata = userMetadata?.business_onboarding;
  if (!rawMetadata || typeof rawMetadata !== 'object' || Array.isArray(rawMetadata)) return null;
  const draft = rawMetadata as Record<string, unknown>;
  const draftEmail = String(draft.email ?? email ?? '').trim();
  const businessName = String(draft.business_name ?? '').trim();
  if (!businessName || !draftEmail || (email && draftEmail.toLowerCase() !== email.toLowerCase())) return null;

  return {
    fullName: String(userMetadata?.display_name ?? ''),
    businessName,
    industry: String(draft.industry ?? ''),
    phone: String(draft.phone ?? ''),
    email: draftEmail,
    aiAssistantEnabled: draft.ai_assistant_enabled === true,
    whatsappDigestEnabled: draft.whatsapp_digest_enabled === true,
    whatsappRecipientPhone: String(draft.whatsapp_recipient_phone ?? ''),
  };
}
function clearPendingOnboarding() {
  try { localStorage.removeItem(PENDING_ONBOARDING_KEY); } catch { /* No-op when storage is disabled. */ }
}

const PENDING_TEAM_INVITATION_KEY = 'hesabu:pending-team-invitation:v1';
function readPendingTeamInvitation() {
  try {
    const token = localStorage.getItem(PENDING_TEAM_INVITATION_KEY);
    return token && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token) ? token : null;
  } catch { return null; }
}
function capturePendingTeamInvitation() {
  try {
    const url = new URL(window.location.href);
    const token = url.searchParams.get('invite');
    if (token && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) {
      localStorage.setItem(PENDING_TEAM_INVITATION_KEY, token);
      url.searchParams.delete('invite');
      window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
    }
  } catch { /* Sign-in remains usable when storage is blocked. */ }
  return readPendingTeamInvitation();
}
function clearPendingTeamInvitation() {
  try { localStorage.removeItem(PENDING_TEAM_INVITATION_KEY); } catch { /* No-op. */ }
}

function App() {
  const [data, setData] = useState<AppData>(() => EMPTY_WORKSPACE_DATA);
  const [demoMode, setDemoMode] = useState(false);
  const [cloudAccount, setCloudAccount] = useState<{
    user: SupabaseUser;
    business: { id: string; name: string; industry: string | null };
  } | null>(null);
  const [cloudRestoring, setCloudRestoring] = useState(true);
  const [cloudWorkspaceReady, setCloudWorkspaceReady] = useState(false);
  const [cloudWorkspaceLoading, setCloudWorkspaceLoading] = useState(false);
  const [cloudWorkspaceError, setCloudWorkspaceError] = useState('');
  const [offlineMode, setOfflineMode] = useState(!navigator.onLine);
  const [authNotice, setAuthNotice] = useState('');
  const [showAuthScreen, setShowAuthScreen] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [pendingInviteToken, setPendingInviteToken] = useState<string | null>(() => capturePendingTeamInvitation());
  const [whatsappNumber, setWhatsAppNumber] = useState(() => {
    try { return localStorage.getItem('hesabu:whatsapp-number:v1') || ''; }
    catch { return ''; }
  });
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try { return localStorage.getItem('hesabu:theme:v2') === 'dark' ? 'dark' : 'light'; }
    catch { return 'light'; }
  });
  const [activeMemberId, setActiveMemberId] = useState('');
  const [active, setActive] = useState<ModuleKey>('overview');
  const [dialog, setDialog] = useState<DialogState>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<Notice>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<(Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }) | null>(null);
  const [appInstalled, setAppInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));

  const startDemo = () => {
    setData(makePublicDemoData());
    setCloudAccount(null);
    setCloudWorkspaceReady(true);
    setCloudWorkspaceError('');
    setCloudWorkspaceLoading(false);
    setWhatsAppNumber('');
    setOfflineMode(false);
    setActiveMemberId('');
    setActive('overview');
    setDialog(null);
    setSelectedInvoiceId(null);
    setNotice(null);
    setProfileMenuOpen(false);
    setDemoMode(true);
    setShowAuthScreen(false);
  };
  const resetDemo = () => {
    setData(makePublicDemoData());
    setActive('overview');
    setDialog(null);
    setSelectedInvoiceId(null);
    setNotice({ title: 'Sample workspace reset', detail: 'The example business has been restored to its original sample records.' });
  };
  const exitDemo = () => {
    setDemoMode(false);
    setData(EMPTY_WORKSPACE_DATA);
    setWhatsAppNumber('');
    setActive('overview');
    setActiveMemberId('');
    setDialog(null);
    setSelectedInvoiceId(null);
    setNotice(null);
    setProfileMenuOpen(false);
    setShowAuthScreen(false);
    setCloudWorkspaceReady(false);
  };
  const openAccountCreation = () => {
    if (demoMode) {
      setDemoMode(false);
      setData(EMPTY_WORKSPACE_DATA);
      setWhatsAppNumber('');
      setActive('overview');
    }
    setAuthInitialMode('signup');
    setShowAuthScreen(true);
  };

  useEffect(() => {
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> });
    };
    const installed = () => { setAppInstalled(true); setInstallPrompt(null); };
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const restore = async () => {
      const recovery = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('type') === 'recovery';
      if (recovery) { setAuthInitialMode('reset'); setShowAuthScreen(true); return; }
      const result = await restoreCloudSession();
      if (!active) return;
      const token = readPendingTeamInvitation();
      if (!result) {
        if (token) {
          setPendingInviteToken(token);
          setAuthInitialMode('signup');
          setShowAuthScreen(true);
          setAuthNotice('You have been invited to a Hesabu business. Use the invited email address to continue.');
        }
        return;
      }
      if (token) {
        const businessId = await acceptCloudBusinessInvitation(token);
        clearPendingTeamInvitation();
        setPendingInviteToken(null);
        const memberships = await listMyBusinesses();
        const invited = memberships.find(item => item.business_id === businessId && item.businesses?.id);
        if (!invited?.businesses) throw new Error('The invitation was accepted but the business could not be loaded.');
        setCloudAccount({ user: result.user, business: { id: invited.businesses.id, name: invited.businesses.name, industry: invited.businesses.industry } });
        setAuthNotice('');
        setShowAuthScreen(false);
        return;
      }
      const membership = result.memberships.find(item => item.businesses?.id);
      if (!membership?.businesses) {
        const pending = readPendingOnboarding(result.user.email, result.user.user_metadata);
        if (pending) {
          const businessId = await createBusiness(pending);
          await saveBusinessPreferences({ businessId, aiAssistantEnabled: false, whatsappDigestEnabled: pending.whatsappDigestEnabled, whatsappRecipientPhone: pending.whatsappRecipientPhone });
          clearPendingOnboarding();
          setWhatsAppNumber(pending.whatsappRecipientPhone);
          setCloudAccount({ user: result.user, business: { id: businessId, name: pending.businessName, industry: pending.industry || null } });
          return;
        }
        setAuthNotice('Your account is signed in, but no business workspace has been set up for it yet. Complete the business setup on this device or contact the workspace owner.');
        return;
      }
      setCloudAccount({ user: result.user, business: { id: membership.businesses.id, name: membership.businesses.name, industry: membership.businesses.industry } });
    };
    restore()
      .catch(error => {
        if (active) { setAuthNotice(error instanceof Error ? error.message : 'The saved cloud session could not be restored.'); if (readPendingTeamInvitation()) { setShowAuthScreen(true); setAuthInitialMode('signin'); } }
      })
      .finally(() => { if (active) setCloudRestoring(false); });
    return () => { active = false; };
  }, []);

  const reloadCloudWorkspace = async (): Promise<boolean> => {
    if (!cloudAccount) return false;
    if (!navigator.onLine) {
      const cached = (() => { try { return JSON.parse(localStorage.getItem('hesabu:workspace-cache:v1:' + cloudAccount.business.id) || 'null') as { data?: AppData; whatsappNumber?: string } | null; } catch { return null; } })();
      if (cached?.data) { setData(cached.data); setWhatsAppNumber(cached.whatsappNumber || ''); setCloudWorkspaceReady(true); setOfflineMode(true); return true; }
      setCloudWorkspaceError('This workspace has not been saved on this device yet. Connect to the internet to load it.');
      setCloudWorkspaceReady(false);
      return false;
    }
    setCloudWorkspaceLoading(true);
    setCloudWorkspaceError('');
    try {
      const [workspace, settings] = await Promise.all([
        getCloudWorkspace(cloudAccount.business.id, cloudAccount.user),
        getBusinessSettings(cloudAccount.business.id),
      ]);
      setData(workspace);
      try { localStorage.setItem('hesabu:workspace-cache:v1:' + cloudAccount.business.id, JSON.stringify({ savedAt: new Date().toISOString(), data: workspace, whatsappNumber: settings.whatsapp_recipient_phone || '' })); } catch { /* Storage quota must not block live workspace use. */ }
      setOfflineMode(false);
      setWhatsAppNumber(settings.whatsapp_recipient_phone || workspace.profile.phone || '');
      const currentMember = workspace.teamMembers.find(member => member.id === cloudAccount.user.id);
      setActiveMemberId(currentMember?.id || cloudAccount.user.id);
      setCloudWorkspaceReady(true);
      return true;
    } catch (error) {
      const cached = (() => {
        try { return JSON.parse(localStorage.getItem('hesabu:workspace-cache:v1:' + cloudAccount.business.id) || 'null') as { savedAt?: string; data?: AppData; whatsappNumber?: string } | null; }
        catch { return null; }
      })();
      if (!navigator.onLine && cached?.data) {
        setData(cached.data);
        setWhatsAppNumber(cached.whatsappNumber || '');
        setCloudWorkspaceReady(true);
        setOfflineMode(true);
        setCloudWorkspaceError('');
        return true;
      }
      setCloudWorkspaceError(error instanceof Error ? error.message : 'The business workspace could not be loaded.');
      setCloudWorkspaceReady(false);
      return false;
    } finally {
      setCloudWorkspaceLoading(false);
    }
  };

  useEffect(() => {
    if (!cloudAccount) return;
    // Render the last verified workspace immediately on repeat visits while
    // the latest cloud records refresh in the background.
    let cached: { data?: AppData; whatsappNumber?: string } | null = null;
    try {
      cached = JSON.parse(localStorage.getItem('hesabu:workspace-cache:v1:' + cloudAccount.business.id) || 'null');
    } catch { cached = null; }
    if (cached?.data) {
      setData(cached.data);
      setWhatsAppNumber(cached.whatsappNumber || '');
      const member = cached.data.teamMembers.find(item => item.id === cloudAccount.user.id);
      setActiveMemberId(member?.id || cloudAccount.user.id);
      setCloudWorkspaceReady(true);
      setCloudWorkspaceError('');
      setOfflineMode(!navigator.onLine);
    } else {
      setCloudWorkspaceReady(false);
    }
    void reloadCloudWorkspace();
    // The business ID changes only when a user enters a different cloud workspace.
  }, [cloudAccount?.business.id]);

  const handleCloudSignIn = async (email: string, password: string) => {
    const session = await signInWithPassword(email, password);
    const token = readPendingTeamInvitation();
    if (token) {
      const businessId = await acceptCloudBusinessInvitation(token);
      clearPendingTeamInvitation();
      setPendingInviteToken(null);
      const memberships = await listMyBusinesses();
      const invited = memberships.find(item => item.business_id === businessId && item.businesses?.id);
      if (!invited?.businesses) throw new Error('The invitation was accepted but the business could not be loaded.');
      setCloudAccount({ user: session.user, business: { id: invited.businesses.id, name: invited.businesses.name, industry: invited.businesses.industry } });
      setAuthNotice('');
      setShowAuthScreen(false);
      return;
    }
    const memberships = await listMyBusinesses();
    const membership = memberships.find(item => item.businesses?.id);
    if (!membership?.businesses) {
      const pending = readPendingOnboarding(session.user.email || email, session.user.user_metadata);
      if (!pending) throw new Error('Your sign-in was accepted, but this account has no business workspace yet. Complete the business setup on the device where you created the account.');
      const businessId = await createBusiness(pending);
      await saveBusinessPreferences({ businessId, aiAssistantEnabled: false, whatsappDigestEnabled: pending.whatsappDigestEnabled, whatsappRecipientPhone: pending.whatsappRecipientPhone });
      clearPendingOnboarding();
      setWhatsAppNumber(pending.whatsappRecipientPhone);
      setCloudAccount({ user: session.user, business: { id: businessId, name: pending.businessName, industry: pending.industry || null } });
    } else {
      setCloudAccount({ user: session.user, business: { id: membership.businesses.id, name: membership.businesses.name, industry: membership.businesses.industry } });
    }
    setAuthNotice('');
    setShowAuthScreen(false);
  };

  const handleCloudSignUp = async (input: SignUpInput): Promise<void> => {
    const invitation = readPendingTeamInvitation();
    const result = await signUpWithPassword(input);
    if (!result.user) throw new Error('Hesabu could not confirm that the account was created. Check your details and try again.');
    if (Array.isArray(result.user.identities) && result.user.identities.length === 0) {
      throw new Error('An account may already exist for this email address. Try signing in with your existing password.');
    }
    if (!result.session) {
      throw new Error('Hesabu could not start your account session. Account setup is not ready on the server yet. Please try again shortly.');
    }

    if (invitation) {
      const businessId = await acceptCloudBusinessInvitation(invitation);
      clearPendingTeamInvitation();
      setPendingInviteToken(null);
      const memberships = await listMyBusinesses();
      const invited = memberships.find(item => item.business_id === businessId && item.businesses?.id);
      if (!invited?.businesses) throw new Error('The invitation was accepted but the business could not be loaded.');
      setCloudAccount({ user: result.session.user, business: { id: invited.businesses.id, name: invited.businesses.name, industry: invited.businesses.industry } });
    } else {
      // Duplicate-signup recovery may have authenticated an existing account.
      // Reuse its workspace instead of creating a second business.
      const memberships = await listMyBusinesses();
      const existingMembership = memberships.find(item => item.businesses?.id);
      if (existingMembership?.businesses) {
        clearPendingOnboarding();
        setCloudAccount({
          user: result.session.user,
          business: {
            id: existingMembership.businesses.id,
            name: existingMembership.businesses.name,
            industry: existingMembership.businesses.industry,
          },
        });
      } else {
        // Save locally before provisioning so a failed request can be resumed
        // from sign-in or after a page refresh on this device.
        savePendingOnboarding(input);
        const businessId = await createBusiness(input);
        await saveBusinessPreferences({ businessId, aiAssistantEnabled: false, whatsappDigestEnabled: input.whatsappDigestEnabled, whatsappRecipientPhone: input.whatsappRecipientPhone });
        clearPendingOnboarding();
        setWhatsAppNumber(input.whatsappRecipientPhone);
        setCloudAccount({ user: result.session.user, business: { id: businessId, name: input.businessName, industry: input.industry || null } });
      }
    }
    setAuthNotice('');
    setShowAuthScreen(false);
  };
  const handleCloudPasswordReset = async (email: string, password: string) => {
    await updatePasswordFromRecovery(password);
    await handleCloudSignIn(email, password);
  };
  const handleCloudSignOut = async () => {
    await signOut();
    setCloudAccount(null);
    setCloudWorkspaceReady(false);
    setCloudWorkspaceError('');
    setAuthNotice('');
    setShowAuthScreen(false);
  };

  useEffect(() => {
    if (cloudAccount || demoMode) return;
    try {
      if (whatsappNumber.trim()) localStorage.setItem('hesabu:whatsapp-number:v1', whatsappNumber.trim());
      else localStorage.removeItem('hesabu:whatsapp-number:v1');
    } catch { /* WhatsApp preference remains available for this session. */ }
  }, [whatsappNumber, cloudAccount, demoMode]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('hesabu:theme:v2', theme); } catch { /* Keep this session's theme. */ }
  }, [theme]);

  const metrics = useMemo(() => getMetrics(data), [data]);
  const activeMember = data.teamMembers.find(member => member.id === activeMemberId && member.status === 'active')
    || data.teamMembers.find(member => member.role === 'Owner' && member.status === 'active')
    || data.teamMembers.find(member => member.status === 'active');
  const allowedModules = activeMember ? roleAccess[activeMember.role] : roleAccess.Owner;
  const visibleNavGroups = NAV_GROUPS.map(group => ({
    ...group, items: group.items.filter(item => allowedModules.includes(item.id)),
  })).filter(group => group.items.length > 0);
  const selectedInvoice = selectedInvoiceId ? data.invoices.find(invoice => invoice.id === selectedInvoiceId) : undefined;
  const selectedSupplier = dialog?.kind === 'supplier-payment' ? data.suppliers.find(supplier => supplier.id === dialog.supplierId) : undefined;
  const selectedPurchaseOrder = dialog?.kind === 'receive-purchase' ? data.purchaseOrders.find(order => order.id === dialog.purchaseOrderId) : undefined;
  const selectedReceipt = dialog?.kind === 'match-receipt' ? data.unmatchedReceipts.find(receipt => receipt.id === dialog.receiptId) : undefined;
  const selectedProduct = dialog?.kind === 'adjust' ? data.products.find(product => product.id === dialog.productId) : undefined;

  const notify = (title: string, detail?: string) => setNotice({ title, detail });
  const closeNotice = () => setNotice(null);
  const handleInstallApp = async () => {
    if (appInstalled) return;
    if (!installPrompt) {
      notify('Install Hesabu', 'Open your browser menu and choose Install app or Add to Home screen.');
      return;
    }
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === 'accepted') setAppInstalled(true);
      setInstallPrompt(null);
    } catch {
      notify('Install Hesabu', 'Use your browser menu to add Hesabu to your home screen.');
    }
  };
  const cloudMutationLock = useRef(false);
  const runCloudMutation = async (
    operation: () => Promise<unknown>,
    successTitle: string,
    successDetail: string,
    nextDialog: DialogState = null,
  ) => {
    if (cloudAccount && !navigator.onLine) {
      notify('Offline — changes are paused', 'Reconnect to the internet before recording financial or stock changes. Your last saved workspace remains available to view.');
      return;
    }
    if (cloudMutationLock.current) return;
    cloudMutationLock.current = true;
    try {
      await operation();
      const refreshed = await reloadCloudWorkspace();
      setDialog(nextDialog);
      notify(successTitle, refreshed
        ? successDetail
        : 'The record was submitted, but the latest workspace data could not be reloaded. Refresh the page to verify it.');
    } catch (error) {
      notify('Could not save this record', error instanceof Error ? error.message : 'The cloud operation failed. No success was reported.');
    } finally {
      cloudMutationLock.current = false;
    }
  };
  useEffect(() => {
    const online = () => { setOfflineMode(false); if (cloudAccount) void reloadCloudWorkspace(); };
    const offline = () => setOfflineMode(true);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline); };
  }, [cloudAccount?.business.id]);

  const navigate = (section: ModuleKey) => {
    if (!allowedModules.includes(section)) {
      notify('This area is not included in this role', 'Switch to an authorised business role to continue.');
      return;
    }
    setActive(section);
    setSearch('');
    setDialog(null);
    setSelectedInvoiceId(null);
    setMobileMenuOpen(false);
    setSearchOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const createInvoice = (input: NewInvoiceInput) => {
    if (cloudAccount && !navigator.onLine) {
      notify('Offline — sale not recorded', 'Reconnect before recording a sale. No invoice or stock movement has been created.');
      return;
    }
    if (cloudAccount) {
      const saleTotal = Math.round((sum(input.items.map(item => {
        const product = data.products.find(candidate => candidate.id === item.productId);
        return product ? product.sellingPrice * item.quantity : 0;
      })) - input.discount) * 100) / 100;
      if (input.channel !== 'credit' && saleTotal <= 0) {
        notify('Sale total must be greater than zero', 'Choose a positive sale total or record the transaction as a credit sale.');
        return;
      }
      if (cloudMutationLock.current) return;
      cloudMutationLock.current = true;
      void (async () => {
        try {
          await postCloudSaleWithType(cloudAccount.business.id, {
            customer: input.customer,
            phone: input.phone,
            dueDate: input.dueDate,
            discount: input.discount,
            channel: input.channel,
            source: input.source,
            saleType: input.saleType,
            items: input.items,
          });
          const refreshed = await reloadCloudWorkspace();
          setDialog(null);
          notify(input.saleType === 'enquiry' ? 'Enquiry saved' : 'Sale recorded', refreshed
            ? input.saleType === 'enquiry'
              ? 'The draft quote is saved. Stock, payment and financial balances have not changed.'
              : input.channel === 'credit'
                ? 'The sale, stock movement and outstanding customer balance are saved to your business.'
                : 'The sale, payment, stock movement and accounting entries are saved to your business.'
            : 'The transaction was submitted. Refresh the workspace to verify the latest invoice and stock balances.');
        } catch (error) {
          notify('Sale could not be recorded', error instanceof Error ? error.message : 'The cloud operation failed. No sale success was reported.');
        } finally {
          cloudMutationLock.current = false;
        }
      })();
      return;
    }
    const requestedQuantities = new Map<string, number>();
    for (const item of input.items) {
      requestedQuantities.set(item.productId, (requestedQuantities.get(item.productId) ?? 0) + item.quantity);
    }
    for (const [productId, requested] of requestedQuantities) {
      const product = data.products.find(candidate => candidate.id === productId);
      if (input.saleType !== 'enquiry' && (!product || requested > product.quantity)) {
        notify('Sale could not be posted', product
          ? 'Only ' + numberText(product.quantity) + ' ' + product.unit + ' of ' + product.name + ' are currently recorded.'
          : 'One of the selected products is no longer available.');
        return;
      }
    }
    const lines = input.items.map(item => {
      const product = data.products.find(candidate => candidate.id === item.productId);
      if (!product) return null;
      return {
        productId: product.id, name: product.name, sku: product.sku,
        quantity: item.quantity, unitPrice: product.sellingPrice,
        unitCost: product.costPrice, lineTotal: item.quantity * product.sellingPrice,
      };
    }).filter((line): line is NonNullable<typeof line> => line !== null);
    if (!lines.length) return;
    const subtotal = sum(lines.map(line => line.lineTotal));
    const total = Math.max(0, subtotal - input.discount);
    const number = 'HS-' + String(data.nextInvoice).padStart(4, '0');
    const invoiceId = makeId('INV');
    const isEnquiry = input.saleType === 'enquiry';
    const paid = isEnquiry || input.channel === 'credit' ? 0 : total;
    const invoice: Invoice = {
      id: invoiceId, number, customer: input.customer, phone: input.phone, saleType: input.saleType,
      date: today(), dueDate: input.dueDate, lines, subtotal, discount: input.discount,
      total, paid, channel: input.channel,
      status: isEnquiry ? 'draft' : paid >= total ? 'paid' : paid > 0 ? 'partial' : 'sent',
      source: input.source,
    };
    let next: AppData = {
      ...data,
      nextInvoice: data.nextInvoice + 1,
      invoices: [invoice, ...data.invoices],
      products: isEnquiry ? data.products : data.products.map(product => {
        const sold = sum(lines.filter(line => line.productId === product.id).map(line => line.quantity));
        return sold ? { ...product, quantity: Math.max(0, product.quantity - sold), updatedAt: today() } : product;
      }),
    };
    if (paid > 0) {
      const payment: Payment = {
        id: makeId('PAY'), invoiceId, invoiceNumber: number, customer: input.customer,
        phone: input.phone, amount: paid, channel: input.channel, status: 'succeeded',
        reference: input.channel === 'mpesa' ? 'DEMO-' + makeId('MP') : makeId(input.channel.toUpperCase()),
        createdAt: new Date().toISOString(), confirmedAt: new Date().toISOString(),
        appliedAmount: paid, unappliedAmount: 0,
        origin: 'manual',
      };
      const debitAccount = input.channel === 'mpesa' ? 'M-Pesa clearing' : input.channel === 'cash' ? 'Cash on hand' : input.channel === 'bank' ? 'Bank account' : 'Card clearing';
      next = {
        ...next,
        payments: [payment, ...next.payments],
        journal: recordJournal(next, debitAccount, 'Sales revenue', paid, 'Sale · ' + number, payment.reference),
        events: [{
          id: makeId('EVT'), time: new Date().toISOString(), type: 'invoice.paid',
          source: sourceLabel(input.source), status: 'delivered', reference: number,
          detail: 'Sale payment recorded and stock adjusted',
        }, ...next.events],
      };
    } else if (!isEnquiry) {
      next = {
        ...next,
        journal: recordJournal(next, 'Accounts receivable', 'Sales revenue', total, 'Credit sale · ' + number, number),
        events: [{
          id: makeId('EVT'), time: new Date().toISOString(), type: 'invoice.created',
          source: sourceLabel(input.source), status: 'delivered', reference: number,
          detail: input.saleType === 'pay_on_delivery' ? 'Pay-on-delivery sale posted; payment remains outstanding' : 'Credit invoice posted to accounts receivable',
        }, ...next.events],
      };
    }
    if (!isEnquiry) {
      next = {
        ...next,
        journal: recordJournal(next, 'Cost of goods sold', 'Inventory', sum(lines.map(line => line.unitCost * line.quantity)), 'Cost of sale · ' + number, number),
      };
    } else {
      next = {
        ...next,
        events: [{ id: makeId('EVT'), time: new Date().toISOString(), type: 'enquiry.saved', source: sourceLabel(input.source), status: 'pending', reference: number, detail: 'Quote saved without a stock, payment or accounting posting' }, ...next.events],
      };
    }
    setData(next);
    setDialog(null);
    notify(isEnquiry ? 'Enquiry saved' : 'Sale posted', isEnquiry ? number + ' is saved as a quote. Stock and account balances have not changed.' : number + ' has been recorded and inventory has been updated.');
    return invoiceId;
  };


  const createWebsiteOrder = (input: { productId: string; quantity: number; customer: string; phone: string }) => {
    const invoiceId = createInvoice({
      customer: input.customer,
      phone: input.phone,
      dueDate: addDays(today(), 7),
      discount: 0,
      channel: 'credit',
      saleType: 'pay_on_delivery',
      items: [{ productId: input.productId, quantity: input.quantity }],
      source: 'website',
    });
    if (invoiceId) setSelectedInvoiceId(invoiceId);
  };


  const createPaymentRequest = (input: NewPaymentInput) => {
    if (cloudAccount) {
      void runCloudMutation(() => postCloudPayment(cloudAccount.business.id, {
        invoiceId: input.invoiceId,
        amount: input.amount,
        channel: input.channel as Exclude<PaymentChannel, 'credit'>,
        phone: input.phone,
        reference: input.reference || '',
        idempotencyKey: input.idempotencyKey || 'manual-payment:' + makeId('IDEM'),
        note: 'Manually recorded payment received',
      }), 'Payment recorded', 'The payment, invoice balance and ledger entries are saved to your business.');
      return;
    }
    const invoice = data.invoices.find(item => item.id === input.invoiceId);
    if (!invoice || invoice.status === 'draft') return;
    const payment: Payment = {
      id: makeId('PAY'), invoiceId: invoice.id, invoiceNumber: invoice.number,
      customer: invoice.customer, phone: input.phone, amount: input.amount,
      channel: input.channel, status: 'pending',
      reference: 'STK-' + makeId('REQ').replaceAll('-', ''),
      createdAt: new Date().toISOString(), origin: 'daraja_demo',
      note: 'Local simulation only — no real Safaricom request was sent.',
    };
    setData(current => ({
      ...current,
      payments: [payment, ...current.payments],
      events: [{
        id: makeId('EVT'), time: new Date().toISOString(), type: 'payment.requested',
        source: 'Daraja simulator', status: 'pending', reference: payment.reference,
        detail: 'A simulated STK prompt is awaiting a customer decision',
      }, ...current.events],
    }));
    setDialog(null);
    setActive('payments');
    notify('Payment request created', 'The payment is pending. Use Approve or Fail in the register to simulate the callback.');
  };

  const addUnmatchedReceipt = (input: NewUnmatchedReceiptInput) => {
    if (cloudAccount) {
      void runCloudMutation(
        () => postCloudUnmatchedReceipt(cloudAccount.business.id, input),
        'Receipt recorded',
        'The receipt is saved in the cloud queue. It has not changed an invoice balance until you allocate it.',
      );
      return;
    }
    const reference = input.reference.trim().toUpperCase();
    const duplicateReference = data.unmatchedReceipts.some(item => item.reference.trim().toUpperCase() === reference) ||
      data.payments.some(item => item.reference.trim().toUpperCase() === reference);
    if (duplicateReference) {
      notify('Receipt reference already recorded', 'Check the existing payment register or unmatched queue before adding this receipt again.');
      return;
    }
    const receipt: UnmatchedReceipt = {
      id: makeId('RCPT'), reference, payer: input.payer, phone: input.phone,
      amount: input.amount, rail: input.rail, receivedAt: new Date().toISOString(), source: 'manual',
    };
    setData(current => ({
      ...current,
      unmatchedReceipts: [receipt, ...current.unmatchedReceipts],
      events: [{
        id: makeId('EVT'), time: new Date().toISOString(), type: 'receipt.unmatched',
        source: receipt.rail, status: 'pending', reference: receipt.reference,
        detail: money(receipt.amount) + ' receipt added for invoice matching',
      }, ...current.events],
    }));
    setDialog(null);
    notify('Receipt added to queue', 'The receipt has not changed any invoice balance yet.');
  };

  const matchUnmatchedReceipt = (receiptId: string, invoiceId: string) => {
    if (cloudAccount) {
      void runCloudMutation(
        () => matchCloudUnmatchedReceipt(cloudAccount.business.id, receiptId, invoiceId),
        'Receipt allocated',
        'The customer payment, invoice balance and accounting entries were updated together. Any excess remains as customer credit.',
      );
      return;
    }
    const receipt = data.unmatchedReceipts.find(item => item.id === receiptId);
    const invoice = data.invoices.find(item => item.id === invoiceId);
    if (!receipt || !invoice || invoice.status === 'draft' || receipt.amount <= 0 || invoiceBalance(invoice) <= 0) return;
    const now = new Date().toISOString();
    const channel: PaymentChannel = receipt.rail === 'Bank transfer' ? 'bank' : 'mpesa';
    const allocation = allocateIncomingPayment(invoice.total, invoice.paid, receipt.amount);
    const { appliedAmount, unappliedAmount, newPaid: paid } = allocation;
    const payment: Payment = {
      id: makeId('PAY'), invoiceId: invoice.id, invoiceNumber: invoice.number,
      customer: invoice.customer, phone: receipt.phone, amount: receipt.amount,
      appliedAmount, unappliedAmount,
      channel, status: 'succeeded', reference: receipt.reference,
      createdAt: receipt.receivedAt, confirmedAt: now, rail: receipt.rail,
      note: unappliedAmount > 0
        ? 'Matched from receipt queue. Excess retained as customer advance.'
        : 'Manually matched from unmatched receipt queue.',
      origin: 'reconciliation',
    };
    const debitAccount = channel === 'bank' ? 'Bank account' : 'M-Pesa clearing';
    const journal = [
      ...buildJournalPair({
        journalId: makeId('JRN'), date: receipt.receivedAt.slice(0, 10),
        debitAccount, creditAccount: 'Accounts receivable', amount: appliedAmount,
        description: 'Matched receipt · ' + invoice.number, reference: receipt.reference,
      }),
      ...buildJournalPair({
        journalId: makeId('JRN'), date: receipt.receivedAt.slice(0, 10),
        debitAccount, creditAccount: 'Customer advances', amount: unappliedAmount,
        description: 'Unapplied receipt · ' + invoice.number, reference: receipt.reference,
      }),
    ];
    setData(current => ({
      ...current,
      unmatchedReceipts: current.unmatchedReceipts.filter(item => item.id !== receiptId),
      payments: [payment, ...current.payments],
      invoices: current.invoices.map(item => item.id === invoice.id ? {
        ...item, paid, status: paid >= item.total ? 'paid' : 'partial',
      } : item),
      journal: [...current.journal, ...journal],
      events: [{
        id: makeId('EVT'), time: now, type: 'payment.reconciled',
        source: receipt.rail, status: 'delivered', reference: receipt.reference,
        detail: money(appliedAmount) + ' applied to ' + invoice.number +
          (unappliedAmount > 0 ? '; ' + money(unappliedAmount) + ' retained as customer credit' : ''),
      }, ...current.events],
    }));
    setDialog(null);
    notify('Receipt allocated', money(appliedAmount) + ' applied to ' + invoice.number +
      (unappliedAmount > 0 ? '; ' + money(unappliedAmount) + ' recorded as customer credit.' : '.'));
  };

  const resolvePayment = (paymentId: string, success: boolean) => {
    if (cloudAccount) {
      notify('Payment confirmation is provider-controlled', 'Hesabu does not simulate payment callbacks in a real business. Record an already received payment or connect the Daraja API.');
      return;
    }
    const payment = data.payments.find(item => item.id === paymentId);
    if (!payment || payment.status !== 'pending') return;
    const invoice = data.invoices.find(item => item.id === payment.invoiceId);
    if (success && !invoice) {
      notify('Payment could not be matched', 'The source invoice no longer exists. Review this request manually.');
      return;
    }
    const now = new Date().toISOString();
    const cashAccount = payment.channel === 'mpesa' ? 'M-Pesa clearing'
      : payment.channel === 'cash' ? 'Cash on hand'
      : payment.channel === 'bank' ? 'Bank account' : 'Card clearing';
    const appliedAmount = success && invoice ? Math.min(payment.amount, invoiceBalance(invoice)) : 0;
    const unappliedAmount = success ? Math.max(0, payment.amount - appliedAmount) : 0;
    const receiptReference = success ? 'RCP' + Math.random().toString(36).slice(2, 9).toUpperCase() : payment.reference;
    let next: AppData = {
      ...data,
      payments: data.payments.map(item => item.id === paymentId ? {
        ...item, status: success ? 'succeeded' : 'failed', confirmedAt: success ? now : undefined,
        appliedAmount, unappliedAmount,
        note: success
          ? unappliedAmount > 0
            ? 'Payment confirmed. ' + money(unappliedAmount) + ' retained as customer credit.'
            : 'Simulated callback result received and matched to the invoice.'
          : 'Simulated customer cancellation or failed request.',
        reference: receiptReference,
      } : item),
      events: [{
        id: makeId('EVT'), time: now, type: success ? 'payment.confirmed' : 'payment.failed',
        source: 'Daraja simulator', status: success ? 'delivered' : 'failed',
        reference: receiptReference,
        detail: success ? money(appliedAmount) + ' applied to ' + payment.invoiceNumber +
          (unappliedAmount > 0 ? '; ' + money(unappliedAmount) + ' retained as customer credit' : '')
          : 'No successful payment was confirmed',
      }, ...data.events],
    };
    if (success && invoice) {
      const { appliedAmount, unappliedAmount, newPaid: paid } = allocateIncomingPayment(invoice.total, invoice.paid, payment.amount);
      const paymentJournal = [
        ...buildJournalPair({
          journalId: makeId('JRN'), date: today(), debitAccount: cashAccount,
          creditAccount: 'Accounts receivable', amount: appliedAmount,
          description: 'Payment matched · ' + payment.invoiceNumber, reference: receiptReference,
        }),
        ...buildJournalPair({
          journalId: makeId('JRN'), date: today(), debitAccount: cashAccount,
          creditAccount: 'Customer advances', amount: unappliedAmount,
          description: 'Unapplied customer receipt · ' + payment.invoiceNumber, reference: receiptReference,
        }),
      ];
      next = {
        ...next,
        invoices: next.invoices.map(item => item.id === invoice.id ? {
          ...item, paid, status: paid >= item.total ? 'paid' : 'partial',
        } : item),
        journal: [...next.journal, ...paymentJournal],
      };
    }
    setData(next);
    notify(success ? 'Payment confirmed' : 'Payment marked as failed',
      success
        ? unappliedAmount > 0
          ? money(appliedAmount) + ' applied to the invoice; ' + money(unappliedAmount) + ' retained as customer credit.'
          : 'The invoice balance and ledger have been updated.'
        : 'The invoice remains unpaid.');
  };

  const createExpense = (input: { category: string; description: string; amount: number; channel: 'cash' | 'mpesa' | 'bank' }) => {
    if (cloudAccount) {
      void runCloudMutation(() => postCloudExpense(cloudAccount.business.id, input),
        'Expense recorded', 'The expense, cash movement and accounting entries are saved to your business.');
      return;
    }
    const expense = { ...input, id: makeId('EXP'), date: today(), reference: makeId('EXP') };
    const debitAccount = input.category === 'Rent' ? 'Rent expense' : input.category === 'Utilities' ? 'Utilities expense' : input.category === 'Staff costs' ? 'Staff expense' : input.category === 'Transport' ? 'Transport expense' : 'Operating expenses';
    const creditAccount = input.channel === 'cash' ? 'Cash on hand' : input.channel === 'mpesa' ? 'M-Pesa clearing' : 'Bank account';
    setData(current => ({
      ...current,
      expenses: [expense, ...current.expenses],
      journal: recordJournal(current, debitAccount, creditAccount, input.amount, input.description, expense.reference),
    }));
    setDialog(null);
    notify('Expense recorded', money(input.amount) + ' has been posted to ' + input.category.toLowerCase() + '.');
  };

  const createProduct = (input: Omit<Product, 'id' | 'updatedAt'>) => {
    const returnToPurchase = dialog?.kind === 'product' && Boolean(dialog.returnToPurchase);
    if (cloudAccount) {
      const sku = input.sku.trim().toUpperCase() || makeId('SKU');
      void runCloudMutation(() => createCloudProduct(cloudAccount.business.id, {
        sku, name: input.name, category: input.category, unit: input.unit,
        quantity: input.quantity, reorderLevel: input.reorderLevel,
        costPrice: input.costPrice, sellingPrice: input.sellingPrice,
        supplierId: input.supplierId,
      }), 'Product added', 'The product and opening stock valuation are saved to your business.',
        returnToPurchase ? { kind: 'purchase' } : null);
      return;
    }
    const sku = input.sku.trim().toUpperCase() || makeId('SKU');
    if (data.products.some(product => product.sku.toUpperCase() === sku)) {
      notify('SKU already exists', 'Each inventory item needs a unique product code. Choose another SKU before saving.');
      return;
    }
    const product: Product = { ...input, sku, id: makeId('PRD'), updatedAt: today() };
    const openingValue = Math.max(0, product.quantity) * Math.max(0, product.costPrice);
    setData(current => ({
      ...current,
      products: [product, ...current.products],
      journal: openingValue > 0
        ? recordJournal(current, 'Inventory', 'Opening balance equity', openingValue, 'Opening stock · ' + product.name, product.sku)
        : current.journal,
      events: [{
        id: makeId('EVT'), time: new Date().toISOString(), type: 'inventory.item_created',
        source: 'Inventory', status: 'delivered', reference: product.sku,
        detail: product.name + ' added with ' + numberText(product.quantity) + ' ' + product.unit + ' on hand',
      }, ...current.events],
    }));
    setDialog(returnToPurchase ? { kind: 'purchase' } : null);
    notify('Product added', openingValue > 0
      ? product.name + ' and ' + money(openingValue) + ' of opening stock have been recorded.'
      : product.name + ' is now in the inventory register.');
  };

  const createPurchaseOrder = (input: NewPurchaseInput) => {
    if (cloudAccount) {
      void runCloudMutation(() => createCloudPurchaseOrder(cloudAccount.business.id, {
        supplierId: input.supplierId,
        expectedDate: input.expectedAt,
        items: input.items,
      }), 'Purchase order created', 'The order is saved. Stock and supplier balances will change when goods are received.');
      return;
    }
    const supplier = data.suppliers.find(item => item.id === input.supplierId);
    if (!supplier) return;
    const lines = input.items.map(item => {
      const product = data.products.find(candidate => candidate.id === item.productId);
      if (!product) return null;
      return {
        productId: product.id, name: product.name, quantity: item.quantity,
        received: 0, unitCost: item.unitCost, lineTotal: item.quantity * item.unitCost,
      };
    }).filter((line): line is NonNullable<typeof line> => line !== null);
    if (!lines.length) return;
    const order: PurchaseOrder = {
      id: makeId('PO'), number: 'PO-' + String(data.nextPurchaseOrder).padStart(3, '0'),
      supplierId: supplier.id, supplierName: supplier.name, createdAt: today(),
      expectedAt: input.expectedAt, lines, total: sum(lines.map(line => line.lineTotal)), status: 'sent',
    };
    setData(current => ({
      ...current, nextPurchaseOrder: current.nextPurchaseOrder + 1,
      purchaseOrders: [order, ...current.purchaseOrders],
      events: [{
        id: makeId('EVT'), time: new Date().toISOString(), type: 'purchase_order.sent',
        source: 'Procurement', status: 'delivered', reference: order.number,
        detail: 'Purchase order created for ' + supplier.name,
      }, ...current.events],
    }));
    setDialog(null);
    notify('Purchase order created', order.number + ' is ready for supplier follow-up.');
  };

  const receivePurchaseOrder = (orderId: string, items: Array<{ productId: string; quantity: number }>) => {
    if (cloudAccount) {
      void runCloudMutation(() => receiveCloudPurchaseOrder(cloudAccount.business.id, {
        purchaseOrderId: orderId, items,
      }), 'Goods received', 'Stock quantities, weighted costs and the supplier payable have been updated in the ledger.');
      return;
    }
    const order = data.purchaseOrders.find(item => item.id === orderId);
    if (!order || order.status === 'received') return;
    const receipt = planPurchaseReceipt(order.lines, items);
    if (!receipt.valid) {
      notify('Goods receipt not posted', receipt.reason);
      return;
    }
    const next: AppData = {
      ...data,
      products: data.products.map(product => {
        const updatedLine = receipt.lines.find(item => item.productId === product.id);
        const originalLine = order.lines.find(item => item.productId === product.id);
        const receivedNow = updatedLine && originalLine ? updatedLine.received - originalLine.received : 0;
        if (!originalLine || receivedNow <= 0) return product;
        return {
          ...product,
          quantity: product.quantity + receivedNow,
          costPrice: weightedAverageUnitCost(product.quantity, product.costPrice, receivedNow, originalLine.unitCost),
          updatedAt: today(),
        };
      }),
      purchaseOrders: data.purchaseOrders.map(item => item.id === orderId ? {
        ...item, status: receipt.status, lines: receipt.lines,
      } : item),
      suppliers: data.suppliers.map(supplier => supplier.id === order.supplierId
        ? { ...supplier, balance: supplier.balance + receipt.totalValue }
        : supplier),
      journal: recordJournal(data, 'Inventory', 'Accounts payable', receipt.totalValue,
        'Goods received · ' + order.number, order.number),
      events: [{
        id: makeId('EVT'), time: new Date().toISOString(),
        type: receipt.status === 'received' ? 'purchase_order.received' : 'purchase_order.partially_received',
        source: 'Procurement', status: 'delivered', reference: order.number,
        detail: money(receipt.totalValue) + ' of goods received and posted to inventory and accounts payable',
      }, ...data.events],
    };
    setData(next);
    setDialog(null);
    notify(receipt.status === 'received' ? 'Purchase order completed' : 'Partial delivery posted',
      money(receipt.totalValue) + ' added to inventory and the supplier balance for ' + order.supplierName + '.');
  };

  const paySupplier = (supplierId: string, amount: number, channel: Exclude<PaymentChannel, 'credit'> = 'bank') => {
    if (cloudAccount) {
      void runCloudMutation(() => postCloudSupplierPayment(cloudAccount.business.id, {
        supplierId, amount, channel, reference: '',
      }), 'Supplier payment recorded', 'The supplier balance and cash ledger have been updated.');
      return;
    }
    const supplier = data.suppliers.find(item => item.id === supplierId);
    if (!supplier || amount <= 0 || amount > supplier.balance) return;
    const reference = makeId('BANK');
    const movement = {
      id: makeId('MOV'), date: today(), channel: 'bank' as const, direction: 'out' as const,
      amount, description: 'Supplier payment · ' + supplier.name, reference,
      source: 'supplier_payment' as const,
    };
    setData(current => ({
      ...current,
      suppliers: current.suppliers.map(item => item.id === supplierId ? { ...item, balance: Math.max(0, item.balance - amount) } : item),
      cashMovements: [...(current.cashMovements ?? []), movement],
      journal: recordJournal(current, 'Accounts payable', 'Bank account', amount, 'Supplier payment · ' + supplier.name, reference),
      events: [{
        id: makeId('EVT'), time: new Date().toISOString(), type: 'supplier.payment_recorded',
        source: 'Accounts payable', status: 'delivered', reference,
        detail: 'Supplier payment recorded for ' + supplier.name,
      }, ...current.events],
    }));
    setDialog(null);
    notify('Supplier payment recorded', money(amount) + ' applied to ' + supplier.name + '.');
  };

  const adjustStock = (productId: string, quantity: number, reason: string) => {
    const product = data.products.find(item => item.id === productId);
    if (cloudAccount && !product) {
      notify('Product not found', 'Refresh the inventory list and try the stock count again.');
      return;
    }
    if (cloudAccount && product) {
      const delta = quantity - product.quantity;
      if (delta === 0) {
        setDialog(null);
        notify('No stock change', 'The counted quantity matches the current recorded quantity.');
        return;
      }
      void runCloudMutation(() => adjustCloudStock(cloudAccount.business.id, {
        productId, quantityDelta: delta, reason,
      }), 'Stock count saved', product.name + ' has been adjusted in the inventory and accounting ledgers.');
      return;
    }
    if (!product) return;
    const delta = quantity - product.quantity;
    const value = Math.abs(delta * product.costPrice);
    let next: AppData = {
      ...data,
      products: data.products.map(item => item.id === productId ? { ...item, quantity, updatedAt: today() } : item),
      events: [{
        id: makeId('EVT'), time: new Date().toISOString(), type: 'inventory.adjusted',
        source: 'Inventory control', status: 'delivered', reference: product.sku,
        detail: reason + ': ' + (delta >= 0 ? '+' : '') + delta + ' ' + product.unit,
      }, ...data.events],
    };
    if (delta > 0) {
      next = { ...next, journal: recordJournal(next, 'Inventory', 'Stock adjustments', value, reason, product.sku) };
    } else if (delta < 0) {
      next = { ...next, journal: recordJournal(next, 'Stock adjustments', 'Inventory', value, reason, product.sku) };
    }
    setData(next);
    setDialog(null);
    notify('Stock count saved', product.name + ' now has ' + numberText(quantity) + ' ' + product.unit + ' on hand.');
  };

  const saveProfile = (profile: BusinessProfile) => {
    if (cloudAccount) {
      void runCloudMutation(() => saveCloudBusinessProfile(
        cloudAccount.business.id, profile, cloudAccount.user.id,
      ), 'Business profile updated', 'Your business details are saved to the cloud workspace.');
      return;
    }
    setData(current => ({ ...current, profile }));
    notify('Business profile updated', 'Changes have been saved to this browser.');
  };

  const addSupplier = (input: { name: string; phone: string; email: string; terms: string }) => {
    const returnToPurchase = dialog?.kind === 'supplier' && Boolean(dialog.returnToPurchase);
    if (cloudAccount) {
      void runCloudMutation(() => createCloudSupplier(cloudAccount.business.id, input),
        'Supplier added', 'The supplier has been saved to your business records.',
        returnToPurchase ? { kind: 'purchase' } : null);
      return;
    }
    const supplier: Supplier = {
      id: makeId('SUP'), name: input.name, phone: input.phone,
      email: input.email, terms: input.terms, balance: 0,
    };
    setData(current => ({ ...current, suppliers: [...current.suppliers, supplier] }));
    setDialog(returnToPurchase ? { kind: 'purchase' } : null);
    notify('Supplier added', input.name + ' has been added to the supplier register.');
  };

  const saveWhatsAppDestination = async () => {
    const normalized = normaliseWhatsAppNumber(whatsappNumber || data.profile.phone);
    if (!normalized) {
      notify('Enter a valid WhatsApp number', 'Use a full international number, for example +254 712 345 678.');
      return;
    }
    setWhatsAppNumber(normalized);
    if (cloudAccount) {
      if (!navigator.onLine) {
        notify('Cannot save while offline', 'Reconnect to the internet, then save the WhatsApp destination again.');
        return;
      }
      try {
        await saveCloudWhatsAppDestination(cloudAccount.business.id, normalized);
        await reloadCloudWorkspace();
        notify('WhatsApp destination saved', 'Saved for ' + normalized + '. Open the daily digest and choose Open WhatsApp; you must press Send in WhatsApp.');
      } catch (error) {
        notify('WhatsApp destination was not saved', error instanceof Error ? error.message : 'Check your connection and try again.');
      }
      return;
    }
    try { localStorage.setItem('hesabu:whatsapp-number:v1', normalized); } catch { /* Keep this session's value. */ }
    notify('WhatsApp destination saved', 'Saved for ' + normalized + ' on this device.');
  };


  const addTeamMember = async (input: { name: string; email: string; role: TeamRole }): Promise<boolean> => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) { notify('Enter a valid email address'); return false; }
    if (cloudAccount) {
      try {
        const token = await createCloudBusinessInvitation(cloudAccount.business.id, {
          name: input.name, email: input.email, role: input.role as Exclude<TeamRole, 'Owner'>,
        });
        const url = new URL(window.location.origin);
        url.searchParams.set('invite', token);
        let copied = false;
        try { await navigator.clipboard.writeText(url.toString()); copied = true; }
        catch { window.prompt('Copy this secure invitation link', url.toString()); }
        await reloadCloudWorkspace();
        notify('Team invitation created', copied ? 'The seven-day invitation link has been copied. Send it to ' + input.email + '.' : 'Share the invitation link shown above with ' + input.email + '.');
        return true;
      } catch (error) {
        notify('Could not create invitation', error instanceof Error ? error.message : 'The invitation could not be saved.');
        return false;
      }
    }
    if (data.teamMembers.some(member => member.email.toLowerCase() === input.email.toLowerCase())) { notify('This email is already on the team'); return false; }
    const member: TeamMember = { id: makeId('TEAM'), ...input, status: 'active' };
    setData(current => ({ ...current, teamMembers: [...current.teamMembers, member] }));
    notify('Team member added', input.name + ' has been added to this local workspace.');
    return true;
  };

  const updateTeamMember = async (id: string, patch: Partial<TeamMember>) => {
    if (cloudAccount) {
      const member = data.teamMembers.find(item => item.id === id);
      if (!member || member.role === 'Owner') return;
      try {
        await updateCloudBusinessMember(cloudAccount.business.id, id, {
          role: (patch.role ?? member.role) as Exclude<TeamRole, 'Owner'>,
          status: patch.status ?? member.status,
        });
        const refreshed = await reloadCloudWorkspace();
        notify(refreshed ? 'Team access updated' : 'Team change saved', refreshed ? 'The member permissions are saved to this business.' : 'Refresh to verify the latest team list.');
      } catch (error) {
        notify('Could not update team access', error instanceof Error ? error.message : 'The team change failed.');
      }
      return;
    }
    setData(current => ({ ...current, teamMembers: current.teamMembers.map(member => member.id === id && member.role !== 'Owner' ? { ...member, ...patch } : member) }));
  };

  const revokeTeamInvitation = async (id: string) => {
    if (!cloudAccount) return;
    try {
      await revokeCloudBusinessInvitation(cloudAccount.business.id, id);
      await reloadCloudWorkspace();
      notify('Invitation revoked', 'The invitation link can no longer be used.');
    } catch (error) {
      notify('Could not revoke invitation', error instanceof Error ? error.message : 'The invitation could not be revoked.');
    }
  };

  const copyTeamInvitation = async (token: string) => {
    const url = new URL(window.location.origin);
    url.searchParams.set('invite', token);
    try { await navigator.clipboard.writeText(url.toString()); notify('Invitation link copied', 'Share the link with the invited email address.'); }
    catch { window.prompt('Copy this secure invitation link', url.toString()); }
  };

  const activeMeta = moduleMeta[active];
  const requestWhatsAppDestination = () => {
    navigate('settings');
    notify('Add a WhatsApp destination', 'Enter your business WhatsApp number in Settings before preparing the daily summary.');
  };
  if (cloudRestoring) return <main className="auth-page"><section className="cloud-account-card cloud-loading-card"><span className="brand-mark"><HesabuMark /></span><h1>Hesabu</h1><p>Getting your business ready…</p></section></main>;
  if (cloudAccount && !cloudWorkspaceReady) return <main className="auth-page">
    <section className="cloud-account-card cloud-loading-card">
      <span className="brand-mark"><HesabuMark /></span><h1>{cloudAccount.business.name}</h1>
      {cloudWorkspaceError
        ? <><p>{cloudWorkspaceError}</p><div className="modal-footer">
            <Button variant="outline" onClick={() => { void handleCloudSignOut(); }}>Sign out</Button>
            <Button onClick={() => { void reloadCloudWorkspace(); }} disabled={cloudWorkspaceLoading}>{cloudWorkspaceLoading ? 'Loading…' : 'Try again'}</Button>
          </div></>
        : <p>Loading your secure business records…</p>}
    </section>
  </main>;
  if (!demoMode && !showAuthScreen && !cloudAccount) return <PublicLandingPage
    onSignIn={() => { setAuthInitialMode('signin'); setShowAuthScreen(true); }}
    onCreateAccount={openAccountCreation}
    onTryDemo={startDemo}
    onInstall={handleInstallApp}
    appInstalled={appInstalled}
  />;
  if (!cloudAccount && !demoMode) return <AuthPage
    onSignIn={handleCloudSignIn}
    onSignUp={handleCloudSignUp}
    onResetPassword={handleCloudPasswordReset}
    initialMessage={authNotice}
    initialMode={authInitialMode}
    initialEmail=""
    onBack={() => { if (pendingInviteToken) { clearPendingTeamInvitation(); setPendingInviteToken(null); } setShowAuthScreen(false); }}
    inviteMode={Boolean(pendingInviteToken)}
  />;
  return <div className={'app-shell theme-' + theme + ' ' + (sidebarCollapsed ? 'sidebar-is-collapsed' : '')}>
    <aside className={'sidebar ' + (mobileMenuOpen ? 'sidebar-mobile-open' : '')}>
      <div className="brand-row">
        <span className="brand-mark"><HesabuMark /></span>
        {!sidebarCollapsed && <div className="brand-text"><strong>hesabu<span>.</span></strong><small>BUSINESS WORKSPACE</small></div>}
        <button className="sidebar-collapse" onClick={() => setSidebarCollapsed(value => !value)} aria-label="Collapse navigation"><PanelLeftClose size={16} /></button>
      </div>
      <button className="workspace-switcher" onClick={() => navigate('overview')}>
        <span className="workspace-avatar"><Store size={15} /></span>
        {!sidebarCollapsed && <><span className="workspace-name"><strong>{data.profile.name}</strong><small>{data.profile.industry}</small></span><ChevronDown size={14} /></>}
      </button>
      <nav className="sidebar-nav">
        {visibleNavGroups.map(group => <div className="nav-group" key={group.title}>
          {!sidebarCollapsed && <div className="nav-group-label">{group.title}</div>}
          {group.items.map(item => {
            const Icon = item.icon;
            return <button key={item.id} title={sidebarCollapsed ? item.label : undefined} onClick={() => navigate(item.id)} className={'nav-item ' + (active === item.id ? 'nav-item-active' : '')}>
              <Icon size={18} strokeWidth={1.8} /><span>{item.label}</span>
              {item.id === 'inventory' && data.products.some(product => product.quantity <= product.reorderLevel) && <i className="nav-alert" />}
              {item.id === 'payments' && data.payments.some(payment => payment.status === 'pending') && <i className="nav-alert nav-alert-blue" />}
            </button>;
          })}
        </div>)}
      </nav>
      {!sidebarCollapsed && <div className="sidebar-bottom">
        <div className="sidebar-help"><div><span className="sidebar-help-mark">H</span><strong>Built for the whole business</strong></div><p>Keep sales, stock and purchasing in sync.</p><button onClick={() => navigate('reports')}>View performance <ArrowRight size={12} /></button></div>
        <div className="sidebar-profile" onClick={() => navigate('settings')} role="button" tabIndex={0}>
          <Initials name={activeMember?.name || data.profile.name} /><span><strong>{activeMember?.name || data.profile.name}</strong><small>{activeMember?.role || 'Owner'}</small></span><MoreHorizontal size={17} />
        </div>
      </div>}
    </aside>

    {mobileMenuOpen && <button className="mobile-menu-scrim" aria-label="Close navigation" onClick={() => setMobileMenuOpen(false)} />}
    <main className="main-shell">
      <header className="topbar">
        <div className="topbar-left">
          <div className="topbar-brand-lockup"><span className="brand-mark topbar-brand-mark"><HesabuMark /></span><span className="topbar-brand-name">Hesabu</span></div>
          <IconButton label="Open navigation" className="mobile-menu-button" onClick={() => setMobileMenuOpen(value => !value)}><Menu size={19} /></IconButton>
          <div className="breadcrumb"><ChevronRight size={13} /><strong>{activeMeta.title}</strong></div>
        </div>
        <div className="topbar-right">
          {!appInstalled && <button type="button" className="app-install-button" onClick={handleInstallApp}><Download size={15} /><span>Install</span></button>}
          <div className={'global-search ' + (searchOpen ? 'global-search-open' : '')}><Search size={15} /><input value={search} onFocus={() => setSearchOpen(true)} onBlur={() => setTimeout(() => setSearchOpen(false), 150)} onChange={event => setSearch(event.target.value)} placeholder="Search this register…" /></div>
          <span className="topbar-divider" />
          <button className="topbar-date" onClick={() => notify('Workspace date', dateLabel(today()))}><CalendarDays size={15} /> <span>{dateLabel(today())}</span></button>
          <button
            type="button"
            className="appearance-toggle"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-pressed={theme === 'dark'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={() => setTheme(current => current === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            <span>{theme === 'dark' ? 'Dark' : 'Light'}</span>
          </button>
          <button className="notification-button" onClick={() => notify('Operational attention', data.products.filter(product => product.quantity <= product.reorderLevel).length + ' stock items are at or below reorder level.')}><Bell size={17} /><i /></button>
          <div className="topbar-account">
            <button type="button" className="topbar-avatar" aria-label="Open account details" aria-haspopup="menu" aria-expanded={profileMenuOpen} title="Account details" onClick={() => setProfileMenuOpen(open => !open)}><Initials name={activeMember?.name || data.profile.name} /></button>
            {profileMenuOpen && <div className="user-switcher-panel" role="menu" aria-label="Account details">
              <div className="user-switcher-heading">
                <strong>{activeMember?.name || data.profile.owner || 'Your account'}</strong>
                <small>{demoMode ? 'Public sample · no account required' : cloudAccount?.user.email || 'Signed-in Hesabu account'}</small>
              </div>
              <div className="account-detail-row"><span>Business</span><strong>{data.profile.name || cloudAccount?.business.name || 'Sample workspace'}</strong></div>
              <div className="account-detail-row"><span>Access</span><strong>{activeMember?.role || 'Owner'}</strong></div>
              <button type="button" role="menuitem" onClick={() => { setProfileMenuOpen(false); navigate('settings'); }}><Settings size={15} /><span><strong>Business settings</strong><small>Profile, team and preferences</small></span><ChevronRight size={14} /></button>
              <button type="button" role="menuitem" onClick={() => { setProfileMenuOpen(false); if (demoMode) exitDemo(); else void handleCloudSignOut(); }}><LogOut size={15} /><span><strong>{demoMode ? 'Exit demo' : 'Sign out'}</strong><small>{demoMode ? 'Return to the Hesabu introduction' : 'Sign out of this account'}</small></span></button>
            </div>}
          </div>
        </div>
      </header>

      <div className="page-container">
        {demoMode && <div className="demo-mode-banner" role="status">
          <div className="demo-mode-copy"><strong>Sample workspace</strong><span>Try a sale, check stock and open Analytics. Changes are temporary and reset when you exit.</span></div>
          <div className="demo-mode-actions">
            <Button variant="outline" size="sm" onClick={exitDemo}>Exit demo</Button>
            <Button size="sm" onClick={openAccountCreation}>Use Hesabu for my business <ArrowRight size={13} /></Button>
          </div>
        </div>}
        {offlineMode && <div className="offline-status" role="status"><span className="offline-status-dot" /><span><strong>You’re offline.</strong> You can still view your saved records. Connect to the internet to record new sales, payments or stock changes.</span></div>}
        {active === 'overview' && <OverviewPage data={data} metrics={metrics} role={activeMember?.role ?? 'Owner'} onCreateSale={() => setDialog({ kind: 'sale' })} onCreateProduct={() => setDialog({ kind: 'product' })} onNavigate={navigate} onSelectInvoice={setSelectedInvoiceId} onRecordExpense={() => setDialog({ kind: 'expense' })} onRecordPayment={() => setDialog({ kind: 'stk' })} onRecordReceipt={() => setDialog({ kind: 'receipt' })} onCreatePurchase={() => setDialog({ kind: 'purchase' })} onQuickStock={() => setDialog({ kind: 'stock-actions' })} />}
        {active === 'sales' && <SalesPage data={data} search={search} onSearch={setSearch} onCreateSale={() => setDialog({ kind: 'sale' })} onSelectInvoice={setSelectedInvoiceId} />}
        {active === 'payments' && <PaymentsPage data={data} metrics={metrics} search={search} onSearch={setSearch} onRequestPayment={() => setDialog({ kind: 'stk' })} onResolvePayment={resolvePayment} onAddReceipt={() => setDialog({ kind: 'receipt' })} onMatchReceipt={receiptId => setDialog({ kind: 'match-receipt', receiptId })} cloudMode={Boolean(cloudAccount)} />}
        {active === 'inventory' && <InventoryPage data={data} search={search} onSearch={setSearch} onAddProduct={() => setDialog({ kind: 'product' })} onAdjust={productId => setDialog({ kind: 'adjust', productId })} onOrder={(productId, quantity) => setDialog({ kind: 'purchase', productId, quantity })} />}
        {active === 'procurement' && <ProcurementPage data={data} onCreatePurchase={() => setDialog({ kind: 'purchase' })} onReceiveOrder={orderId => setDialog({ kind: 'receive-purchase', purchaseOrderId: orderId })} onPaySupplier={supplierId => setDialog({ kind: 'supplier-payment', supplierId })} onAddSupplier={() => setDialog({ kind: 'supplier' })} />}
        {active === 'accounts' && <AccountsPage data={data} metrics={metrics} />}
        {active === 'reports' && <ReportsPage data={data} metrics={metrics} whatsappNumber={whatsappNumber} onWhatsAppUnavailable={requestWhatsAppDestination} role={activeMember?.role ?? 'Owner'} demoMode={demoMode} />}
        {active === 'integrations' && <SalesChannelsPage data={data} onCreateDemoOrder={createWebsiteOrder} cloudMode={Boolean(cloudAccount)} onNavigate={navigate} />}
        {active === 'settings' && <SettingsPage profile={data.profile} teamMembers={data.teamMembers} teamInvitations={data.teamInvitations ?? []} onSave={saveProfile} onAddMember={addTeamMember} onUpdateMember={updateTeamMember} onRevokeInvitation={revokeTeamInvitation} onCopyInvitation={copyTeamInvitation} canManageTeam={activeMember?.role === 'Owner' || activeMember?.role === 'Manager'} canAssignManager={activeMember?.role === 'Owner'} onReset={resetDemo} theme={theme} onThemeChange={setTheme} onOpenReports={() => navigate('reports')} whatsappNumber={whatsappNumber} onWhatsAppNumberChange={setWhatsAppNumber} onSaveWhatsApp={saveWhatsAppDestination} cloudMode={Boolean(cloudAccount)} onSignOut={() => { void handleCloudSignOut(); }} demoMode={demoMode} />}
        {active === 'more' && <MorePage allowedModules={allowedModules} onNavigate={navigate} />}
      </div>
      <footer className="app-footer"><span>Hesabu · Business in balance</span><span><i /> {demoMode ? 'Sample workspace · No live business records' : 'Secure cloud workspace · Synced with Hesabu'}</span></footer>
    </main>

    <nav className="mobile-bottom-nav" aria-label="Primary navigation">
      {(activeMember?.role === 'Inventory' ? [
        { id: 'overview' as ModuleKey, label: 'Home', icon: LayoutDashboard },
        { id: 'inventory' as ModuleKey, label: 'Stock', icon: Package },
        { id: 'procurement' as ModuleKey, label: 'Orders', icon: ShoppingCart },
        { id: 'more' as ModuleKey, label: 'More', icon: MoreHorizontal },
      ] : [
        { id: 'overview' as ModuleKey, label: 'Home', icon: LayoutDashboard },
        { id: 'sales' as ModuleKey, label: 'Sales', icon: Receipt },
        { id: 'reports' as ModuleKey, label: 'Analytics', icon: BarChart3 },
        { id: 'payments' as ModuleKey, label: 'Payments', icon: Wallet },
        { id: 'more' as ModuleKey, label: 'More', icon: MoreHorizontal },
      ]).filter(item => allowedModules.includes(item.id)).map(item =>
        <button key={item.id} className={active === item.id ? 'active' : ''} onClick={() => navigate(item.id)} aria-current={active === item.id ? 'page' : undefined}>
          <item.icon size={20} strokeWidth={1.9} aria-hidden="true" /><span>{item.label}</span>
        </button>
      )}
    </nav>

    <FloatingAssistant
      data={data}
      cloudMode={Boolean(cloudAccount)}
      demoMode={demoMode}
      whatsappNumber={whatsappNumber}
      onWhatsAppNumberChange={setWhatsAppNumber}
      onRecordSale={() => setDialog({ kind: 'sale' })}
      onRecordExpense={() => setDialog({ kind: 'expense' })}
      onUpdateStock={() => setDialog({ kind: 'stock-picker' })}
    />

    {dialog?.kind === 'sale' && <SaleDialog products={data.products} onClose={() => setDialog(null)} onCreate={createInvoice} onAddProduct={() => setDialog({ kind: 'product' })} cloudMode={Boolean(cloudAccount)} />}
    {dialog?.kind === 'stk' && <StkDialog invoices={data.invoices} initialInvoiceId={dialog.invoiceId} onClose={() => setDialog(null)} onCreate={createPaymentRequest} cloudMode={Boolean(cloudAccount)} />}
    {dialog?.kind === 'receipt' && <ReceiptDialog onClose={() => setDialog(null)} onCreate={addUnmatchedReceipt} />}
    {dialog?.kind === 'match-receipt' && selectedReceipt && <MatchReceiptDialog receipt={selectedReceipt} invoices={data.invoices} onClose={() => setDialog(null)} onMatch={invoiceId => matchUnmatchedReceipt(selectedReceipt.id, invoiceId)} />}
    {dialog?.kind === 'expense' && <ExpenseDialog onClose={() => setDialog(null)} onCreate={createExpense} />}
    {dialog?.kind === 'product' && <ProductDialog onClose={() => setDialog(null)} onCreate={createProduct} />}
    {dialog?.kind === 'supplier' && <SupplierDialog onClose={() => setDialog(null)} onCreate={addSupplier} />}
    {dialog?.kind === 'purchase' && <PurchaseDialog suppliers={data.suppliers} products={data.products} initialProductId={dialog.productId} initialQuantity={dialog.quantity} onClose={() => setDialog(null)} onCreate={createPurchaseOrder}
      onAddSupplier={() => setDialog({ kind: 'supplier', returnToPurchase: true })}
      onAddProduct={() => setDialog({ kind: 'product', returnToPurchase: true })} />}
    {dialog?.kind === 'receive-purchase' && selectedPurchaseOrder && <ReceivePurchaseDialog order={selectedPurchaseOrder} onClose={() => setDialog(null)} onReceive={items => receivePurchaseOrder(selectedPurchaseOrder.id, items)} />}
    {dialog?.kind === 'supplier-payment' && selectedSupplier && <SupplierPaymentDialog supplier={selectedSupplier} onClose={() => setDialog(null)} onPay={(amount, channel) => paySupplier(selectedSupplier.id, amount, channel)} />}
    {dialog?.kind === 'stock-picker' && <StockPickerDialog products={data.products} onClose={() => setDialog(null)} onAdjust={adjustStock} />}
    {dialog?.kind === 'stock-actions' && <StockActionsDialog products={data.products} onClose={() => setDialog(null)}
      onAddProduct={() => setDialog({ kind: 'product' })}
      onAddStock={() => setDialog({ kind: 'purchase' })}
      onUpdateStock={() => setDialog({ kind: 'stock-picker' })}
      onRemoveStock={() => setDialog({ kind: 'stock-remove' })} />}
    {dialog?.kind === 'stock-remove' && <StockMovementDialog products={data.products} mode="remove" onClose={() => setDialog(null)}
      onSave={(productId, nextQuantity, reason) => adjustStock(productId, nextQuantity, reason)} />}
    {dialog?.kind === 'adjust' && selectedProduct && <AdjustStockDialog product={selectedProduct} onClose={() => setDialog(null)} onAdjust={(quantity, reason) => adjustStock(selectedProduct.id, quantity, reason)} />}
    {selectedInvoice && <InvoiceDialog invoice={selectedInvoice} onClose={() => setSelectedInvoiceId(null)} onRequestPayment={() => {
      setSelectedInvoiceId(null);
      setDialog({ kind: 'stk', invoiceId: selectedInvoice.id });
    }} cloudMode={Boolean(cloudAccount)} />}
    {notice && <div className="toast" role="status"><CheckCircle2 size={17} /><span><strong>{notice.title}</strong>{notice.detail && <small>{notice.detail}</small>}</span><button onClick={closeNotice} aria-label="Dismiss notification"><X size={15} /></button></div>}
  </div>;
}

export default App;
