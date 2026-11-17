import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  Activity, AlertTriangle, ArrowDownLeft, ArrowRight, ArrowUpRight, BarChart3, BookOpen,
  Bell, Boxes, CalendarDays, Check, CheckCircle2, ChevronDown,
  ChevronRight, CircleDollarSign, Clock3, Download,
  FileCheck2, FileSpreadsheet, FileText, Filter, LayoutDashboard, Link2, MessageCircle, Moon, Sun,
  Menu, MoreHorizontal, Package, PanelLeftClose, Plus, Receipt,
  Search, Send, Settings, ShieldCheck, ShoppingCart, Smartphone,
  Store, TrendingDown, TrendingUp, Truck, Wallet, X, LogOut,
  type LucideIcon,
} from 'lucide-react';
import { allocateIncomingPayment, buildJournalPair, buildTrialBalance, calculateGrossProfit, isJournalBalanced, isTrialBalanceBalanced, outstandingBalance, planPurchaseReceipt, weightedAverageUnitCost } from './finance';
import { makeDemoData, readWorkspace, saveWorkspace } from './data';
import {
  adjustCloudStock, createBusiness, createCloudProduct, createCloudSupplier,
  createCloudPurchaseOrder, getBusinessSettings, getCloudWorkspace,
  listMyBusinesses, postCloudExpense, postCloudPayment, postCloudSale,
  postCloudSupplierPayment, receiveCloudPurchaseOrder, restoreCloudSession,
  saveBusinessPreferences, saveCloudBusinessProfile, saveCloudWhatsAppDestination,
  signInWithPassword, signOut, signUpWithPassword,
  type SignUpInput, type SupabaseUser,
} from './lib/supabase';
import type {
  AppData, BusinessProfile, Invoice, InvoiceStatus, ModuleKey, NewInvoiceInput,
  NewPaymentInput, NewPurchaseInput, NewUnmatchedReceiptInput, Payment, PaymentChannel, Product,
  PurchaseOrder, ReceiptRail, Supplier, TeamMember, TeamRole, UnmatchedReceipt,
} from './types';

type Notice = { title: string; detail?: string } | null;
type DialogState =
  | { kind: 'sale' }
  | { kind: 'stk'; invoiceId?: string }
  | { kind: 'receipt' }
  | { kind: 'match-receipt'; receiptId: string }
  | { kind: 'expense' }
  | { kind: 'product' }
  | { kind: 'supplier' }
  | { kind: 'purchase'; productId?: string; quantity?: number }
  | { kind: 'receive-purchase'; purchaseOrderId: string }
  | { kind: 'invoice'; invoiceId: string }
  | { kind: 'supplier-payment'; supplierId: string }
  | { kind: 'adjust'; productId: string }
  | { kind: 'stock-picker' }
  | { kind: 'profile' }
  | null;

const NAV_GROUPS: Array<{ title: string; items: Array<{ id: ModuleKey; label: string; icon: LucideIcon }> }> = [
  { title: 'WORKSPACE', items: [
    { id: 'overview', label: 'Home', icon: LayoutDashboard },
    { id: 'sales', label: 'Sales', icon: Receipt },
    { id: 'payments', label: 'Money', icon: Wallet },
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
  Manager: ['overview', 'sales', 'payments', 'inventory', 'procurement', 'accounts', 'reports', 'integrations', 'more'],
  Sales: ['overview', 'sales', 'payments', 'reports', 'more'],
  Inventory: ['overview', 'inventory', 'procurement', 'more'],
  Finance: ['overview', 'sales', 'payments', 'accounts', 'reports', 'more'],
};

const money = (value: number) => new Intl.NumberFormat('en-KE', {
  style: 'currency', currency: 'KES', maximumFractionDigits: 0,
}).format(Math.round(value || 0)).replace('KES', 'KSh');

const numberText = (value: number) => new Intl.NumberFormat('en-KE', { maximumFractionDigits: 0 }).format(value || 0);
const dateKey = (date: Date) => {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 10);
};
const today = () => dateKey(new Date());
const addDays = (source: string, amount: number) => {
  const date = new Date(source + 'T12:00:00');
  date.setDate(date.getDate() + amount);
  return dateKey(date);
};
const dateLabel = (value: string) => new Date(value + 'T12:00:00').toLocaleDateString('en-KE', {
  day: 'numeric', month: 'short', year: 'numeric',
});
const dateTimeLabel = (value: string) => new Date(value).toLocaleString('en-KE', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});
const makeId = (prefix: string) => prefix + '-' + Math.random().toString(36).slice(2, 9).toUpperCase();
const channelLabel = (channel: PaymentChannel) => ({
  mpesa: 'M-Pesa', cash: 'Cash', bank: 'Bank transfer', card: 'Card', credit: 'On credit',
}[channel]);
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

function SaleDialog({ products, onClose, onCreate, cloudMode }: {
  products: Product[]; onClose: () => void; onCreate: (input: NewInvoiceInput) => void; cloudMode: boolean;
}) {
  const [customer, setCustomer] = useState('Walk-in customer');
  const [phone, setPhone] = useState('');
  const [dueDate, setDueDate] = useState(addDays(today(), 7));
  const [discount, setDiscount] = useState('0');
  const [channel, setChannel] = useState<PaymentChannel>('mpesa');
  const [source, setSource] = useState<Invoice['source']>('pos');
  const [items, setItems] = useState([{ productId: products[0]?.id || '', quantity: 1 }]);
  const productFor = (id: string) => products.find(product => product.id === id);
  const subtotal = sum(items.map(item => (productFor(item.productId)?.sellingPrice || 0) * item.quantity));
  const total = Math.max(0, subtotal - Math.max(0, Number(discount) || 0));
  const addItem = () => setItems(current => [...current, { productId: products[0]?.id || '', quantity: 1 }]);
  const updateItem = (index: number, patch: Partial<{ productId: string; quantity: number }>) => {
    setItems(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  };
  const removeItem = (index: number) => setItems(current => current.filter((_, itemIndex) => itemIndex !== index));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const validItems = items.filter(item => item.productId && item.quantity > 0);
    if (!validItems.length) return;
    for (const item of validItems) {
      const product = productFor(item.productId);
      if (!product || item.quantity > product.quantity) return;
    }
    onCreate({
      customer: customer.trim() || 'Walk-in customer', phone, dueDate,
      discount: Math.max(0, Number(discount) || 0), channel, items: validItems, source,
    });
  };

  return <Modal title="Record a sale" detail="Post one sale and update the invoice, payment record and stock ledger together." onClose={onClose} size="lg">
    <form className="modal-body" onSubmit={submit}>
      <div className="form-grid form-grid-two">
        <Field label="Customer or account" value={customer} onChange={setCustomer} placeholder="Walk-in customer" />
        <Field label="Customer phone" value={phone} onChange={setPhone} placeholder="07XX XXX XXX" />
      </div>
      <div className="subsection-label">Items sold</div>
      <div className="sale-items">
        {items.map((item, index) => {
          const product = productFor(item.productId);
          return <div className="sale-item-row" key={index}>
            <label className="field sale-product-field">
              <span className="field-label">Product</span>
              <select className="field-input" value={item.productId} onChange={event => updateItem(index, { productId: event.target.value })}>
                {products.map(option => <option key={option.id} value={option.id}>{option.name} · {money(option.sellingPrice)}</option>)}
              </select>
            </label>
            <Field label="Qty" type="number" min={1} step={1} value={item.quantity} onChange={value => updateItem(index, { quantity: Math.max(1, Number(value) || 1) })} />
            <div className="sale-line-total"><span>Line total</span><strong>{money((product?.sellingPrice || 0) * item.quantity)}</strong></div>
            {items.length > 1 && <IconButton label="Remove item" onClick={() => removeItem(index)}><X size={15} /></IconButton>}
          </div>;
        })}
      </div>
      <div className="inline-form-actions">
        <Button variant="outline" size="sm" onClick={addItem}><Plus size={14} /> Add another item</Button>
        <span className="field-hint">Available quantity is checked before the sale is posted.</span>
      </div>
      <div className="form-grid form-grid-three">
        <Field label="Discount (KSh)" type="number" min={0} value={discount} onChange={setDiscount} />
        <SelectField label="Payment method" value={channel} onChange={value => setChannel(value as PaymentChannel)} options={[
          { value: 'mpesa', label: 'M-Pesa received' }, { value: 'cash', label: 'Cash received' },
          { value: 'bank', label: 'Bank transfer' }, { value: 'card', label: 'Card payment' },
          { value: 'credit', label: 'On credit' },
        ]} />
        <SelectField label="Sales source" value={source} onChange={value => setSource(value as Invoice['source'])} options={cloudMode
          ? [{ value: 'pos', label: 'Point of sale' }, { value: 'manual', label: 'Manual entry' }]
          : [
            { value: 'pos', label: 'Point of sale' }, { value: 'website', label: 'Website' },
            { value: 'hesabu', label: 'Hesabu checkout' }, { value: 'manual', label: 'Manual entry' },
          ]} />
      </div>
      {channel === 'credit' && <Field label="Payment due date" type="date" value={dueDate} onChange={setDueDate} />}
      <div className="dialog-total">
        <span><span>Subtotal</span><strong>{money(subtotal)}</strong></span>
        <span><span>Discount</span><strong>−{money(Number(discount) || 0)}</strong></span>
        <span className="dialog-total-final"><span>Total to record</span><strong>{money(total)}</strong></span>
      </div>
      <div className="modal-footer">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={!items.length || total <= 0}><Check size={16} /> Post sale</Button>
      </div>
    </form>
  </Modal>;
}

function StkDialog({ invoices, initialInvoiceId, onClose, onCreate, cloudMode }: {
  invoices: Invoice[]; initialInvoiceId?: string; onClose: () => void;
  onCreate: (input: NewPaymentInput) => void; cloudMode: boolean;
}) {
  const outstandingInvoices = invoices.filter(invoice => invoiceBalance(invoice) > 0);
  const [invoiceId, setInvoiceId] = useState(initialInvoiceId || outstandingInvoices[0]?.id || '');
  const invoice = outstandingInvoices.find(item => item.id === invoiceId);
  const [phone, setPhone] = useState(invoice?.phone || '');
  const [amount, setAmount] = useState(String(invoice ? invoiceBalance(invoice) : 0));
  const [channel, setChannel] = useState<Exclude<PaymentChannel, 'credit'>>('mpesa');
  const [reference, setReference] = useState('');
  useEffect(() => {
    const selected = outstandingInvoices.find(item => item.id === invoiceId);
    if (selected) {
      setAmount(String(invoiceBalance(selected)));
      setPhone(selected.phone || '');
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

function PurchaseDialog({ suppliers, products, initialProductId, initialQuantity, onClose, onCreate }: {
  suppliers: Supplier[]; products: Product[]; initialProductId?: string; initialQuantity?: number;
  onClose: () => void; onCreate: (input: NewPurchaseInput) => void;
}) {
  const initialProduct = products.find(product => product.id === initialProductId) || products[0];
  const [supplierId, setSupplierId] = useState(suppliers.find(item => item.id === initialProduct?.supplierId)?.id || suppliers[0]?.id || '');
  const [expectedAt, setExpectedAt] = useState(addDays(today(), 2));
  const [items, setItems] = useState(() => initialProduct ? [{
    productId: initialProduct.id, quantity: Math.max(1, initialQuantity || 10), unitCost: initialProduct.costPrice,
  }] : []);
  const updateItem = (index: number, patch: Partial<(typeof items)[number]>) => {
    setItems(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  };
  const addItem = () => {
    const product = products.find(candidate => !items.some(item => item.productId === candidate.id));
    if (product) setItems(current => [...current, { productId: product.id, quantity: 1, unitCost: product.costPrice }]);
  };
  const total = sum(items.map(item => item.quantity * item.unitCost));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const valid = items.filter(item => item.productId && item.quantity > 0 && item.unitCost > 0);
    if (supplierId && valid.length) onCreate({ supplierId, expectedAt, items: valid });
  };
  return <Modal title="Create purchase order" detail="Build a supplier order with multiple lines. Inventory and accounts payable update when goods are received." onClose={onClose} size="lg">
    <form className="modal-body" onSubmit={submit}>
      <SelectField label="Supplier" value={supplierId} onChange={setSupplierId} options={suppliers.map(item => ({ value: item.id, label: item.name }))} />
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
            <Field label="Qty" type="number" min={1} value={item.quantity} onChange={value => updateItem(index, { quantity: Math.max(1, Number(value) || 1) })} />
            <Field label="Unit cost" type="number" min={1} value={item.unitCost} onChange={value => updateItem(index, { unitCost: Math.max(0, Number(value) || 0) })} />
            <div className="sale-line-total"><span>Line total</span><strong>{money(selected ? item.quantity * item.unitCost : 0)}</strong></div>
            {items.length > 1 && <IconButton label="Remove item" onClick={() => setItems(current => current.filter((_, itemIndex) => itemIndex !== index))}><X size={15} /></IconButton>}
          </div>;
        })}
      </div>
      <div className="inline-form-actions">
        <Button variant="outline" size="sm" onClick={addItem} disabled={items.length >= products.length}><Plus size={14} /> Add another item</Button>
        <span className="field-hint">Each line retains its purchase cost for stock valuation.</span>
      </div>
      <Field label="Expected delivery date" type="date" value={expectedAt} onChange={setExpectedAt} />
      <div className="dialog-total"><span className="dialog-total-final"><span>Purchase order total</span><strong>{money(total)}</strong></span></div>
      <div className="modal-footer"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!supplierId || !items.length || total <= 0}>Create purchase order</Button></div>
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

function InvoiceDialog({ invoice, onClose, onRequestPayment }: {
  invoice: Invoice; onClose: () => void; onRequestPayment: () => void;
}) {
  return <Modal title={invoice.number} detail="Invoice record and settlement history." onClose={onClose} size="lg">
    <div className="modal-body">
      <div className="invoice-detail-top">
        <div><span className="field-label">Bill to</span><strong>{invoice.customer}</strong><small>{invoice.phone || 'No phone recorded'}</small></div>
        <div className="invoice-detail-status"><StatusPill status={invoice.status}>{statusLabel(invoice.status)}</StatusPill><small>Issued {dateLabel(invoice.date)}</small></div>
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
        <div className="grand-total"><span>Invoice total</span><strong>{money(invoice.total)}</strong></div>
        <div><span>Paid to date</span><strong>{money(invoice.paid)}</strong></div>
        <div className="grand-total balance-total"><span>Balance due</span><strong>{money(invoiceBalance(invoice))}</strong></div>
      </div>
      <div className="invoice-detail-meta">
        <span>Source <strong>{sourceLabel(invoice.source)}</strong></span>
        <span>Payment terms <strong>{dateLabel(invoice.dueDate)}</strong></span>
        <span>Preferred channel <strong>{channelLabel(invoice.channel)}</strong></span>
      </div>
      <div className="modal-footer">
        <Button variant="ghost" onClick={onClose}>Close</Button>
        {invoiceBalance(invoice) > 0 && <Button onClick={onRequestPayment}><Send size={15} /> Request balance</Button>}
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
  return <Modal title="Record a payment received" detail="Record a customer payment and link it to the correct sale." onClose={onClose}>
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
      <div className="demo-notice"><ShieldCheck size={16} /><span><strong>Receipt capture only</strong><small>This records the receipt so it can be matched to the correct customer sale.</small></span></div>
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
  const eligible = invoices.filter(invoice => invoiceBalance(invoice) > 0);
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

function HesabuMark({ className = '' }: { className?: string }) {
  return <svg className={'hesabu-quill-mark ' + className} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
    <path d="M29.5 5.2C18.2 6.7 9.6 14 8.8 23.4c-.4 4.7 2.1 8 6.2 9.1 8-4.2 14.7-14.6 14.5-27.3Z" fill="currentColor" />
    <path d="M8.1 35.2C13.2 27.1 19.8 18.1 28.7 7.3M13.4 27.6l-4.8-1.2m9.7-6.8-5.7-1.1m10.2-6.2-2.9-3.7" fill="none" stroke="#176b4c" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M6.8 36.1 10.6 32" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>;
}

function PublicLandingPage({
  onSignIn, onCreateAccount, onPreview,
}: {
  onSignIn: () => void;
  onCreateAccount: () => void;
  onPreview: () => void;
}) {
  return <div className="public-site">
    <header className="public-header">
      <div className="public-header-inner">
        <a className="public-brand" href="#top" aria-label="Hesabu home">
          <span className="brand-mark"><HesabuMark /></span>
          <span>hesabu<span>.</span></span>
        </a>
        <nav className="public-nav" aria-label="Main navigation">
          <a href="#product">Product</a>
          <a href="#how-it-works">How it works</a>
          <a href="#businesses">Who it serves</a>
          <a href="#trust">Your records</a>
        </nav>
        <div className="public-header-actions">
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
          <p>Hesabu brings daily sales, payments, stock, expenses and customer balances into one clear business record. Spend less time chasing scattered notes and more time making informed decisions.</p>
          <div className="public-hero-actions">
            <button type="button" className="public-primary-action" onClick={onCreateAccount}>Create your business account <ArrowRight size={16} /></button>
            <button type="button" className="public-secondary-action" onClick={onPreview}>Explore the sample workspace</button>
          </div>
          <div className="public-hero-note"><ShieldCheck size={15} /> Designed around the everyday work of Kenyan businesses</div>
        </div>
        <div className="public-hero-visual" aria-label="Illustrative Hesabu business overview">
          <div className="public-visual-top">
            <div><span>BUSINESS OVERVIEW</span><strong>Today at a glance</strong></div>
            <span className="public-visual-date">SAMPLE DATA</span>
          </div>
          <div className="public-visual-metrics">
            <div><span>Sales recorded</span><strong>KSh 48,250</strong><small>Today's activity</small></div>
            <div><span>Payments received</span><strong>KSh 35,600</strong><small>Matched collections</small></div>
            <div><span>Operating expenses</span><strong>KSh 4,850</strong><small>Recorded today</small></div>
            <div><span>Stock alerts</span><strong>3 items</strong><small>Need a closer look</small></div>
          </div>
          <div className="public-visual-activity">
            <div><span className="public-activity-dot"></span><span><strong>Sale recorded</strong><small>Counter sale · 10:42 AM</small></span><b>KSh 2,400</b></div>
            <div><span className="public-activity-dot public-activity-blue"></span><span><strong>Stock updated</strong><small>Flour · Goods received</small></span><b>+12 bags</b></div>
            <div><span className="public-activity-dot public-activity-amber"></span><span><strong>Customer balance</strong><small>Invoice HS-0021 · Due today</small></span><b>KSh 1,800</b></div>
          </div>
          <p className="public-visual-footnote">Illustrative figures shown for product demonstration.</p>
        </div>
      </section>

      <section className="public-value-section" id="product">
        <div className="public-section-intro">
          <span className="public-eyebrow">WHAT HESABU DOES</span>
          <h2>The important parts of the business, in one place.</h2>
          <p>Each record contributes to a clearer view of what the business has sold, collected, spent and still needs to do.</p>
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
          <div><span>1</span><strong>Capture daily activity</strong><p>Enter a sale, receipt, expense or stock change as it happens.</p></div>
          <div><span>2</span><strong>Keep records connected</strong><p>Link transactions to products, customers, suppliers and balances.</p></div>
          <div><span>3</span><strong>Review your business</strong><p>See the day’s figures and prepare a digest to share with your team.</p></div>
        </div>
      </section>

      <section className="public-business-section" id="businesses">
        <div>
          <span className="public-eyebrow">BUILT FOR EVERYDAY OPERATIONS</span>
          <h2>Useful from the counter to the back office.</h2>
          <p>Hesabu is being shaped for shops, food businesses, wholesalers, distributors and service businesses that need a dependable record of daily operations.</p>
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
        <div><span className="public-eyebrow">YOUR BUSINESS, YOUR RECORDS</span><h2>Clear access. Clear records. Clear decisions.</h2><p>Hesabu’s cloud workspace is being built around individual accounts and business-level access. Manual entry remains the foundation; optional AI assistance and WhatsApp summaries can be enabled independently.</p></div>
        <button type="button" className="public-secondary-action" onClick={onCreateAccount}>Set up your workspace <ArrowRight size={15} /></button>
      </section>
    </main>

    <footer className="public-footer">
      <div className="public-footer-main">
        <div className="public-footer-brand">
          <a className="public-brand" href="#top"><span className="brand-mark"><HesabuMark /></span><span>hesabu<span>.</span></span></a>
          <p>A clearer business record for the people who run the business every day.</p>
        </div>
        <div className="public-footer-group"><strong>Product</strong><a href="#product">Sales and payments</a><a href="#product">Stock and purchasing</a><a href="#product">Reports and digest</a></div>
        <div className="public-footer-group"><strong>Learn</strong><a href="#how-it-works">How it works</a><a href="#businesses">Who Hesabu serves</a><a href="#trust">Your records</a></div>
        <div className="public-footer-group"><strong>Your account</strong><button type="button" onClick={onSignIn}>Sign in</button><button type="button" onClick={onCreateAccount}>Create a business account</button><button type="button" onClick={onPreview}>Explore sample data</button></div>
      </div>
      <div className="public-footer-bottom"><span>© 2026 Hesabu. Built for business operations in Kenya.</span><span>Product information is subject to change as integrations are completed.</span></div>
    </footer>
  </div>;
}

function AuthPage({
  onPreview, onSignIn, onSignUp, initialMessage, initialMode, onBack,
}: {
  onPreview: () => void;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (input: SignUpInput) => Promise<'confirm_email' | void>;
  initialMessage?: string;
  initialMode: 'signin' | 'signup';
  onBack: () => void;
}) {
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [fullName, setFullName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [industry, setIndustry] = useState('Retail / shop');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [aiAssistantEnabled, setAiAssistantEnabled] = useState(false);
  const [whatsappDigestEnabled, setWhatsappDigestEnabled] = useState(false);
  const [whatsappRecipientPhone, setWhatsappRecipientPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(initialMessage ?? '');

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

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
      } else {
        if (!fullName.trim() || !businessName.trim()) {
          setMessage('Enter your name and business name to continue.');
          return;
        }
        if (whatsappDigestEnabled && !normaliseWhatsAppNumber(whatsappRecipientPhone)) {
          setMessage('Enter a valid WhatsApp number, including the Kenyan country code or a local mobile number.');
          return;
        }
        const result = await onSignUp({
          fullName, businessName, industry, phone, email, password,
          aiAssistantEnabled, whatsappDigestEnabled, whatsappRecipientPhone,
        });
        if (result === 'confirm_email') {
          setMessage('Your account has been created. Check your email for the confirmation link, then return here to sign in.');
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Hesabu could not complete that request. Try again.');
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
          <h1>{mode === 'signin' ? 'Your business, clearly in view.' : 'Set up your Hesabu account.'}</h1>
          <p>Sales, payments, stock and business performance in one calm workspace.</p>
        </div>
        <div className="auth-tabs" role="tablist" aria-label="Account access">
          <button type="button" role="tab" aria-selected={mode === 'signin'} className={mode === 'signin' ? 'active' : ''} onClick={() => { setMode('signin'); setMessage(''); }}>Sign in</button>
          <button type="button" role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setMessage(''); }}>Create account</button>
        </div>
        <form className="auth-form" onSubmit={submit}>
          {mode === 'signup' && <>
            <label className="auth-field"><span>Your full name</span><input autoComplete="name" value={fullName} onChange={event => setFullName(event.target.value)} placeholder="Name of the business owner" required /></label>
            <label className="auth-field"><span>Business name</span><input value={businessName} onChange={event => setBusinessName(event.target.value)} placeholder="e.g. Muriuki Stores" required /></label>
            <label className="auth-field"><span>Business type</span>
              <select value={industry} onChange={event => setIndustry(event.target.value)}>
                <option>Retail / shop</option><option>Food & hospitality</option><option>Wholesale / distribution</option>
                <option>Services</option><option>Manufacturing / production</option><option>Other</option>
              </select>
            </label>
            <label className="auth-field"><span>Business phone <small>(optional)</small></span><input type="tel" autoComplete="tel" value={phone} onChange={event => setPhone(event.target.value)} placeholder="07XX XXX XXX" /></label>
          </>}
          <label className="auth-field"><span>Business email</span><input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@business.com" required /></label>
          <label className="auth-field"><span>Password</span><input type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter your password" minLength={8} required /></label>
          {mode === 'signup' && <section className="auth-preferences" aria-label="Optional business preferences">
            <div className="auth-preferences-heading"><strong>How should Hesabu support your daily work?</strong><small>These options work together. Manual entry is always available.</small></div>
            <div className="auth-preference-manual"><span><strong>Manual records</strong><small>Record sales, payments, expenses and stock yourself.</small></span><span>Always on</span></div>
            <label className="auth-preference-option">
              <input type="checkbox" checked={aiAssistantEnabled} onChange={event => setAiAssistantEnabled(event.target.checked)} />
              <span><strong>AI assistant</strong><small>Optional. Ask questions about sales, stock, expenses and balances when the AI service is connected.</small></span>
            </label>
            <label className="auth-preference-option">
              <input type="checkbox" checked={whatsappDigestEnabled} onChange={event => setWhatsappDigestEnabled(event.target.checked)} />
              <span><strong>WhatsApp daily digest</strong><small>Prepare a daily business summary for WhatsApp.</small></span>
            </label>
            {whatsappDigestEnabled && <label className="auth-field auth-whatsapp-field"><span>WhatsApp destination</span><input type="tel" inputMode="tel" value={whatsappRecipientPhone} onChange={event => setWhatsappRecipientPhone(event.target.value)} placeholder="2547XXXXXXXX" required /></label>}
          </section>}
          <Button type="submit" block disabled={busy}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'} <ArrowRight size={15} /></Button>
        </form>
        {message && <p className="auth-message" role="status">{message}</p>}
        <div className="auth-divider"><span>OR</span></div>
        <Button variant="outline" block onClick={onPreview}>Explore the sample workspace <ArrowRight size={15} /></Button>
        <p className="auth-footnote">The sample workspace is stored only in this browser. Sign-in creates a separate cloud account.</p>
      </div>
      <aside className="auth-aside">
        <div className="auth-aside-top"><span className="auth-aside-mark"><HesabuMark /></span><span>Hesabu workspace</span><span className="auth-live-label">BUSINESS OPERATIONS</span></div>
        <div className="auth-aside-copy">
          <span>ONE VIEW OF THE BUSINESS</span>
          <h2>Know what is happening in your business.</h2>
          <p>Bring sales, payments, stock and daily expenses into one clear business record.</p>
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
  const query = question.toLowerCase();
  const todayDigest = getDailyDigest(data);
  const lastSevenDays = data.invoices.filter(invoice => invoice.date >= addDays(today(), -6) && invoice.date <= today());
  const sevenDaySales = sum(lastSevenDays.map(invoice => invoice.total));
  const averageDailySales = sevenDaySales / 7;
  if (/stock|inventory|reorder|out of stock|product|slow mov/.test(query)) {
    const lowStock = data.products.filter(product => product.quantity <= product.reorderLevel);
    const outOfStock = lowStock.filter(product => product.quantity <= 0);
    const names = lowStock.slice(0, 4).map(product => product.name + ' (' + numberText(product.quantity) + ' ' + product.unit + ')');
    return 'Stock check: ' + outOfStock.length + ' products are out of stock and ' + lowStock.length + ' are at or below their reorder point. ' +
      (names.length ? 'Review: ' + names.join(', ') + '.' : 'No products are currently at or below their reorder point.') +
      ' Stock value at cost is ' + money(sum(data.products.map(productValue))) + '.';
  }
  if (/owe|debt|receivable|unpaid|customer balance|who.*pay/.test(query)) {
    const due = data.invoices.filter(invoice => invoiceBalance(invoice) > 0).sort((a, b) => invoiceBalance(b) - invoiceBalance(a));
    const names = due.slice(0, 3).map(invoice => invoice.customer + ' · ' + money(invoiceBalance(invoice)));
    return 'Customer balances total ' + money(sum(due.map(invoiceBalance))) + ' across ' + due.length + ' unpaid invoices. ' +
      (names.length ? 'Largest balances: ' + names.join('; ') + '.' : 'There are no unpaid customer invoices in the current records.');
  }
  if (/expense|spend|spent|cost today/.test(query)) {
    return 'Expenses recorded today total ' + money(todayDigest.expenseTotal) + '. Supplier payments were ' +
      money(todayDigest.supplierPaymentTotal) + '. These are separate figures so supplier settlements are not mixed with operating expenses.';
  }
  if (/best sell|top sell|popular|fast mov/.test(query)) {
    const cutoff = addDays(today(), -29);
    const ranked = data.products.map(product => ({
      product,
      units: sum(data.invoices.filter(invoice => invoice.date >= cutoff && invoice.date <= today())
        .flatMap(invoice => invoice.lines.filter(line => line.productId === product.id).map(line => line.quantity))),
    })).filter(item => item.units > 0).sort((a, b) => b.units - a.units).slice(0, 3);
    return ranked.length
      ? 'Top sellers by units over the last 30 days: ' + ranked.map((item, index) => (index + 1) + '. ' + item.product.name + ' — ' + numberText(item.units) + ' ' + item.product.unit).join('; ') + '.'
      : 'There are no recorded product sales in the last 30 days, so I cannot rank best sellers yet.';
  }
  return 'Today: ' + money(todayDigest.salesTotal) + ' in sales across ' + todayDigest.sales.length + ' invoices, with gross profit of ' +
    money(todayDigest.grossProfit) + '. The seven-day daily sales average is ' + money(averageDailySales) +
    '. Ask about stock, unpaid customer balances, expenses or best-selling products for a more specific view.';
}

function FloatingAssistant({
  data, whatsappNumber, onWhatsAppNumberChange, onRecordSale, onRecordExpense, onUpdateStock, cloudMode,
}: {
  data: AppData;
  cloudMode: boolean;
  whatsappNumber: string;
  onWhatsAppNumberChange: (value: string) => void;
  onRecordSale: () => void;
  onRecordExpense: () => void;
  onUpdateStock: () => void;
}) {
  const [panel, setPanel] = useState<'assistant' | 'digest' | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [digestError, setDigestError] = useState('');
  const digest = getDailyDigest(data);
  const ask = (value: string) => {
    const clean = value.trim();
    if (!clean) return;
    setQuestion(clean);
    setAnswer(getWorkspaceAnswer(data, clean));
  };
  const togglePanel = (next: 'assistant' | 'digest') => {
    setDigestError('');
    setPanel(current => current === next ? null : next);
  };
  const shareDigest = () => {
    setDigestError('');
    openDailyDigestWhatsApp(data, whatsappNumber, () => {
      setDigestError('Enter a valid WhatsApp number to prepare this summary.');
    });
  };
  const suggestions = ['How are sales doing?', 'What stock needs attention?', 'Who still owes us?'];
  return <>
    {panel === 'assistant' && <section className="assistant-drawer" role="dialog" aria-modal="false" aria-label="Hesabu assistant">
      <header className="assistant-drawer-header">
        <span className="assistant-drawer-mark"><HesabuMark /></span>
        <span><strong>{cloudMode ? 'Hesabu insights' : 'Hesabu assistant'}</strong><small>{cloudMode ? 'Saved business records · Rules-based' : 'Answers from this workspace · Preview'}</small></span>
        <button type="button" className="icon-button" aria-label="Close assistant" onClick={() => setPanel(null)}><X size={18} /></button>
      </header>
      <div className="assistant-drawer-body">
        <div className="assistant-welcome-message"><strong>What would you like to understand?</strong><p>{cloudMode
          ? 'I can summarise the sales, balances and stock records saved for this business.'
          : 'I can summarise the sales, balances and stock records currently saved in this browser.'}</p></div>
        <div className="assistant-suggestions">{suggestions.map(item => <button key={item} type="button" onClick={() => ask(item)}>{item}<ArrowRight size={13} /></button>)}</div>
        <div className="assistant-quick-actions">
          <span>Record something</span>
          <div>
            <button type="button" onClick={() => { setPanel(null); onRecordSale(); }}><Receipt size={14} /> Sale</button>
            <button type="button" onClick={() => { setPanel(null); onRecordExpense(); }}><TrendingDown size={14} /> Expense</button>
            <button type="button" onClick={() => { setPanel(null); onUpdateStock(); }}><Package size={14} /> Stock</button>
          </div>
        </div>
        {question && <div className="assistant-answer" aria-live="polite"><span className="assistant-question">{question}</span><p>{answer}</p></div>}
      </div>
      <form className="assistant-drawer-entry" onSubmit={event => { event.preventDefault(); ask(question); }}>
        <input aria-label="Ask Hesabu" value={question} onChange={event => setQuestion(event.target.value)} placeholder="Ask about sales, stock or balances…" />
        <button type="submit" aria-label="Send question" disabled={!question.trim()}><ArrowUpRight size={18} /></button>
      </form>
      <p className="assistant-drawer-note">{cloudMode
        ? 'These are fixed calculations against your saved records, not generative AI. AI assistance is not connected yet.'
        : 'This preview uses saved records and fixed queries. Generative AI is not connected yet.'}</p>
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
        <label className="digest-floating-recipient">
          <span>WhatsApp destination</span>
          <input value={whatsappNumber} onChange={event => { onWhatsAppNumberChange(event.target.value); setDigestError(''); }} placeholder="2547XXXXXXXX" inputMode="tel" />
        </label>
        {digestError && <p className="digest-floating-error" role="alert">{digestError}</p>}
        <button type="button" className="digest-share-button" onClick={shareDigest}><MessageCircle size={16} /> Open WhatsApp</button>
        <p className="digest-floating-note">Hesabu fills the message for you. Review it in WhatsApp and press Send. Automatic delivery is not enabled in this preview.</p>
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
        aria-label={panel === 'assistant' ? 'Close Hesabu assistant' : 'Open Hesabu assistant'}
        aria-expanded={panel === 'assistant'}
        onClick={() => togglePanel('assistant')}
        title="Ask Hesabu"
      >
        {panel === 'assistant' ? <X size={21} /> : <HesabuMark />}
      </button>
    </div>
  </>;
}

function OverviewPage({ data, metrics, onCreateSale, onNavigate, onSelectInvoice, onRecordExpense, onRecordPayment, onCreatePurchase, onQuickStock }: {
  data: AppData; metrics: ReturnType<typeof getMetrics>; onCreateSale: () => void;
  onNavigate: (section: ModuleKey) => void; onSelectInvoice: (id: string) => void; onRecordExpense: () => void;
  onRecordPayment: () => void; onCreatePurchase: () => void; onQuickStock: () => void;
}) {
  const chartDays = Array.from({ length: 7 }, (_, index) => addDays(today(), index - 6));
  const chartValues = chartDays.map(day => sum(data.invoices.filter(invoice => invoice.date === day).map(invoice => invoice.total)));
  const chartLabels = chartDays.map(day => new Date(day + 'T12:00:00').toLocaleDateString('en-KE', { weekday: 'short' }));
  const recentInvoices = [...data.invoices].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const lowStock = data.products.filter(product => product.quantity <= product.reorderLevel);
  const zeroStock = data.products.filter(product => product.quantity === 0);
  const slowStock = data.products.filter(product => product.quantity > 0 && !data.invoices.some(invoice =>
    invoice.date >= addDays(today(), -30) && invoice.lines.some(line => line.productId === product.id),
  ));
  const unsettled = data.invoices.filter(invoice => invoiceBalance(invoice) > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 3);
  return <div className="page-stack">
    <div className="overview-welcome">
      <div><div className="eyebrow">BUSINESS OVERVIEW</div><h2>{data.profile.name}</h2><p>Here is what needs your attention today.</p></div>
      <div className="overview-welcome-actions">
        <span className="date-chip"><CalendarDays size={14} /> {dateLabel(today())}</span>
        <Button onClick={onCreateSale}><Plus size={15} /> Record sale</Button>
      </div>
    </div>
    <section className="business-overview-panel" aria-label="Quick actions">
      <div className="business-overview-top">
        <div><span className="business-overview-kicker">YOUR BUSINESS</span><h3>Quick actions</h3><p>Keep your daily work moving.</p></div>
      </div>
      <div className="business-quick-actions" aria-label="Quick actions">
        <button type="button" onClick={onCreateSale}><span className="quick-action-icon"><Receipt size={19} /></span><strong>Record a sale</strong><small>Enter items sold</small></button>
        <button type="button" onClick={onRecordExpense}><span className="quick-action-icon"><TrendingDown size={19} /></span><strong>Add expense</strong><small>Record money spent</small></button>
        <button type="button" onClick={onRecordPayment}><span className="quick-action-icon"><Wallet size={19} /></span><strong>Receive payment</strong><small>Update a balance</small></button>
        <button type="button" onClick={onCreatePurchase}><span className="quick-action-icon"><ShoppingCart size={19} /></span><strong>Buy stock</strong><small>Record stock bought</small></button>
        <button type="button" onClick={onQuickStock}><span className="quick-action-icon"><Package size={19} /></span><strong>Update inventory</strong><small>Change stock levels</small></button>
      </div>
    </section>
    <section className="daily-summary-section" aria-label="Daily business figures">
      <div className="daily-summary-heading"><h3>Business at a glance</h3><span>Today's figures</span></div>
      <div className="daily-summary-grid">
        <div className="daily-summary-item"><span>Sales today</span><strong>{money(metrics.salesToday)}</strong></div>
        <div className="daily-summary-item"><span>Expenses today</span><strong>{money(sum(data.expenses.filter(expense => expense.date === today()).map(expense => expense.amount)))}</strong></div>
        <div className="daily-summary-item"><span>Items in stock</span><strong>{data.products.reduce((total, product) => total + product.quantity, 0).toLocaleString('en-KE')}</strong><small>Across {data.products.length} products</small></div>
        <div className="daily-summary-item"><span>Bills to pay</span><strong>{money(metrics.payables)}</strong><small>Unpaid supplier bills</small></div>
      </div>
    </section>
    <div className="content-grid content-grid-main">
      <SectionCard title="Sales trend" detail="Recorded sales over the last seven days.">
        <div className="chart-summary"><strong>{money(sum(chartValues))}</strong><span>Last 7 days</span></div>
        <MiniBars values={chartValues} labels={chartLabels} />
      </SectionCard>
      <SectionCard title="Stock watch" detail="Products that could interrupt sales or tie up cash.">
        <div className="stock-watch-list">
          <button onClick={() => onNavigate('inventory')}><span><strong>Out of stock</strong><small>Products unavailable to sell</small></span><b>{zeroStock.length}</b></button>
          <button onClick={() => onNavigate('inventory')}><span><strong>Reorder soon</strong><small>At or below the reorder point</small></span><b>{lowStock.length}</b></button>
          <button onClick={() => onNavigate('inventory')}><span><strong>Slow stock</strong><small>No recorded sale in 30 days</small></span><b>{slowStock.length}</b></button>
        </div>
        <button className="text-link stock-watch-link" onClick={() => onNavigate('inventory')}>Review inventory <ArrowRight size={13} /></button>
      </SectionCard>
    </div>
    <div className="content-grid content-grid-main">
      <SectionCard title="Recent sales" detail="The latest activity across your sales channels." action={<button className="text-link" onClick={() => onNavigate('sales')}>All sales <ArrowRight size={13} /></button>}>
        {recentInvoices.length ? <DataTable headers={['Sale', 'Customer', 'Date', 'Status', 'Total']}>
          {recentInvoices.map(invoice => <tr key={invoice.id} className="clickable-row" onClick={() => onSelectInvoice(invoice.id)}>
            <td><strong>{invoice.number}</strong><small className="cell-sub">{sourceLabel(invoice.source)}</small></td>
            <td>{invoice.customer}</td><td>{dateLabel(invoice.date)}</td>
            <td><StatusPill status={invoice.status}>{statusLabel(invoice.status)}</StatusPill></td>
            <td className="amount-cell">{money(invoice.total)}</td>
          </tr>)}
        </DataTable> : <EmptyState title="No sales yet" body="Record the first sale to start building your business record." action={<Button onClick={onCreateSale}>Record a sale</Button>} />}
      </SectionCard>
      <SectionCard title="Customer follow-up" detail="Sales where payment is still outstanding.">
        {unsettled.length ? <div className="followup-list">
          {unsettled.map(invoice => <button key={invoice.id} onClick={() => onSelectInvoice(invoice.id)}>
            <span><strong>{invoice.customer}</strong><small>{invoice.number} · Due {dateLabel(invoice.dueDate)}</small></span>
            <strong>{money(invoiceBalance(invoice))}</strong>
          </button>)}
        </div> : <EmptyState title="No balances to follow up" body="Unpaid and part-paid sales will appear here." />}
      </SectionCard>
    </div>
  </div>;
}

function SalesPage({ data, search, onSearch, onCreateSale, onSelectInvoice }: {
  data: AppData; search: string; onSearch: (value: string) => void; onCreateSale: () => void; onSelectInvoice: (id: string) => void;
}) {
  const [filter, setFilter] = useState('all');
  const list = data.invoices.filter(invoice => {
    const text = (invoice.number + ' ' + invoice.customer + ' ' + sourceLabel(invoice.source)).toLowerCase();
    const matchesSearch = text.includes(search.toLowerCase());
    const matchesFilter = filter === 'all' || invoice.status === filter;
    return matchesSearch && matchesFilter;
  }).sort((a, b) => b.date.localeCompare(a.date));
  const totalInvoiced = sum(data.invoices.map(invoice => invoice.total));
  const totalCollected = sum(data.invoices.map(invoice => invoice.paid));
  return <div className="page-stack">
    <PageHeader title="Sales & invoices" description="Keep every sale traceable, whether it starts at the counter, on your website or in Hesabu." actions={<Button onClick={onCreateSale}><Plus size={16} /> Record sale</Button>} />
    <div className="metric-grid metric-grid-four compact-metrics">
      <MetricCard label="Invoiced" value={money(totalInvoiced)} note="All recorded invoices" icon={Receipt} tone="blue" />
      <MetricCard label="Collected" value={money(totalCollected)} note="Payments confirmed" icon={CheckCircle2} tone="green" />
      <MetricCard label="Outstanding" value={money(totalInvoiced - totalCollected)} note="Customer balances" icon={Clock3} tone="amber" />
      <MetricCard label="Invoices" value={numberText(data.invoices.length)} note="Across all sales sources" icon={FileText} tone="slate" />
    </div>
    <SectionCard title="Invoice register" detail="Search by invoice number, customer or source.">
      <div className="table-toolbar">
        <div className="table-search"><Search size={15} /><input value={search} onChange={event => onSearch(event.target.value)} placeholder="Search invoices…" /></div>
        <div className="filter-control"><Filter size={14} /><select value={filter} onChange={event => setFilter(event.target.value)}>
          <option value="all">All statuses</option><option value="paid">Paid</option><option value="partial">Part paid</option><option value="sent">Awaiting payment</option>
        </select></div>
        <span className="table-count">{list.length} records</span>
      </div>
      {list.length ? <DataTable headers={['Invoice', 'Customer', 'Issue date', 'Source', 'Payment channel', 'Status', 'Total', 'Balance']}>
        {list.map(invoice => <tr key={invoice.id} className="clickable-row" onClick={() => onSelectInvoice(invoice.id)}>
          <td><strong>{invoice.number}</strong></td><td>{invoice.customer}<small className="cell-sub">{invoice.phone || 'No phone recorded'}</small></td>
          <td>{dateLabel(invoice.date)}</td><td>{sourceLabel(invoice.source)}</td><td><span className={channelClass(invoice.channel)}>{channelLabel(invoice.channel)}</span></td>
          <td><StatusPill status={invoice.status}>{statusLabel(invoice.status)}</StatusPill></td>
          <td className="amount-cell">{money(invoice.total)}</td><td className="amount-cell">{money(invoiceBalance(invoice))}</td>
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
      {!cloudMode && <Button variant="outline" onClick={onAddReceipt}><Plus size={15} /> Record receipt</Button>}
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
        {cloudMode
          ? <EmptyState title="Receipt matching is not connected" body="Hesabu can record payments against invoices. M-Pesa statement imports and automatic receipt matching are not enabled yet." />
          : unmatched.length ? <div className="attention-list">
            {unmatched.slice(0, 4).map(receipt => <button key={receipt.id} onClick={() => onMatchReceipt(receipt.id)}>
              <span><strong>{receipt.payer || 'Unidentified payer'}</strong><small>{receipt.rail} · {shortRef(receipt.reference)}</small></span>
              <strong>{money(receipt.amount)}</strong><span className="table-action">Match</span>
            </button>)}
          </div> : <EmptyState title="All receipts matched" body="New receipts that need a customer match will appear here." />}
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
  data.invoices.filter(invoice => invoice.date >= since).forEach(invoice => invoice.lines.forEach(line => {
    soldByProduct.set(line.productId, (soldByProduct.get(line.productId) ?? 0) + line.quantity);
  }));
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
    <PageHeader title="Inventory" description="Protect sales from stockouts and free cash trapped in products that are not moving." actions={<Button onClick={onAddProduct}><Plus size={15} /> Add product</Button>} />
    <div className="metric-grid metric-grid-four compact-metrics">
      <MetricCard label="Stock at cost" value={money(stockValue)} note="Current stock value" icon={Boxes} tone="slate" />
      <MetricCard label="Units sold · 30 days" value={numberText(unitsSold30)} note="Recorded product movement" icon={TrendingUp} tone="blue" />
      <MetricCard label="Need replenishment" value={numberText(low.length)} note={outOfStock + ' currently out of stock'} icon={AlertTriangle} tone="amber" />
      <MetricCard label="Slow stock value" value={money(slowStockValue)} note={slow.length + ' items with low movement'} icon={Package} tone="slate" />
    </div>
    <div className="content-grid content-grid-main stock-health-grid">
      <SectionCard title="Replenish before sales are lost" detail="Suggestions target around 14 days of demand plus the item’s reorder floor. Open purchase orders are deducted.">
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
    <div className="accounting-note"><ShieldCheck size={16} /><span>Journal entries in this preview demonstrate the accounting model. Before relying on these records, account mappings, tax treatment, inventory costing and period-close controls need formal validation by an accountant.</span></div>
  </div>;
}

function getDailyDigest(data: AppData) {
  const date = today();
  const sales = data.invoices.filter(invoice => invoice.date === date);
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
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 10) digits = '254' + digits.slice(1);
  else if ((digits.startsWith('7') || digits.startsWith('1')) && digits.length === 9) digits = '254' + digits;
  return digits.length >= 10 && digits.length <= 15 ? digits : '';
}

function openDailyDigestWhatsApp(data: AppData, destination: string, onMissing: () => void) {
  const number = normaliseWhatsAppNumber(destination);
  if (!number) { onMissing(); return; }
  const url = 'https://wa.me/' + number + '?text=' + encodeURIComponent(buildDailyDigestMessage(data));
  window.open(url, '_blank', 'noopener,noreferrer');
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
  const escapeXml = (value: string) => value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  const xml = '<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
    '<Styles><Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#172033" ss:Pattern="Solid"/></Style></Styles>' +
    sheets.map(sheet => '<Worksheet ss:Name="' + escapeXml(sheet.name) + '"><Table>' +
      sheet.rows.map((row,index) => '<Row>' + row.map(value => {
        const type = typeof value === 'number' ? 'Number' : 'String';
        const style = index === 0 ? ' ss:StyleID="Header"' : '';
        return '<Cell' + style + '><Data ss:Type="' + type + '">' + escapeXml(String(value ?? '')) + '</Data></Cell>';
      }).join('') + '</Row>').join('') + '</Table></Worksheet>').join('') + '</Workbook>';
  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'hesabu-daily-report-' + digest.date + '.xls';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ReportsPage({ data, metrics, whatsappNumber, onWhatsAppUnavailable }: { data: AppData; metrics: ReturnType<typeof getMetrics>; whatsappNumber: string; onWhatsAppUnavailable: () => void }) {
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const days = period === 'week' ? 7 : 30;
  const dayRows = Array.from({ length: days }, (_, index) => {
    const date = addDays(today(), index - (days - 1));
    const invoices = data.invoices.filter(invoice => invoice.date === date);
    return { date, sales: sum(invoices.map(invoice => invoice.total)), cost: sum(invoices.map(invoice => sum(invoice.lines.map(line => line.unitCost * line.quantity)))) };
  });
  const filteredInvoices = data.invoices.filter(invoice => invoice.date >= addDays(today(), -(days - 1)) && invoice.date <= today());
  const sales = sum(filteredInvoices.map(invoice => invoice.total));
  const averageDailySales = sales / days;
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
  const max = Math.max(1, ...dayRows.map(row => row.sales));
  return <div className="page-stack">
    <PageHeader title="Reports" description="A practical view of sales, margin, cash movement and inventory value." actions={<Button variant="outline" onClick={() => window.print()}><Download size={15} /> Print report</Button>} />
    <SectionCard title="Today's business digest" detail="Daily operations, with clear numbers and downloadable records." className="daily-digest-print">
      <div className="daily-digest-metrics">
        <div><span>Sales today</span><strong>{money(getDailyDigest(data).salesTotal)}</strong><small>{getDailyDigest(data).sales.length} sales recorded</small></div>
        <div><span>Payments received</span><strong>{money(getDailyDigest(data).receivedTotal)}</strong><small>Matched and unmatched receipts</small></div>
        <div><span>Expenses</span><strong>{money(getDailyDigest(data).expenseTotal)}</strong><small>Operating expenses recorded</small></div>
        <div><span>Gross profit</span><strong>{money(getDailyDigest(data).grossProfit)}</strong><small>After recorded product cost</small></div>
      </div>
      <div className="daily-digest-lower">
        <span>{money(getDailyDigest(data).supplierPaymentTotal)} supplier payments</span>
        <span>{numberText(getDailyDigest(data).unitsSold)} units sold</span>
        <span>{numberText(getDailyDigest(data).purchaseOrders.length)} supplier orders raised</span>
        <span>{numberText(getDailyDigest(data).inventoryActivity.length)} stock updates</span>
        <span>{numberText(getDailyDigest(data).lowStock.length)} products at reorder level</span>
      </div>
      <div className="daily-digest-actions">
        <Button variant="outline" onClick={() => downloadDailyWorkbook(data)}><FileSpreadsheet size={16} /> Download Excel workbook</Button>
        <Button variant="outline" onClick={() => window.print()}><FileText size={16} /> Save as PDF</Button>
        <Button onClick={() => openDailyDigestWhatsApp(data, whatsappNumber, onWhatsAppUnavailable)}><MessageCircle size={16} /> Prepare WhatsApp summary</Button>
      </div>
      <p className="daily-digest-note">The workbook is generated from the latest records in this browser. WhatsApp opens a prepared chat to your saved destination; review the message and send it in WhatsApp. Automatic delivery requires the WhatsApp Business API and a secure server connection.</p>
    </SectionCard>
    <div className="metric-grid metric-grid-six compact-metrics">
      <MetricCard label="Sales recorded" value={money(sales)} note={filteredInvoices.length + ' invoices · ' + days + ' days'} icon={TrendingUp} tone="green" />
      <MetricCard label="Average daily sales" value={money(averageDailySales)} note="Includes days with no sales" icon={BarChart3} tone="green" />
      <MetricCard label="Average sale" value={money(averageOrderValue)} note="Sales value per invoice" icon={Receipt} tone="blue" />
      <MetricCard label="Gross profit" value={money(grossProfitInPeriod)} note="After recorded item cost" icon={Activity} tone="blue" />
      <MetricCard label="Gross margin" value={(sales > 0 ? (grossProfitInPeriod / sales) * 100 : 0).toFixed(1) + '%'} note="Gross profit as share of sales" icon={TrendingUp} tone="slate" />
      <MetricCard label="Units sold" value={numberText(unitsSoldInPeriod)} note="Across the selected period" icon={Package} tone="amber" />
    </div>
    <SectionCard title="Trading performance" detail="Sales and cost of goods sold by day." action={<div className="segmented-control"><button className={period === 'week' ? 'active' : ''} onClick={() => setPeriod('week')}>7 days</button><button className={period === 'month' ? 'active' : ''} onClick={() => setPeriod('month')}>30 days</button></div>}>
      <div className="report-chart-legend"><span><i className="legend-dot legend-green" /> Sales</span><span><i className="legend-dot legend-blue" /> Cost of goods sold</span></div>
      <div className="report-bars">
        {dayRows.map(row => <div className="report-bar-column" key={row.date} title={dateLabel(row.date) + ': ' + money(row.sales)}>
          <div className="report-bar-space">
            <div className="report-bar report-bar-sales" style={{ height: Math.max(2, row.sales / max * 100) + '%' }} />
            <div className="report-bar report-bar-cost" style={{ height: Math.max(2, row.cost / max * 100) + '%' }} />
          </div>
          <span>{period === 'week' ? new Date(row.date + 'T12:00:00').toLocaleDateString('en-KE', { weekday: 'short' }) : String(new Date(row.date + 'T12:00:00').getDate())}</span>
        </div>)}
      </div>
    </SectionCard>
    <div className="content-grid content-grid-main">
      <SectionCard title="Product contribution" detail="Net sales, product cost and gross profit by item after allocating invoice discounts.">
        {productPerformance.length ? <DataTable headers={['Product', 'Units', 'Net sales', 'Item cost', 'Gross profit', 'Margin']}>
          {productPerformance.map(item => <tr key={item.product.id}>
            <td><strong>{item.product.name}</strong><small className="cell-sub">{item.product.sku}</small></td>
            <td>{numberText(item.unitsSold)}</td>
            <td className="amount-cell">{money(item.netSales)}</td>
            <td className="amount-cell">{money(item.itemCost)}</td>
            <td className="amount-cell">{money(item.grossProfit)}</td>
            <td>{item.marginRate.toFixed(1)}%</td>
          </tr>)}
        </DataTable> : <EmptyState title="No product sales in this period" body="Recorded sales will show which products contribute most to gross profit." />}
      </SectionCard>
      <SectionCard title="Working capital" detail="Short-term funds tied up in operations">
        <div className="working-capital-list">
          <div><span>Cash and bank balances</span><strong>{money(metrics.cashPosition)}</strong></div>
          <div><span>Customer receivables</span><strong>{money(metrics.receivables)}</strong></div>
          <div><span>Inventory at cost</span><strong>{money(metrics.inventoryValue)}</strong></div>
          <div><span>Supplier payables</span><strong className="negative-text">{money(metrics.payables)}</strong></div>
          <div className="working-capital-total"><span>Net operating working capital</span><strong>{money(metrics.cashPosition + metrics.receivables + metrics.inventoryValue - metrics.payables - metrics.customerAdvances)}</strong></div>
        </div>
      </SectionCard>
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

function SalesChannelsPage({ data, onCreateDemoOrder, cloudMode }: {
  data: AppData;
  onCreateDemoOrder: (input: { productId: string; quantity: number; customer: string; phone: string }) => void;
  cloudMode: boolean;
}) {
  return <div className="page-stack">
    <PageHeader title="Sales channels" description="Bring counter, online and wholesale orders into one business view." />
    <div className="sales-channel-grid">
      <div className="sales-channel-card sales-channel-card-active">
        <div className="sales-channel-kicker">IN STORE</div><h3>Counter sales</h3>
        <p>Record walk-in sales using the same product catalogue and stock quantities.</p><span>Available in Sales</span>
      </div>
      <div className="sales-channel-card sales-channel-card-featured">
        <div className="sales-channel-kicker">ONLINE</div><h3>Website orders</h3>
        <p>Capture customer orders from an existing website without a separate stock list.</p><span>Try the sample checkout</span>
      </div>
      <div className="sales-channel-card">
        <div className="sales-channel-kicker">WHOLESALE</div><h3>Bulk & repeat orders</h3>
        <p>Record phone, repeat and bulk orders against the same inventory and customer balances.</p><span>Available in Sales</span>
      </div>
    </div>
    {cloudMode
      ? <SectionCard title="Website order connection" detail="Online checkout is not accepting customer orders yet.">
          <EmptyState title="No website is connected" body="The sample checkout is not connected to a real storefront. Connect a secure order webhook before accepting online orders here." />
        </SectionCard>
      : <SectionCard title="Sample online order" detail="Place an order and see it appear with the rest of your sales.">
          <EmbeddedCheckoutDemo profile={data.profile} products={data.products} onCreateOrder={onCreateDemoOrder} />
        </SectionCard>}
    <div className="sales-channel-note">One product catalogue. One view of sales. One view of available stock.</div>
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

function SettingsPage({ profile, teamMembers, onSave, onAddMember, onUpdateMember, onReset, theme, onThemeChange, onOpenReports, whatsappNumber, onWhatsAppNumberChange, onSaveWhatsApp, cloudMode, onSignOut }: {
  profile: BusinessProfile; teamMembers: TeamMember[];
  onSave: (profile: BusinessProfile) => void;
  onAddMember: (input: { name: string; email: string; role: TeamRole }) => void;
  onUpdateMember: (id: string, patch: Partial<TeamMember>) => void;
  onReset: () => void; theme: 'dark' | 'light'; onThemeChange: (theme: 'dark' | 'light') => void; onOpenReports: () => void;
  whatsappNumber: string; onWhatsAppNumberChange: (value: string) => void;
  onSaveWhatsApp: () => void; cloudMode: boolean; onSignOut: () => void;
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
  const submitMember = (event: FormEvent) => {
    event.preventDefault();
    if (!memberName.trim() || !memberEmail.trim()) return;
    onAddMember({ name: memberName.trim(), email: memberEmail.trim(), role: memberRole });
    setMemberName(''); setMemberEmail(''); setMemberRole('Sales'); setShowAdd(false);
  };
  return <div className="page-stack">
    <PageHeader title="Team & settings" description="Manage your business details and the people responsible for daily operations." />
    <SectionCard title="Business administration" detail="Business identity and team responsibilities.">
      <div className="section-tabs">
        <button className={tab === 'profile' ? 'active' : ''} onClick={() => setTab('profile')}>Business profile</button>
        {!cloudMode && <button className={tab === 'team' ? 'active' : ''} onClick={() => setTab('team')}>Team <span>{teamMembers.length}</span></button>}
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
          <div><strong>{teamMembers.filter(member => member.status === 'active').length} people in this workspace</strong><p>Assign each team member only the responsibility they need.</p></div>
          <Button onClick={() => setShowAdd(value => !value)}><Plus size={15} /> Add member</Button>
        </div>
        {showAdd && <form className="team-invite-form" onSubmit={submitMember}>
          <div className="form-grid form-grid-two">
            <Field label="Full name" value={memberName} onChange={setMemberName} required placeholder="Team member name" />
            <Field label="Email address" value={memberEmail} onChange={setMemberEmail} required placeholder="name@business.com" />
          </div>
          <div className="form-grid form-grid-two">
            <SelectField label="Responsibility" value={memberRole} onChange={value => setMemberRole(value as TeamRole)} options={[
              { value: 'Manager', label: 'Manager' }, { value: 'Sales', label: 'Sales' },
              { value: 'Inventory', label: 'Inventory' }, { value: 'Finance', label: 'Finance' },
            ]} />
            <div className="team-role-description"><strong>{memberRole}</strong><span>{roleDescriptions[memberRole]}</span></div>
          </div>
          <div className="inline-form-actions"><Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button><Button type="submit" disabled={!memberName.trim() || !memberEmail.trim()}>Add to team</Button></div>
        </form>}
        <div className="team-role-grid">
          {(Object.keys(roleDescriptions) as TeamRole[]).filter(role => role !== 'Owner').map(role => <div key={role}><strong>{role}</strong><span>{roleDescriptions[role]}</span></div>)}
        </div>
        <DataTable headers={['Team member', 'Responsibility', 'Status', '']}>
          {teamMembers.map(member => <tr key={member.id}>
            <td><strong>{member.name}</strong><small className="cell-sub">{member.email}</small></td>
            <td>{member.role}</td>
            <td><StatusPill status={member.status === 'active' ? 'delivered' : 'draft'}>{member.status === 'active' ? 'Active' : 'Suspended'}</StatusPill></td>
            <td>{member.role === 'Owner' ? <span className="muted-copy">Owner</span> : <button className="table-action" onClick={() => onUpdateMember(member.id, { status: member.status === 'active' ? 'suspended' : 'active' })}>{member.status === 'active' ? 'Suspend' : 'Activate'}</button>}</td>
          </tr>)}
        </DataTable>
      </> : <div className="settings-preferences">
        <section className="preference-block">
          <div><strong>Appearance</strong><p>White is the default. Choose dark mode if you prefer a darker workspace.</p></div>
          <div className="theme-choice-group">
            <button type="button" className={theme === 'dark' ? 'theme-choice theme-choice-active' : 'theme-choice'} onClick={() => onThemeChange('dark')}><Moon size={19} /><span><strong>Dark</strong><small>Dark workspace</small></span></button>
            <button type="button" className={theme === 'light' ? 'theme-choice theme-choice-active' : 'theme-choice'} onClick={() => onThemeChange('light')}><Sun size={19} /><span><strong>Light</strong><small>Default</small></span></button>
          </div>
        </section>
        <section className="preference-block">
          <div><strong>WhatsApp daily digest</strong><p>Choose the number that should receive the prepared daily summary. Hesabu opens the chat for you to review and send.</p></div>
          <Field label="WhatsApp destination" value={whatsappNumber} onChange={onWhatsAppNumberChange} placeholder="2547XXXXXXXX" hint="Use country code, e.g. 254712345678. You can also enter a Kenyan number beginning with 07 or 01." />
          <div className="whatsapp-connection-note"><MessageCircle size={16} /><span>{cloudMode
            ? 'Hesabu prepares the summary from saved business records and opens WhatsApp for you to review and send. Automatic scheduled delivery is not connected.'
            : 'Click-to-chat is available in this preview. Automatic scheduled messages and attachments need the WhatsApp Business API connected on a secure server.'}</span></div>
          <div className="inline-form-actions">
            {cloudMode && <Button variant="outline" onClick={onSaveWhatsApp}>Save destination</Button>}
            <Button variant="outline" onClick={onOpenReports}>Open daily digest</Button>
          </div>
        </section>
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
  const monthInvoices = data.invoices.filter(invoice => invoice.date.slice(0, 7) === currentMonth);
  const salesToday = sum(data.invoices.filter(invoice => invoice.date === today()).map(invoice => invoice.total));
  const collectedToday = sum(data.payments.filter(payment =>
    payment.status === 'succeeded' && dateKey(new Date(payment.createdAt)) === today(),
  ).map(payment => payment.amount));
  const totalRevenue = sum(data.invoices.map(invoice => invoice.total));
  const grossProfitMonth = sum(monthInvoices.map(marginValue));
  const receivables = sum(data.invoices.map(invoiceBalance));
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
  const costOfGoodsSold = sum(data.invoices.map(invoice => sum(invoice.lines.map(line => line.unitCost * line.quantity))));
  return {
    salesToday, collectedToday, grossProfitMonth, cashPosition, receivables, payables, customerAdvances,
    inventoryValue, expenses: totalExpenses, totalRevenue, costOfGoodsSold,
    channelBalances, unpaidInvoices: data.invoices.filter(invoice => invoiceBalance(invoice) > 0).length,
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

function App() {
  const [data, setData] = useState<AppData>(() => readWorkspace());
  const [cloudAccount, setCloudAccount] = useState<{
    user: SupabaseUser;
    business: { id: string; name: string; industry: string | null };
  } | null>(null);
  const [cloudRestoring, setCloudRestoring] = useState(true);
  const [cloudWorkspaceReady, setCloudWorkspaceReady] = useState(false);
  const [cloudWorkspaceLoading, setCloudWorkspaceLoading] = useState(false);
  const [cloudWorkspaceError, setCloudWorkspaceError] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [showAuthScreen, setShowAuthScreen] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState<'signin' | 'signup'>('signin');
  const [previewAccess, setPreviewAccess] = useState(false);
  const [whatsappNumber, setWhatsAppNumber] = useState(() => {
    try { return localStorage.getItem('hesabu:whatsapp-number:v1') || ''; }
    catch { return ''; }
  });
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try { return localStorage.getItem('hesabu:theme:v2') === 'dark' ? 'dark' : 'light'; }
    catch { return 'light'; }
  });
  const [activeMemberId, setActiveMemberId] = useState('');
  const [userSwitcherOpen, setUserSwitcherOpen] = useState(false);
  const [active, setActive] = useState<ModuleKey>('overview');
  const [dialog, setDialog] = useState<DialogState>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<Notice>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const restore = async () => {
      const result = await restoreCloudSession();
      if (!active || !result) return;
      let membership = result.memberships.find(item => item.businesses?.id);
      if (!membership?.businesses) {
        const pending = readPendingOnboarding(result.user.email, result.user.user_metadata);
        if (pending) {
          const businessId = await createBusiness(pending);
          await saveBusinessPreferences({
            businessId,
            aiAssistantEnabled: pending.aiAssistantEnabled,
            whatsappDigestEnabled: pending.whatsappDigestEnabled,
            whatsappRecipientPhone: pending.whatsappRecipientPhone,
          });
          clearPendingOnboarding();
          setWhatsAppNumber(pending.whatsappRecipientPhone);
          setCloudAccount({
            user: result.user,
            business: { id: businessId, name: pending.businessName, industry: pending.industry || null },
          });
          setPreviewAccess(false);
          try { localStorage.removeItem('hesabu:preview-access:v1'); } catch { /* Session remains valid. */ }
          return;
        }
        setAuthNotice('Your account is signed in, but no business workspace has been set up for it yet. Complete the business setup on this device or contact the workspace owner.');
        return;
      }
      setCloudAccount({
        user: result.user,
        business: {
          id: membership.businesses.id,
          name: membership.businesses.name,
          industry: membership.businesses.industry,
        },
      });
      setPreviewAccess(false);
      try { localStorage.removeItem('hesabu:preview-access:v1'); } catch { /* Session remains valid. */ }
    };
    restore()
      .catch(error => {
        if (active) setAuthNotice(error instanceof Error ? error.message : 'The saved cloud session could not be restored.');
      })
      .finally(() => { if (active) setCloudRestoring(false); });
    return () => { active = false; };
  }, []);

  const reloadCloudWorkspace = async (): Promise<boolean> => {
    if (!cloudAccount) return false;
    setCloudWorkspaceLoading(true);
    setCloudWorkspaceError('');
    try {
      const [workspace, settings] = await Promise.all([
        getCloudWorkspace(cloudAccount.business.id, cloudAccount.user),
        getBusinessSettings(cloudAccount.business.id),
      ]);
      setData(workspace);
      setWhatsAppNumber(settings.whatsapp_recipient_phone || '');
      const currentMember = workspace.teamMembers.find(member => member.id === cloudAccount.user.id);
      setActiveMemberId(currentMember?.id || cloudAccount.user.id);
      setCloudWorkspaceReady(true);
      return true;
    } catch (error) {
      setCloudWorkspaceError(error instanceof Error ? error.message : 'The business workspace could not be loaded.');
      setCloudWorkspaceReady(false);
      return false;
    } finally {
      setCloudWorkspaceLoading(false);
    }
  };

  useEffect(() => {
    if (!cloudAccount) return;
    setCloudWorkspaceReady(false);
    void reloadCloudWorkspace();
    // The business ID changes only when a user enters a different cloud workspace.
  }, [cloudAccount?.business.id]);

  const handleCloudSignIn = async (email: string, password: string) => {
    const session = await signInWithPassword(email, password);
    let memberships = await listMyBusinesses();
    let membership = memberships.find(item => item.businesses?.id);
    if (!membership?.businesses) {
      const pending = readPendingOnboarding(session.user.email || email, session.user.user_metadata);
      if (!pending) {
        throw new Error('Your sign-in was accepted, but this account has no business workspace yet. Complete business setup on the device where you created the account.');
      }
      const businessId = await createBusiness(pending);
      await saveBusinessPreferences({
        businessId,
        aiAssistantEnabled: pending.aiAssistantEnabled,
        whatsappDigestEnabled: pending.whatsappDigestEnabled,
        whatsappRecipientPhone: pending.whatsappRecipientPhone,
      });
      clearPendingOnboarding();
      setWhatsAppNumber(pending.whatsappRecipientPhone);
      setCloudAccount({
        user: session.user,
        business: { id: businessId, name: pending.businessName, industry: pending.industry || null },
      });
    } else {
      setCloudAccount({
        user: session.user,
        business: {
          id: membership.businesses.id,
          name: membership.businesses.name,
          industry: membership.businesses.industry,
        },
      });
    }
    setAuthNotice('');
    setShowAuthScreen(false);
    setPreviewAccess(false);
    try { localStorage.removeItem('hesabu:preview-access:v1'); } catch { /* Session remains valid. */ }
  };

  const handleCloudSignUp = async (input: SignUpInput): Promise<'confirm_email' | void> => {
    savePendingOnboarding(input);
    const result = await signUpWithPassword(input);
    if (!result.session) return 'confirm_email';
    const businessId = await createBusiness(input);
    await saveBusinessPreferences({
      businessId,
      aiAssistantEnabled: input.aiAssistantEnabled,
      whatsappDigestEnabled: input.whatsappDigestEnabled,
      whatsappRecipientPhone: input.whatsappRecipientPhone,
    });
    clearPendingOnboarding();
    setCloudAccount({
      user: result.session.user,
      business: { id: businessId, name: input.businessName.trim(), industry: input.industry || null },
    });
    setWhatsAppNumber(input.whatsappRecipientPhone);
    setAuthNotice('');
    setShowAuthScreen(false);
    setPreviewAccess(false);
    try { localStorage.removeItem('hesabu:preview-access:v1'); } catch { /* Session remains valid. */ }
  };

  const handleCloudSignOut = async () => {
    await signOut();
    setCloudAccount(null);
    setCloudWorkspaceReady(false);
    setCloudWorkspaceError('');
    setAuthNotice('');
    setShowAuthScreen(false);
    setPreviewAccess(false);
    try { localStorage.removeItem('hesabu:preview-access:v1'); } catch { /* Keep the screen transition available. */ }
  };

  useEffect(() => {
    if (!cloudAccount && previewAccess) saveWorkspace(data);
  }, [data, cloudAccount, previewAccess]);
  useEffect(() => {
    if (cloudAccount) return;
    try {
      if (whatsappNumber.trim()) localStorage.setItem('hesabu:whatsapp-number:v1', whatsappNumber.trim());
      else localStorage.removeItem('hesabu:whatsapp-number:v1');
    } catch { /* WhatsApp preference remains available for this session. */ }
  }, [whatsappNumber, cloudAccount]);
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
  const runCloudMutation = async (
    operation: () => Promise<unknown>,
    successTitle: string,
    successDetail: string,
  ) => {
    try {
      await operation();
      const refreshed = await reloadCloudWorkspace();
      setDialog(null);
      notify(successTitle, refreshed
        ? successDetail
        : 'The record was submitted, but the latest workspace data could not be reloaded. Refresh the page to verify it.');
    } catch (error) {
      notify('Could not save this record', error instanceof Error ? error.message : 'The cloud operation failed. No success was reported.');
    }
  };
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
    if (cloudAccount) {
      const saleTotal = Math.max(0, sum(input.items.map(item => {
        const product = data.products.find(candidate => candidate.id === item.productId);
        return product ? product.sellingPrice * item.quantity : 0;
      })) - input.discount);
      void runCloudMutation(async () => {
        const invoiceId = await postCloudSale(cloudAccount.business.id, {
          customer: input.customer,
          phone: input.phone,
          dueDate: input.dueDate,
          discount: input.discount,
          channel: input.channel,
          source: input.source,
          items: input.items,
        });
        if (input.channel !== 'credit' && saleTotal > 0) {
          await postCloudPayment(cloudAccount.business.id, {
            invoiceId,
            amount: saleTotal,
            channel: input.channel,
            phone: input.phone,
            reference: '',
            idempotencyKey: 'sale-payment:' + invoiceId,
            note: 'Collected at point of sale',
          });
        }
      }, 'Sale recorded', input.channel === 'credit'
        ? 'The invoice, stock movement and accounting entries are saved to your business.'
        : 'The sale, payment, stock movement and accounting entries are saved to your business.');
      return;
    }
    const requestedQuantities = new Map<string, number>();
    for (const item of input.items) {
      requestedQuantities.set(item.productId, (requestedQuantities.get(item.productId) ?? 0) + item.quantity);
    }
    for (const [productId, requested] of requestedQuantities) {
      const product = data.products.find(candidate => candidate.id === productId);
      if (!product || requested > product.quantity) {
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
    const paid = input.channel === 'credit' ? 0 : total;
    const invoice: Invoice = {
      id: invoiceId, number, customer: input.customer, phone: input.phone,
      date: today(), dueDate: input.dueDate, lines, subtotal, discount: input.discount,
      total, paid, channel: input.channel,
      status: paid >= total ? 'paid' : paid > 0 ? 'partial' : 'sent',
      source: input.source,
    };
    let next: AppData = {
      ...data,
      nextInvoice: data.nextInvoice + 1,
      invoices: [invoice, ...data.invoices],
      products: data.products.map(product => {
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
    } else {
      next = {
        ...next,
        journal: recordJournal(next, 'Accounts receivable', 'Sales revenue', total, 'Credit sale · ' + number, number),
        events: [{
          id: makeId('EVT'), time: new Date().toISOString(), type: 'invoice.created',
          source: sourceLabel(input.source), status: 'delivered', reference: number,
          detail: 'Credit invoice posted to accounts receivable',
        }, ...next.events],
      };
    }
    next = {
      ...next,
      journal: recordJournal(next, 'Cost of goods sold', 'Inventory', sum(lines.map(line => line.unitCost * line.quantity)), 'Cost of sale · ' + number, number),
    };
    setData(next);
    setDialog(null);
    notify('Sale posted', number + ' has been recorded and inventory has been updated.');
    return invoiceId;
  };


  const createWebsiteOrder = (input: { productId: string; quantity: number; customer: string; phone: string }) => {
    const invoiceId = createInvoice({
      customer: input.customer,
      phone: input.phone,
      dueDate: addDays(today(), 7),
      discount: 0,
      channel: 'credit',
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
        idempotencyKey: 'manual-payment:' + makeId('IDEM'),
        note: 'Manually recorded payment received',
      }), 'Payment recorded', 'The payment, invoice balance and ledger entries are saved to your business.');
      return;
    }
    const invoice = data.invoices.find(item => item.id === input.invoiceId);
    if (!invoice) return;
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
      notify('Receipt import is not connected', 'Record a payment directly against its customer invoice. M-Pesa statement imports and matching are not enabled yet.');
      setDialog(null);
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
      notify('Receipt matching is not connected', 'Record payments against their invoice until statement imports and reconciliation are enabled.');
      setDialog(null);
      return;
    }
    const receipt = data.unmatchedReceipts.find(item => item.id === receiptId);
    const invoice = data.invoices.find(item => item.id === invoiceId);
    if (!receipt || !invoice || receipt.amount <= 0 || invoiceBalance(invoice) <= 0) return;
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
    if (cloudAccount) {
      const sku = input.sku.trim().toUpperCase() || makeId('SKU');
      void runCloudMutation(() => createCloudProduct(cloudAccount.business.id, {
        sku, name: input.name, category: input.category, unit: input.unit,
        quantity: input.quantity, reorderLevel: input.reorderLevel,
        costPrice: input.costPrice, sellingPrice: input.sellingPrice,
        supplierId: input.supplierId,
      }), 'Product added', 'The product and opening stock valuation are saved to your business.');
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
    setDialog(null);
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
    if (cloudAccount) {
      void runCloudMutation(() => createCloudSupplier(cloudAccount.business.id, input),
        'Supplier added', 'The supplier has been saved to your business records.');
      return;
    }
    const supplier: Supplier = {
      id: makeId('SUP'), name: input.name, phone: input.phone,
      email: input.email, terms: input.terms, balance: 0,
    };
    setData(current => ({ ...current, suppliers: [...current.suppliers, supplier] }));
    setDialog(null);
    notify('Supplier added', input.name + ' has been added to the supplier register.');
  };

  const saveWhatsAppDestination = () => {
    if (cloudAccount) {
      void runCloudMutation(() => saveCloudWhatsAppDestination(cloudAccount.business.id, whatsappNumber),
        'WhatsApp destination saved', 'The number is saved. Daily summaries still open in WhatsApp for you to review and send.');
      return;
    }
    notify('WhatsApp destination saved', 'The destination is saved in this preview on this device.');
  };


  const addTeamMember = (input: { name: string; email: string; role: TeamRole }) => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
      notify('Enter a valid email address'); return;
    }
    if (data.teamMembers.some(member => member.email.toLowerCase() === input.email.toLowerCase())) {
      notify('This email is already on the team'); return;
    }
    const member: TeamMember = { id: makeId('TEAM'), ...input, status: 'active' };
    setData(current => ({ ...current, teamMembers: [...current.teamMembers, member] }));
    notify('Team member added', input.name + ' has been added to this workspace.');
  };

  const updateTeamMember = (id: string, patch: Partial<TeamMember>) => {
    setData(current => ({
      ...current,
      teamMembers: current.teamMembers.map(member => member.id === id && member.role !== 'Owner' ? { ...member, ...patch } : member),
    }));
  };

  const resetDemo = () => {
    if (cloudAccount) {
      notify('Cloud records are protected', 'Sample data reset is not available in a real business workspace.');
      return;
    }
    if (!window.confirm('Reset this browser to the original Hesabu demo workspace? Current local demo changes will be lost.')) return;
    const fresh = makeDemoData();
    setData(fresh);
    setDialog(null);
    notify('Demo workspace reset', 'The original sample records have been restored.');
  };

  const activeMeta = moduleMeta[active];
  const enterPreview = () => {
    setData(readWorkspace());
    setActiveMemberId('team-001');
    setPreviewAccess(true);
  };
  const exitPreview = () => {
    setUserSwitcherOpen(false);
    setPreviewAccess(false);
  };
  const requestWhatsAppDestination = () => {
    navigate('settings');
    notify('Add a WhatsApp destination', 'Enter your business WhatsApp number in Settings before preparing the daily summary.');
  };
  if (cloudRestoring) return <main className="auth-page"><section className="cloud-account-card cloud-loading-card"><span className="brand-mark"><HesabuMark /></span><h1>Hesabu</h1><p>Checking your secure business session…</p></section></main>;
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
  if (!previewAccess && !showAuthScreen && !cloudAccount) return <PublicLandingPage
    onSignIn={() => { setAuthInitialMode('signin'); setShowAuthScreen(true); }}
    onCreateAccount={() => { setAuthInitialMode('signup'); setShowAuthScreen(true); }}
    onPreview={enterPreview}
  />;
  if (!previewAccess && !cloudAccount) return <AuthPage
    onPreview={enterPreview}
    onSignIn={handleCloudSignIn}
    onSignUp={handleCloudSignUp}
    initialMessage={authNotice}
    initialMode={authInitialMode}
    onBack={() => setShowAuthScreen(false)}
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
          <Initials name={activeMember?.name || data.profile.name} /><span><strong>{activeMember?.name || data.profile.name}</strong><small>{activeMember?.role || 'Owner'} · role preview</small></span><MoreHorizontal size={17} />
        </div>
      </div>}
    </aside>

    {mobileMenuOpen && <button className="mobile-menu-scrim" aria-label="Close navigation" onClick={() => setMobileMenuOpen(false)} />}
    <main className="main-shell">
      <header className="topbar">
        <div className="topbar-left">
          <div className="topbar-brand-lockup"><span className="brand-mark topbar-brand-mark"><HesabuMark /></span><span>hesabu<span>.</span><small>BUSINESS</small></span></div>
          <IconButton label="Open navigation" className="mobile-menu-button" onClick={() => setMobileMenuOpen(value => !value)}><Menu size={19} /></IconButton>
          <div className="breadcrumb"><ChevronRight size={13} /><strong>{activeMeta.title}</strong></div>
        </div>
        <div className="topbar-right">
          <div className={'global-search ' + (searchOpen ? 'global-search-open' : '')}><Search size={15} /><input value={search} onFocus={() => setSearchOpen(true)} onBlur={() => setTimeout(() => setSearchOpen(false), 150)} onChange={event => setSearch(event.target.value)} placeholder="Search this register…" /></div>
          <span className="topbar-divider" />
          <button className="topbar-date" onClick={() => notify('Workspace date', dateLabel(today()))}><CalendarDays size={15} /> <span>{dateLabel(today())}</span></button>
          <button className="notification-button" onClick={() => notify('Operational attention', data.products.filter(product => product.quantity <= product.reorderLevel).length + ' stock items are at or below reorder level.')}><Bell size={17} /><i /></button>
          {previewAccess
            ? <button className="topbar-avatar" aria-label="Switch role preview" aria-expanded={userSwitcherOpen} onClick={() => setUserSwitcherOpen(value => !value)}><Initials name={activeMember?.name || data.profile.name} /></button>
            : <span className="topbar-avatar" aria-label="Signed-in user"><Initials name={activeMember?.name || data.profile.name} /></span>}
          {previewAccess && userSwitcherOpen && <div className="user-switcher-panel"><div className="user-switcher-heading"><strong>Preview workspace as</strong><small>Switch between the owner and staff views.</small></div>{data.teamMembers.filter(member => member.status === 'active').map(member => <button key={member.id} className={member.id === activeMember?.id ? 'user-switcher-active' : ''} onClick={() => { setActiveMemberId(member.id); setUserSwitcherOpen(false); setActive('overview'); setDialog(null); setSelectedInvoiceId(null); setSearch(''); }}><Initials name={member.name} /><span><strong>{member.name}</strong><small>{member.role}</small></span>{member.id === activeMember?.id && <span className="user-switcher-current">Current</span>}</button>)}<button type="button" className="user-switcher-logout" onClick={exitPreview}><LogOut size={15} /> Exit preview workspace</button></div>}
        </div>
      </header>

      <div className="page-container">
        {active === 'overview' && <OverviewPage data={data} metrics={metrics} onCreateSale={() => setDialog({ kind: 'sale' })} onNavigate={navigate} onSelectInvoice={setSelectedInvoiceId} onRecordExpense={() => setDialog({ kind: 'expense' })} onRecordPayment={() => setDialog({ kind: 'stk' })} onCreatePurchase={() => setDialog({ kind: 'purchase' })} onQuickStock={() => setDialog({ kind: 'stock-picker' })} />}
        {active === 'sales' && <SalesPage data={data} search={search} onSearch={setSearch} onCreateSale={() => setDialog({ kind: 'sale' })} onSelectInvoice={setSelectedInvoiceId} />}
        {active === 'payments' && <PaymentsPage data={data} metrics={metrics} search={search} onSearch={setSearch} onRequestPayment={() => setDialog({ kind: 'stk' })} onResolvePayment={resolvePayment} onAddReceipt={() => setDialog({ kind: 'receipt' })} onMatchReceipt={receiptId => setDialog({ kind: 'match-receipt', receiptId })} cloudMode={Boolean(cloudAccount)} />}
        {active === 'inventory' && <InventoryPage data={data} search={search} onSearch={setSearch} onAddProduct={() => setDialog({ kind: 'product' })} onAdjust={productId => setDialog({ kind: 'adjust', productId })} onOrder={(productId, quantity) => setDialog({ kind: 'purchase', productId, quantity })} />}
        {active === 'procurement' && <ProcurementPage data={data} onCreatePurchase={() => setDialog({ kind: 'purchase' })} onReceiveOrder={orderId => setDialog({ kind: 'receive-purchase', purchaseOrderId: orderId })} onPaySupplier={supplierId => setDialog({ kind: 'supplier-payment', supplierId })} onAddSupplier={() => setDialog({ kind: 'supplier' })} />}
        {active === 'accounts' && <AccountsPage data={data} metrics={metrics} />}
        {active === 'reports' && <ReportsPage data={data} metrics={metrics} whatsappNumber={whatsappNumber} onWhatsAppUnavailable={requestWhatsAppDestination} />}
        {active === 'integrations' && <SalesChannelsPage data={data} onCreateDemoOrder={createWebsiteOrder} cloudMode={Boolean(cloudAccount)} />}
        {active === 'settings' && <SettingsPage profile={data.profile} teamMembers={data.teamMembers} onSave={saveProfile} onAddMember={addTeamMember} onUpdateMember={updateTeamMember} onReset={resetDemo} theme={theme} onThemeChange={setTheme} onOpenReports={() => navigate('reports')} whatsappNumber={whatsappNumber} onWhatsAppNumberChange={setWhatsAppNumber} onSaveWhatsApp={saveWhatsAppDestination} cloudMode={Boolean(cloudAccount)} onSignOut={() => { void handleCloudSignOut(); }} />}
        {active === 'more' && <MorePage allowedModules={allowedModules} onNavigate={navigate} />}
      </div>
      <footer className="app-footer"><span>Hesabu · Business in balance</span><span><i /> {cloudAccount ? 'Secure cloud workspace · Synced with Hesabu' : 'Sample workspace · Saved in this browser'}</span></footer>
    </main>

    <nav className="mobile-bottom-nav">
      {[
        { id: 'overview' as ModuleKey, label: 'Home', icon: LayoutDashboard },
        { id: 'sales' as ModuleKey, label: 'Sales', icon: Receipt },
        { id: 'payments' as ModuleKey, label: 'Money', icon: Wallet },
        { id: 'inventory' as ModuleKey, label: 'Stock', icon: Package },
        { id: 'more' as ModuleKey, label: 'More', icon: MoreHorizontal },
      ].filter(item => allowedModules.includes(item.id)).map(item => {
        const Icon = item.icon;
        return <button key={item.id} className={active === item.id ? 'active' : ''} onClick={() => navigate(item.id)}><Icon size={18} /><span>{item.label}</span></button>;
      })}
    </nav>

    <FloatingAssistant
      data={data}
      cloudMode={Boolean(cloudAccount)}
      whatsappNumber={whatsappNumber}
      onWhatsAppNumberChange={setWhatsAppNumber}
      onRecordSale={() => setDialog({ kind: 'sale' })}
      onRecordExpense={() => setDialog({ kind: 'expense' })}
      onUpdateStock={() => setDialog({ kind: 'stock-picker' })}
    />

    {dialog?.kind === 'sale' && <SaleDialog products={data.products} onClose={() => setDialog(null)} onCreate={createInvoice} cloudMode={Boolean(cloudAccount)} />}
    {dialog?.kind === 'stk' && <StkDialog invoices={data.invoices} initialInvoiceId={dialog.invoiceId} onClose={() => setDialog(null)} onCreate={createPaymentRequest} cloudMode={Boolean(cloudAccount)} />}
    {dialog?.kind === 'receipt' && <ReceiptDialog onClose={() => setDialog(null)} onCreate={addUnmatchedReceipt} />}
    {dialog?.kind === 'match-receipt' && selectedReceipt && <MatchReceiptDialog receipt={selectedReceipt} invoices={data.invoices} onClose={() => setDialog(null)} onMatch={invoiceId => matchUnmatchedReceipt(selectedReceipt.id, invoiceId)} />}
    {dialog?.kind === 'expense' && <ExpenseDialog onClose={() => setDialog(null)} onCreate={createExpense} />}
    {dialog?.kind === 'product' && <ProductDialog onClose={() => setDialog(null)} onCreate={createProduct} />}
    {dialog?.kind === 'supplier' && <SupplierDialog onClose={() => setDialog(null)} onCreate={addSupplier} />}
    {dialog?.kind === 'purchase' && <PurchaseDialog suppliers={data.suppliers} products={data.products} initialProductId={dialog.productId} initialQuantity={dialog.quantity} onClose={() => setDialog(null)} onCreate={createPurchaseOrder} />}
    {dialog?.kind === 'receive-purchase' && selectedPurchaseOrder && <ReceivePurchaseDialog order={selectedPurchaseOrder} onClose={() => setDialog(null)} onReceive={items => receivePurchaseOrder(selectedPurchaseOrder.id, items)} />}
    {dialog?.kind === 'supplier-payment' && selectedSupplier && <SupplierPaymentDialog supplier={selectedSupplier} onClose={() => setDialog(null)} onPay={(amount, channel) => paySupplier(selectedSupplier.id, amount, channel)} />}
    {dialog?.kind === 'stock-picker' && <StockPickerDialog products={data.products} onClose={() => setDialog(null)} onAdjust={adjustStock} />}
    {dialog?.kind === 'adjust' && selectedProduct && <AdjustStockDialog product={selectedProduct} onClose={() => setDialog(null)} onAdjust={(quantity, reason) => adjustStock(selectedProduct.id, quantity, reason)} />}
    {selectedInvoice && <InvoiceDialog invoice={selectedInvoice} onClose={() => setSelectedInvoiceId(null)} onRequestPayment={() => {
      setSelectedInvoiceId(null);
      setDialog({ kind: 'stk', invoiceId: selectedInvoice.id });
    }} />}
    {notice && <div className="toast" role="status"><CheckCircle2 size={17} /><span><strong>{notice.title}</strong>{notice.detail && <small>{notice.detail}</small>}</span><button onClick={closeNotice} aria-label="Dismiss notification"><X size={15} /></button></div>}
  </div>;
}

export default App;
