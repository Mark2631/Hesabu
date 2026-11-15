import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  Activity, AlertTriangle, ArrowDownLeft, ArrowRight, ArrowUpRight, BarChart3, BookOpen,
  Bell, Boxes, Building2, CalendarDays, Check, CheckCircle2, ChevronDown,
  ChevronRight, CircleDollarSign, Clock3, Code2, Copy, CreditCard, Download,
  FileCheck2, FileText, Filter, Globe2, LayoutDashboard, Link2,
  Menu, MoreHorizontal, Package, PanelLeftClose, Plus, Receipt, RefreshCw,
  Search, Send, Settings, ShieldCheck, ShoppingCart, Smartphone,
  Store, TrendingDown, TrendingUp, Truck, Wallet, X,
  type LucideIcon,
} from 'lucide-react';
import { allocateIncomingPayment, buildJournalPair, isJournalBalanced, outstandingBalance, weightedAverageUnitCost } from './finance';
import { makeDemoData, readWorkspace, saveWorkspace } from './data';
import type {
  AppData, BusinessProfile, Invoice, InvoiceStatus, ModuleKey, NewInvoiceInput,
  NewPaymentInput, NewPurchaseInput, NewUnmatchedReceiptInput, Payment, PaymentChannel, Product,
  PurchaseOrder, ReceiptRail, Supplier, UnmatchedReceipt,
} from './types';

type Notice = { title: string; detail?: string } | null;
type DialogState =
  | { kind: 'sale' }
  | { kind: 'stk'; invoiceId?: string }
  | { kind: 'receipt' }
  | { kind: 'match-receipt'; receiptId: string }
  | { kind: 'expense' }
  | { kind: 'product' }
  | { kind: 'purchase' }
  | { kind: 'invoice'; invoiceId: string }
  | { kind: 'supplier-payment'; supplierId: string }
  | { kind: 'adjust'; productId: string }
  | { kind: 'profile' }
  | null;

const NAV_GROUPS: Array<{ title: string; items: Array<{ id: ModuleKey; label: string; icon: LucideIcon }> }> = [
  { title: 'WORKSPACE', items: [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'sales', label: 'Sales & invoices', icon: Receipt },
    { id: 'payments', label: 'Payments', icon: CircleDollarSign },
    { id: 'inventory', label: 'Inventory', icon: Package },
    { id: 'procurement', label: 'Procurement', icon: ShoppingCart },
  ] },
  { title: 'CONTROL', items: [
    { id: 'accounts', label: 'Accounts', icon: BookOpen },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
  ] },
  { title: 'PLATFORM', items: [
    { id: 'integrations', label: 'Integrations', icon: Link2 },
    { id: 'settings', label: 'Settings', icon: Settings },
  ] },
];


const moduleMeta: Record<ModuleKey, { title: string; description: string }> = {
  overview: { title: 'Business overview', description: 'A live view of the money, stock and obligations moving through your business.' },
  sales: { title: 'Sales & invoices', description: 'Every sale, invoice and outstanding customer balance in one register.' },
  payments: { title: 'Payments', description: 'Track collections across M-Pesa, cash, bank and card — then reconcile each one.' },
  inventory: { title: 'Inventory', description: 'Know what is on hand, what is moving and what needs to be reordered.' },
  procurement: { title: 'Procurement', description: 'Control supplier orders, goods received and the bills attached to them.' },
  accounts: { title: 'Accounts', description: 'A traceable financial record, from source transaction to account balance.' },
  reports: { title: 'Reports', description: 'Understand trading performance, cash movement and working capital.' },
  integrations: { title: 'Integrations', description: 'Connect Hesabu to your website, checkout and existing business systems.' },
  settings: { title: 'Business settings', description: 'Manage your business profile, operating preferences and payment configuration.' },
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
const marginValue = (invoice: Invoice) => sum(invoice.lines.map(line => (line.unitPrice - line.unitCost) * line.quantity));
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

function MetricCard({ label, value, note, icon: Icon, tone = 'green', trend }: {
  label: string; value: string; note: string; icon: LucideIcon;
  tone?: 'green' | 'blue' | 'amber' | 'slate'; trend?: string;
}) {
  return <div className="metric-card">
    <div className="metric-top">
      <span>{label}</span>
      <span className={'metric-icon metric-icon-' + tone}><Icon size={17} strokeWidth={1.9} /></span>
    </div>
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
    <div className="empty-state-icon"><Package size={20} /></div>
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

function ProgressLine({ label, value, maximum, color = 'green', suffix = '' }: {
  label: string; value: number; maximum: number; color?: string; suffix?: string;
}) {
  const width = maximum <= 0 ? 0 : Math.min(100, (value / maximum) * 100);
  return <div className="progress-line">
    <div className="progress-line-copy"><span>{label}</span><strong>{numberText(value) + suffix}</strong></div>
    <div className="progress-track"><div className={'progress-fill progress-' + color} style={{ width: width + '%' }} /></div>
  </div>;
}

function Initials({ name }: { name: string }) {
  const letters = name.split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  return <span className="avatar">{letters || 'H'}</span>;
}

function SaleDialog({ products, onClose, onCreate }: {
  products: Product[]; onClose: () => void; onCreate: (input: NewInvoiceInput) => void;
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
        <SelectField label="Sales source" value={source} onChange={value => setSource(value as Invoice['source'])} options={[
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

function StkDialog({ invoices, initialInvoiceId, onClose, onCreate }: {
  invoices: Invoice[]; initialInvoiceId?: string; onClose: () => void; onCreate: (input: NewPaymentInput) => void;
}) {
  const outstandingInvoices = invoices.filter(invoice => invoiceBalance(invoice) > 0);
  const [invoiceId, setInvoiceId] = useState(initialInvoiceId || outstandingInvoices[0]?.id || '');
  const invoice = outstandingInvoices.find(item => item.id === invoiceId);
  const [phone, setPhone] = useState(invoice?.phone || '');
  const [amount, setAmount] = useState(String(invoice ? invoiceBalance(invoice) : 0));
  const channel: PaymentChannel = 'mpesa';
  useEffect(() => {
    const selected = outstandingInvoices.find(item => item.id === invoiceId);
    if (selected) setAmount(String(invoiceBalance(selected)));
  }, [invoiceId]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = Number(amount);
    if (!invoice || value <= 0 || value > invoiceBalance(invoice)) return;
    onCreate({ invoiceId, phone, amount: value, channel, origin: 'daraja_demo' });
  };
  return <Modal title="Request a payment" detail="Simulate a customer payment request. No live M-Pesa prompt will be sent in this preview." onClose={onClose}>
    <form className="modal-body" onSubmit={submit}>
      {outstandingInvoices.length === 0 ? <EmptyState title="No unpaid invoices" body="Create an invoice with a balance before requesting payment." /> : <>
        <div className="demo-notice"><Smartphone size={17} /><span><strong>Daraja sandbox simulation</strong><small>Customer approval and the callback are simulated locally.</small></span></div>
        <SelectField label="Invoice" value={invoiceId} onChange={setInvoiceId} options={outstandingInvoices.map(item => ({
          value: item.id, label: item.number + ' · ' + item.customer + ' · ' + money(invoiceBalance(item)),
        }))} />
        <Field label="Customer M-Pesa number" value={phone} onChange={setPhone} placeholder="2547XXXXXXXX" required />
        <Field label="Amount (KSh)" type="number" min={1} value={amount} onChange={setAmount} required />
        {invoice && <div className="balance-hint"><span>Unpaid invoice balance</span><strong>{money(invoiceBalance(invoice))}</strong></div>}
        <div className="payment-flow-note">
          <span className="flow-step flow-step-active">1 <small>Request</small></span>
          <span className="flow-line" />
          <span className="flow-step">2 <small>Customer PIN</small></span>
          <span className="flow-line" />
          <span className="flow-step">3 <small>Callback</small></span>
          <span className="flow-line" />
          <span className="flow-step">4 <small>Reconcile</small></span>
        </div>
        <div className="modal-footer">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!invoice || Number(amount) <= 0 || Number(amount) > invoiceBalance(invoice)}><Send size={15} /> Simulate STK request</Button>
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

function PurchaseDialog({ suppliers, products, onClose, onCreate }: {
  suppliers: Supplier[]; products: Product[]; onClose: () => void; onCreate: (input: NewPurchaseInput) => void;
}) {
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || '');
  const [expectedAt, setExpectedAt] = useState(addDays(today(), 2));
  const [items, setItems] = useState(() => products[0] ? [{
    productId: products[0].id, quantity: 10, unitCost: products[0].costPrice,
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
  supplier: Supplier; onClose: () => void; onPay: (amount: number) => void;
}) {
  const [amount, setAmount] = useState(String(supplier.balance));
  return <Modal title="Record supplier payment" detail={supplier.name} onClose={onClose}>
    <form className="modal-body" onSubmit={event => {
      event.preventDefault();
      const value = Number(amount);
      if (value > 0 && value <= supplier.balance) onPay(value);
    }}>
      <div className="balance-hint"><span>Outstanding supplier balance</span><strong>{money(supplier.balance)}</strong></div>
      <Field label="Payment amount (KSh)" type="number" min={1} value={amount} onChange={setAmount} />
      <div className="field-hint">This records a bank payment and reduces the supplier payable. It does not initiate a bank transfer.</div>
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
  return <Modal title="Add an unmatched receipt" detail="Capture a payment that reached the business but has not yet been linked to an invoice." onClose={onClose}>
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
      <div className="demo-notice"><ShieldCheck size={16} /><span><strong>Receipt capture only</strong><small>This adds a local reconciliation item. It does not verify the payment against Safaricom or a bank.</small></span></div>
      <div className="modal-footer">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={!reference.trim() || Number(amount) <= 0}><Plus size={15} /> Add to matching queue</Button>
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
  return <Modal title="Adjust stock quantity" detail={product.name} onClose={onClose}>
    <form className="modal-body" onSubmit={event => {
      event.preventDefault();
      const next = Number(quantity);
      if (Number.isFinite(next) && next >= 0) onAdjust(next, reason);
    }}>
      <div className="balance-hint"><span>Currently recorded</span><strong>{numberText(product.quantity) + ' ' + product.unit}</strong></div>
      <Field label="New counted quantity" type="number" min={0} value={quantity} onChange={setQuantity} required />
      <SelectField label="Adjustment reason" value={reason} onChange={setReason} options={[
        { value: 'Stock count adjustment', label: 'Physical stock count' },
        { value: 'Damaged or expired', label: 'Damaged or expired goods' },
        { value: 'Opening balance correction', label: 'Opening balance correction' },
        { value: 'Other stock movement', label: 'Other stock movement' },
      ]} />
      <div className="modal-footer"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit">Save stock count</Button></div>
    </form>
  </Modal>;
}

function OverviewPage({ data, metrics, onCreateSale, onNavigate, onSelectInvoice, onRecordExpense }: {
  data: AppData; metrics: ReturnType<typeof getMetrics>; onCreateSale: () => void;
  onNavigate: (section: ModuleKey) => void; onSelectInvoice: (id: string) => void; onRecordExpense: () => void;
}) {
  const chartDays = Array.from({ length: 7 }, (_, index) => addDays(today(), index - 6));
  const chartValues = chartDays.map(day => sum(data.invoices.filter(invoice => invoice.date === day).map(invoice => invoice.total)));
  const chartLabels = chartDays.map(day => new Date(day + 'T12:00:00').toLocaleDateString('en-KE', { weekday: 'short' }));
  const todayInvoices = data.invoices.filter(invoice => invoice.date === today());
  const recentInvoices = [...data.invoices].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const lowStock = data.products.filter(product => product.quantity <= product.reorderLevel);
  const unsettled = data.invoices.filter(invoice => invoiceBalance(invoice) > 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 4);
  return <div className="page-stack">
    <div className="overview-welcome">
      <div><div className="eyebrow">YOUR BUSINESS AT A GLANCE</div><h2>Good morning, {data.profile.owner === 'Business owner' ? 'there' : data.profile.owner.split(' ')[0]}.</h2><p>Here is what is happening across {data.profile.name}.</p></div>
      <div className="overview-welcome-actions">
        <span className="date-chip"><CalendarDays size={14} /> {dateLabel(today())}</span>
        <Button variant="outline" onClick={onRecordExpense}><Plus size={15} /> Expense</Button>
        <Button onClick={onCreateSale}><Plus size={16} /> Record sale</Button>
      </div>
    </div>

    <div className="metric-grid metric-grid-five">
      <MetricCard label="Sales today" value={money(metrics.salesToday)} note={todayInvoices.length + ' invoices posted'} icon={TrendingUp} tone="green" trend="Trading activity" />
      <MetricCard label="Gross profit · MTD" value={money(metrics.grossProfitMonth)} note="Revenue less recorded item cost" icon={Activity} tone="blue" />
      <MetricCard label="Cash position" value={money(metrics.cashPosition)} note="Cash, M-Pesa and bank balances" icon={Wallet} tone="slate" />
      <MetricCard label="Customer balances" value={money(metrics.receivables)} note="Unpaid and part-paid invoices" icon={ArrowDownLeft} tone="amber" />
      <MetricCard label="Stock at cost" value={money(metrics.inventoryValue)} note={lowStock.length + ' items at or below reorder'} icon={Boxes} tone="blue" />
    </div>

    <div className="content-grid content-grid-main">
      <SectionCard title="Sales performance" detail="Invoice value recorded over the last seven days." action={<button className="text-link" onClick={() => onNavigate('reports')}>Full report <ArrowRight size={13} /></button>}>
        <div className="chart-summary"><strong>{money(sum(chartValues))}</strong><span>Sales · 7 days</span></div>
        <MiniBars values={chartValues} labels={chartLabels} />
      </SectionCard>
      <SectionCard title="Money by channel" detail="Recorded collection balances">
        <div className="channel-balances">
          <div><span className="channel-icon channel-icon-mpesa"><Smartphone size={15} /></span><span>M-Pesa</span><strong>{money(metrics.channelBalances.mpesa)}</strong></div>
          <div><span className="channel-icon channel-icon-cash"><Wallet size={15} /></span><span>Cash on hand</span><strong>{money(metrics.channelBalances.cash)}</strong></div>
          <div><span className="channel-icon channel-icon-bank"><Building2 size={15} /></span><span>Bank</span><strong>{money(metrics.channelBalances.bank)}</strong></div>
        </div>
        <div className="channel-total"><span>Total recorded funds</span><strong>{money(metrics.cashPosition)}</strong></div>
      </SectionCard>
    </div>

    <div className="content-grid content-grid-main">
      <SectionCard title="Recent invoices" detail="Latest sales across POS, website and manual entry." action={<button className="text-link" onClick={() => onNavigate('sales')}>All invoices <ArrowRight size={13} /></button>}>
        {recentInvoices.length ? <DataTable headers={['Invoice', 'Customer', 'Date', 'Status', 'Total']}>
          {recentInvoices.map(invoice => <tr key={invoice.id} className="clickable-row" onClick={() => onSelectInvoice(invoice.id)}>
            <td><strong>{invoice.number}</strong><small className="cell-sub">{sourceLabel(invoice.source)}</small></td>
            <td>{invoice.customer}</td><td>{dateLabel(invoice.date)}</td>
            <td><StatusPill status={invoice.status}>{statusLabel(invoice.status)}</StatusPill></td>
            <td className="amount-cell">{money(invoice.total)}</td>
          </tr>)}
        </DataTable> : <EmptyState title="No invoices yet" body="Record the first sale to start building your business record." />}
      </SectionCard>
      <div className="side-stack">
        <SectionCard title="Needs attention" detail="Actions that may affect today's operations.">
          <div className="attention-list">
            <button onClick={() => onNavigate('inventory')}>
              <span className="attention-icon attention-amber"><Package size={16} /></span>
              <span><strong>{lowStock.length} low-stock items</strong><small>Review reorder quantities</small></span>
              <ChevronRight size={15} />
            </button>
            <button onClick={() => onNavigate('sales')}>
              <span className="attention-icon attention-blue"><Receipt size={16} /></span>
              <span><strong>{money(metrics.receivables)} receivable</strong><small>{metrics.unpaidInvoices} unpaid invoices</small></span>
              <ChevronRight size={15} />
            </button>
            <button onClick={() => onNavigate('procurement')}>
              <span className="attention-icon attention-red"><Truck size={16} /></span>
              <span><strong>{money(metrics.payables)} supplier balances</strong><small>Review payments due</small></span>
              <ChevronRight size={15} />
            </button>
          </div>
        </SectionCard>
        <SectionCard title="Collection follow-up" detail="Invoices with balances remaining.">
          <div className="followup-list">
            {unsettled.length ? unsettled.slice(0, 3).map(invoice => <button key={invoice.id} onClick={() => onSelectInvoice(invoice.id)}>
              <span><strong>{invoice.customer}</strong><small>{invoice.number} · Due {dateLabel(invoice.dueDate)}</small></span>
              <strong>{money(invoiceBalance(invoice))}</strong>
            </button>) : <p className="muted-copy">No outstanding invoices.</p>}
          </div>
        </SectionCard>
      </div>
    </div>
    <div className="overview-footnote"><ShieldCheck size={15} /> Figures are calculated from the records currently in this demo workspace. No external bank or M-Pesa balance is being queried.</div>
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

function PaymentsPage({ data, metrics, search, onSearch, onRequestPayment, onResolvePayment, onAddReceipt, onMatchReceipt }: {
  data: AppData; metrics: ReturnType<typeof getMetrics>; search: string; onSearch: (value: string) => void;
  onRequestPayment: () => void; onResolvePayment: (id: string, success: boolean) => void;
  onAddReceipt: () => void; onMatchReceipt: (receiptId: string) => void;
}) {
  const list = [...data.payments].filter(payment =>
    (payment.invoiceNumber + ' ' + payment.customer + ' ' + payment.reference + ' ' + (payment.rail || '')).toLowerCase().includes(search.toLowerCase()),
  ).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pending = data.payments.filter(payment => payment.status === 'pending').length;
  const failed = data.payments.filter(payment => payment.status === 'failed').length;
  const unmatched = [...data.unmatchedReceipts].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  const unmatchedValue = sum(unmatched.map(receipt => receipt.amount));
  return <div className="page-stack">
    <PageHeader title="Payments" description="Collect, reconcile and trace receipts across merchant payment methods — without relying on a customer SMS as the only record." actions={<>
      <Button variant="outline" onClick={onAddReceipt}><Plus size={15} /> Add receipt</Button>
      <Button onClick={onRequestPayment}><Send size={15} /> Request payment</Button>
    </>} />
    <div className="metric-grid metric-grid-five compact-metrics">
      <MetricCard label="Collected today" value={money(metrics.collectedToday)} note="Confirmed receipts" icon={CircleDollarSign} tone="green" />
      <MetricCard label="Awaiting confirmation" value={numberText(pending)} note="Requests not yet resolved" icon={Clock3} tone="amber" />
      <MetricCard label="Unmatched receipts" value={numberText(unmatched.length)} note={money(unmatchedValue) + ' waiting to be allocated'} icon={AlertTriangle} tone="amber" />
      <MetricCard label="Failed requests" value={numberText(failed)} note="Requests not confirmed" icon={Activity} tone="blue" />
      <MetricCard label="Payment rails" value="Multi-channel" note="M-Pesa, Pochi, bank and more" icon={CreditCard} tone="slate" />
    </div>
    <div className="content-grid content-grid-main">
      <SectionCard title="Money by account" detail="Recorded balances from posted receipts and expenses.">
        <div className="channel-balances payment-channel-balances">
          <div><span className="channel-icon channel-icon-mpesa"><Smartphone size={15} /></span><span>M-Pesa clearing</span><strong>{money(metrics.channelBalances.mpesa)}</strong></div>
          <div><span className="channel-icon channel-icon-cash"><Wallet size={15} /></span><span>Cash on hand</span><strong>{money(metrics.channelBalances.cash)}</strong></div>
          <div><span className="channel-icon channel-icon-bank"><Building2 size={15} /></span><span>Bank account</span><strong>{money(metrics.channelBalances.bank)}</strong></div>
          <div><span className="channel-icon channel-icon-card"><CreditCard size={15} /></span><span>Card clearing</span><strong>{money(metrics.channelBalances.card)}</strong></div>
        </div>
      </SectionCard>
      <SectionCard title="Collection controls" detail="Payment handling status">
        <div className="control-list">
          <div><span className="control-led control-led-green" /><span><strong>Invoice matching</strong><small>Match by receipt reference, amount and invoice</small></span><StatusPill status="delivered">Available</StatusPill></div>
          <div><span className="control-led control-led-amber" /><span><strong>Daraja connection</strong><small>Preview simulator only</small></span><StatusPill status="pending">Not connected</StatusPill></div>
          <div><span className="control-led control-led-blue" /><span><strong>Statement intake</strong><small>Manual receipt capture in this preview</small></span><StatusPill status="pending">Manual</StatusPill></div>
        </div>
      </SectionCard>
    </div>
    <SectionCard title="Unmatched receipt queue" detail="Money received by the business but not yet allocated to a customer invoice.">
      {unmatched.length ? <DataTable headers={['Received', 'Payment rail', 'Payer', 'Phone', 'Receipt reference', 'Amount', 'Action']}>
        {unmatched.map(receipt => <tr key={receipt.id}>
          <td>{dateTimeLabel(receipt.receivedAt)}<small className="cell-sub">{receipt.source === 'statement' ? 'Statement import' : receipt.source === 'callback' ? 'Provider callback' : 'Manual capture'}</small></td>
          <td>{receipt.rail}</td><td><strong>{receipt.payer}</strong></td><td>{receipt.phone || '—'}</td>
          <td className="mono-text">{receipt.reference}</td><td className="amount-cell">{money(receipt.amount)}</td>
          <td><Button size="sm" variant="secondary" onClick={() => onMatchReceipt(receipt.id)}>Match invoice</Button></td>
        </tr>)}
      </DataTable> : <EmptyState title="No unmatched receipts" body="Incoming receipts that cannot be linked automatically will appear here for review." />}
    </SectionCard>
    <SectionCard title="Payment register" detail="Pending STK requests can be resolved with the preview simulator to demonstrate an asynchronous callback.">
      <div className="table-toolbar">
        <div className="table-search"><Search size={15} /><input value={search} onChange={event => onSearch(event.target.value)} placeholder="Search payment, invoice or receipt…" /></div>
        <span className="table-count">{list.length} records</span>
      </div>
      {list.length ? <DataTable headers={['Payment', 'Customer', 'Invoice', 'Channel', 'Reference', 'Time', 'Amount', 'Status', 'Action']}>
        {list.map(payment => <tr key={payment.id}>
          <td><strong>{payment.id.toUpperCase()}</strong><small className="cell-sub">{payment.origin === 'daraja_demo' ? 'STK simulation' : payment.origin === 'integration' ? 'Website integration' : payment.origin === 'reconciliation' ? 'Matched receipt · ' + (payment.rail || 'Imported') : 'Manual record'}</small></td>
          <td>{payment.customer}<small className="cell-sub">{payment.phone}</small></td>
          <td>{payment.invoiceNumber}</td><td><span className={channelClass(payment.channel)}>{channelLabel(payment.channel)}</span></td>
          <td className="mono-text">{shortRef(payment.reference)}</td><td>{dateTimeLabel(payment.createdAt)}</td>
          <td className="amount-cell">{money(payment.amount)}{(payment.unappliedAmount ?? 0) > 0 && <small className="cell-sub">{money(payment.unappliedAmount ?? 0)} customer credit</small>}</td>
          <td><StatusPill status={payment.status}>{payment.status === 'succeeded' ? 'Confirmed' : payment.status === 'pending' ? 'Pending' : payment.status === 'failed' ? 'Failed' : 'Reversed'}</StatusPill></td>
          <td>{payment.status === 'pending' ? <div className="row-actions">
            <Button size="sm" variant="secondary" onClick={() => onResolvePayment(payment.id, true)}>Approve</Button>
            <Button size="sm" variant="ghost" onClick={() => onResolvePayment(payment.id, false)}>Fail</Button>
          </div> : <span className="muted-copy">—</span>}</td>
        </tr>)}
      </DataTable> : <EmptyState title="No payment records" body="Payment confirmations and cash records will appear here." />}
    </SectionCard>
  </div>;
}

function InventoryPage({ data, search, onSearch, onAddProduct, onAdjust }: {
  data: AppData; search: string; onSearch: (value: string) => void; onAddProduct: () => void; onAdjust: (id: string) => void;
}) {
  const [view, setView] = useState<'all' | 'low'>('all');
  const list = data.products.filter(product => {
    const matches = (product.name + ' ' + product.sku + ' ' + product.category).toLowerCase().includes(search.toLowerCase());
    return matches && (view === 'all' || product.quantity <= product.reorderLevel);
  });
  const low = data.products.filter(product => product.quantity <= product.reorderLevel);
  const value = sum(data.products.map(productValue));
  const potential = sum(data.products.map(product => product.quantity * product.sellingPrice));
  return <div className="page-stack">
    <PageHeader title="Inventory" description="Track stock quantities and product economics across the business." actions={<Button onClick={onAddProduct}><Plus size={16} /> Add product</Button>} />
    <div className="metric-grid metric-grid-four compact-metrics">
      <MetricCard label="Stock at cost" value={money(value)} note="Current quantity × unit cost" icon={Boxes} tone="blue" />
      <MetricCard label="Retail value" value={money(potential)} note="At current selling prices" icon={TrendingUp} tone="green" />
      <MetricCard label="Tracked products" value={numberText(data.products.length)} note="Unique product records" icon={Package} tone="slate" />
      <MetricCard label="Reorder needed" value={numberText(low.length)} note="At or below reorder level" icon={AlertTriangle} tone="amber" />
    </div>
    <SectionCard title="Product register" detail="Quantities are updated when a sale is posted or a purchase order is received.">
      <div className="table-toolbar">
        <div className="table-search"><Search size={15} /><input value={search} onChange={event => onSearch(event.target.value)} placeholder="Search name, SKU or category…" /></div>
        <div className="segmented-control">
          <button className={view === 'all' ? 'active' : ''} onClick={() => setView('all')}>All items</button>
          <button className={view === 'low' ? 'active' : ''} onClick={() => setView('low')}>Reorder list <span>{low.length}</span></button>
        </div>
        <span className="table-count">{list.length} products</span>
      </div>
      {list.length ? <DataTable headers={['Product', 'SKU', 'Category', 'On hand', 'Reorder level', 'Cost price', 'Selling price', 'Stock value', 'Status', '']}>
        {list.map(product => {
          const isLow = product.quantity <= product.reorderLevel;
          const isCritical = product.quantity <= Math.max(1, Math.floor(product.reorderLevel / 2));
          return <tr key={product.id}>
            <td><strong>{product.name}</strong><small className="cell-sub">{product.unit}</small></td>
            <td className="mono-text">{product.sku}</td><td>{product.category}</td>
            <td><strong>{numberText(product.quantity)}</strong> <small>{product.unit}</small></td>
            <td>{numberText(product.reorderLevel)} <small>{product.unit}</small></td>
            <td>{money(product.costPrice)}</td><td>{money(product.sellingPrice)}</td>
            <td className="amount-cell">{money(productValue(product))}</td>
            <td><StatusPill status={isCritical ? 'failed' : isLow ? 'pending' : 'delivered'}>{isCritical ? 'Critical' : isLow ? 'Low stock' : 'In stock'}</StatusPill></td>
            <td><button className="table-action" onClick={() => onAdjust(product.id)}>Adjust</button></td>
          </tr>;
        })}
      </DataTable> : <EmptyState title="No products match" body="Try another search or switch to all items." />}
    </SectionCard>
  </div>;
}

function ProcurementPage({ data, onCreatePurchase, onReceiveOrder, onPaySupplier }: {
  data: AppData; onCreatePurchase: () => void; onReceiveOrder: (id: string) => void; onPaySupplier: (id: string) => void;
}) {
  const openOrders = data.purchaseOrders.filter(order => order.status === 'sent' || order.status === 'partially_received');
  const payables = sum(data.suppliers.map(supplier => supplier.balance));
  return <div className="page-stack">
    <PageHeader title="Procurement" description="Manage supplier orders, goods received and the amounts your business still owes." actions={<Button onClick={onCreatePurchase}><Plus size={16} /> New purchase order</Button>} />
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
          <td>{dateLabel(order.expectedAt)}</td><td>{order.lines.length} lines</td><td className="amount-cell">{money(order.total)}</td>
          <td><StatusPill status={order.status}>{order.status === 'partially_received' ? 'Part received' : order.status === 'received' ? 'Received' : order.status === 'sent' ? 'Sent to supplier' : order.status}</StatusPill></td>
          <td>{order.status === 'sent' || order.status === 'partially_received' ? <Button size="sm" variant="secondary" onClick={() => onReceiveOrder(order.id)}>Receive goods</Button> : <span className="muted-copy">Complete</span>}</td>
        </tr>)}
      </DataTable> : <EmptyState title="No purchase orders" body="Create a purchase order when your business is ready to replenish stock." />}
    </SectionCard>
    <SectionCard title="Supplier accounts" detail="Open balances are tracked separately from customer receivables.">
      <DataTable headers={['Supplier', 'Contact', 'Payment terms', 'Outstanding', '']}>
        {data.suppliers.map(supplier => <tr key={supplier.id}>
          <td><strong>{supplier.name}</strong><small className="cell-sub">{supplier.email}</small></td>
          <td>{supplier.phone}</td><td>{supplier.terms}</td>
          <td className="amount-cell">{money(supplier.balance)}</td>
          <td>{supplier.balance > 0 ? <button className="table-action" onClick={() => onPaySupplier(supplier.id)}>Record payment</button> : <span className="muted-copy">Up to date</span>}</td>
        </tr>)}
      </DataTable>
    </SectionCard>
  </div>;
}

function AccountsPage({ data, metrics }: { data: AppData; metrics: ReturnType<typeof getMetrics> }) {
  const [tab, setTab] = useState<'balances' | 'journal'>('balances');
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
  return <div className="page-stack">
    <PageHeader title="Accounts" description="The business record behind every invoice, expense and stock movement." actions={<span className="accounting-balance"><ShieldCheck size={15} /> {journalBalanced ? 'Journal balanced' : 'Journal needs review'}</span>} />
    <div className="metric-grid metric-grid-four compact-metrics">
      <MetricCard label="Accounts receivable" value={money(metrics.receivables)} note="Due from customers" icon={ArrowDownLeft} tone="amber" />
      <MetricCard label="Accounts payable" value={money(metrics.payables)} note="Due to suppliers" icon={ArrowUpRight} tone="blue" />
      <MetricCard label="Operating expenses" value={money(metrics.expenses)} note="Recorded expenses" icon={TrendingDown} tone="slate" />
      <MetricCard label="Gross profit · MTD" value={money(metrics.grossProfitMonth)} note="Sales less item cost" icon={TrendingUp} tone="green" />
    </div>
    <SectionCard title="Accounting register" detail="Account balances are derived from opening balances and posted demo transactions.">
      <div className="section-tabs">
        <button className={tab === 'balances' ? 'active' : ''} onClick={() => setTab('balances')}>Account balances</button>
        <button className={tab === 'journal' ? 'active' : ''} onClick={() => setTab('journal')}>Journal entries <span>{journal.length}</span></button>
      </div>
      {tab === 'balances' ? <DataTable headers={['Account', 'Classification', 'Balance', '']}>
        {accounts.map(account => <tr key={account.name}>
          <td><strong>{account.name}</strong></td><td>{account.group}</td>
          <td className="amount-cell">{money(account.amount)}</td>
          <td><span className={'account-type account-type-' + account.type}>{account.type}</span></td>
        </tr>)}
      </DataTable> : <>
        <div className="journal-summary">
          <div><span>Debits posted</span><strong>{money(debitTotal)}</strong></div>
          <div><span>Credits posted</span><strong>{money(creditTotal)}</strong></div>
          <div><span>Difference</span><strong className={Math.round(debitTotal - creditTotal) === 0 ? 'positive-text' : 'negative-text'}>{money(Math.abs(debitTotal - creditTotal))}</strong></div>
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
    <div className="accounting-note"><ShieldCheck size={16} /><span>Journal entries in this preview demonstrate the accounting model. Before production, account mappings, tax treatment, inventory costing and period-close controls need formal validation by an accountant.</span></div>
  </div>;
}

function ReportsPage({ data, metrics }: { data: AppData; metrics: ReturnType<typeof getMetrics> }) {
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const days = period === 'week' ? 7 : 30;
  const dayRows = Array.from({ length: days }, (_, index) => {
    const date = addDays(today(), index - (days - 1));
    const invoices = data.invoices.filter(invoice => invoice.date === date);
    return { date, sales: sum(invoices.map(invoice => invoice.total)), cost: sum(invoices.map(invoice => sum(invoice.lines.map(line => line.unitCost * line.quantity)))) };
  });
  const filteredInvoices = data.invoices.filter(invoice => invoice.date >= addDays(today(), -(days - 1)) && invoice.date <= today());
  const sales = sum(filteredInvoices.map(invoice => invoice.total));
  const cogs = sum(filteredInvoices.map(invoice => sum(invoice.lines.map(line => line.unitCost * line.quantity))));
  const max = Math.max(1, ...dayRows.map(row => row.sales));
  return <div className="page-stack">
    <PageHeader title="Reports" description="A practical view of sales, margin, cash movement and inventory value." actions={<Button variant="outline" onClick={() => window.print()}><Download size={15} /> Print report</Button>} />
    <div className="metric-grid metric-grid-four compact-metrics">
      <MetricCard label="Sales recorded" value={money(sales)} note={period === 'week' ? 'Last seven days' : 'Last 30 days'} icon={TrendingUp} tone="green" />
      <MetricCard label="Gross margin" value={money(sales - cogs)} note="Sales value less recorded product cost" icon={Activity} tone="blue" />
      <MetricCard label="Margin rate" value={(sales > 0 ? ((sales - cogs) / sales) * 100 : 0).toFixed(1) + '%'} note="Based on item cost data" icon={BarChart3} tone="slate" />
      <MetricCard label="Inventory value" value={money(metrics.inventoryValue)} note="Current stock at cost" icon={Package} tone="amber" />
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
      <SectionCard title="Sales by channel" detail="Value according to invoice payment channel">
        {(['mpesa', 'cash', 'bank', 'card', 'credit'] as PaymentChannel[]).map(channel => {
          const value = sum(filteredInvoices.filter(invoice => invoice.channel === channel).map(invoice => invoice.total));
          return <ProgressLine key={channel} label={channelLabel(channel)} value={value} maximum={sales} suffix=" KSh" color={channel === 'mpesa' ? 'green' : channel === 'credit' ? 'amber' : channel === 'bank' ? 'blue' : 'slate'} />;
        })}
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

function IntegrationsPage({ data, onCopy, onNotice }: {
  data: AppData; onCopy: (value: string) => void; onNotice: (title: string, detail?: string) => void;
}) {
  const [tab, setTab] = useState<'payments' | 'developer' | 'events'>('payments');
  const code = '<script src="https://cdn.hesabu.ai/v1/checkout.js" data-business="hs_demo_northstar"></script>';
  const events = [...data.events].sort((a, b) => b.time.localeCompare(a.time));
  return <div className="page-stack">
    <PageHeader title="Integrations" description="Use Hesabu as the finance and control layer behind an existing business website or checkout." actions={<span className="integration-mode"><span className="status-dot" /> Sandbox preview</span>} />
    <div className="integration-hero">
      <div className="integration-hero-copy">
        <div className="eyebrow">HESABU PLATFORM</div>
        <h2>One financial record.<br />Every place you sell.</h2>
        <p>Connect an existing checkout or website to Hesabu. A completed sale can create an invoice, record the payment, update inventory and post to accounts — without rebuilding the merchant's website.</p>
        <div className="integration-hero-actions">
          <Button onClick={() => setTab('developer')}><Code2 size={15} /> Developer setup</Button>
          <Button variant="outline" onClick={() => setTab('payments')}>Payment connections</Button>
        </div>
      </div>
      <div className="integration-graphic">
        <div className="integration-node integration-node-site"><Globe2 size={18} /><span>Business website</span><small>Online checkout</small></div>
        <div className="integration-connect"><i /><i /><i /></div>
        <div className="integration-node integration-node-hesabu"><div className="mini-brand">H</div><span>Hesabu</span><small>Finance engine</small></div>
        <div className="integration-connect"><i /><i /><i /></div>
        <div className="integration-node integration-node-core"><Boxes size={18} /><span>Business records</span><small>Accounts · Stock · Reports</small></div>
      </div>
    </div>
    <SectionCard title="Connected services" detail="Configure the services your business uses. Current connections are demonstrative only.">
      <div className="section-tabs integration-tabs">
        <button className={tab === 'payments' ? 'active' : ''} onClick={() => setTab('payments')}>Payment connections</button>
        <button className={tab === 'developer' ? 'active' : ''} onClick={() => setTab('developer')}>Website & API</button>
        <button className={tab === 'events' ? 'active' : ''} onClick={() => setTab('events')}>Event log <span>{events.length}</span></button>
      </div>
      {tab === 'payments' && <div className="integration-payment-layout">
        <div className="integration-provider">
          <div className="provider-logo provider-mpesa">M</div>
          <div className="provider-copy"><strong>M-Pesa · Daraja</strong><p>Request a payment, receive the asynchronous result and reconcile the receipt against an invoice.</p><div className="provider-tags"><span>STK Push</span><span>Callbacks</span><span>Transaction status</span></div></div>
          <div className="provider-status"><StatusPill status="pending">Not connected</StatusPill><small>Sandbox preview only</small></div>
          <Button variant="outline" size="sm" onClick={() => onNotice('Daraja credentials not connected', 'Add your Safaricom Daraja application credentials and merchant shortcode when the backend is ready. This preview cannot send a real prompt.')}>Configure</Button>
        </div>
        <div className="integration-provider">
          <div className="provider-logo provider-tax">T</div>
          <div className="provider-copy"><strong>KRA eTIMS · System integration</strong><p>Future tax-invoice connectivity through the applicable OSCU or VSCU route. Hesabu is not certified and does not issue eTIMS invoices in this preview.</p><div className="provider-tags"><span>OSCU</span><span>VSCU</span><span>Certification required</span></div></div>
          <div className="provider-status"><StatusPill status="pending">Not certified</StatusPill><small>Roadmap item</small></div>
          <Button variant="outline" size="sm" onClick={() => onNotice('eTIMS integration requirements', 'KRA requires system-to-system integrations to be developed, tested, vetted and certified before production use.')}>Requirements</Button>
        </div>
        <div className="merchant-methods">
          <div><span className="channel-icon channel-icon-mpesa"><Smartphone size={15} /></span><span><strong>Merchant Till / PayBill</strong><small>Supported merchant shortcode destination</small></span><StatusPill status="pending">Not configured</StatusPill></div>
          <div><span className="channel-icon channel-icon-cash"><Wallet size={15} /></span><span><strong>Cash collections</strong><small>Record cash received at the counter</small></span><StatusPill status="delivered">Available</StatusPill></div>
          <div><span className="channel-icon channel-icon-bank"><Building2 size={15} /></span><span><strong>Bank reconciliation</strong><small>Import statements or connect a provider later</small></span><StatusPill status="pending">Not connected</StatusPill></div>
        </div>
        <div className="integration-compliance-note"><ShieldCheck size={16} /><span>In the intended flow, a merchant's own shortcode receives the M-Pesa settlement. Hesabu requests and reconciles supported merchant payments; it does not hold or pool merchant funds. Pochi and Send Money need separately verified feeds or partner connections.</span></div>
      </div>}
      {tab === 'developer' && <div className="developer-panel">
        <div className="developer-copy"><div className="eyebrow">EMBED OR CONNECT</div><h3>Keep the storefront.<br />Connect the operations.</h3><p>When production APIs are available, a merchant can use the Hesabu API from their backend or embed a payment and invoice element into the checkout they already own.</p>
          <div className="developer-stat-grid"><div><small>Business ID</small><strong className="mono-text">hs_demo_northstar</strong></div><div><small>Environment</small><strong>Sandbox</strong></div><div><small>Webhook delivery</small><strong>Event driven</strong></div></div>
        </div>
        <div className="code-card">
          <div className="code-card-top"><span><i /> <i /> <i /> Integration snippet</span><button onClick={() => onCopy(code)}><Copy size={13} /> Copy</button></div>
          <pre><code>{code}</code></pre>
          <div className="code-card-note"><LockKeyholeFallback /> Secret keys remain server-side and are never embedded in a public website.</div>
        </div>
        <div className="api-endpoints">
          <div className="api-endpoints-head"><strong>Planned API surface</strong><span>Design reference · Not live</span></div>
          <div><span className="http-method">POST</span><code>/v1/invoices</code><small>Create an invoice from an external sale</small></div>
          <div><span className="http-method">POST</span><code>/v1/payment-intents</code><small>Start a payment request using a merchant rail</small></div>
          <div><span className="http-method">GET</span><code>/v1/invoices/:id</code><small>Retrieve the latest invoice and settlement state</small></div>
          <div><span className="http-method">POST</span><code>/v1/webhooks</code><small>Register an endpoint for payment and stock events</small></div>
        </div>
      </div>}
      {tab === 'events' && <DataTable headers={['Event', 'Source', 'Reference', 'Received', 'Delivery']}>
        {events.map(event => <tr key={event.id}>
          <td><strong className="mono-text">{event.type}</strong><small className="cell-sub">{event.detail}</small></td>
          <td>{event.source}</td><td className="mono-text">{event.reference}</td><td>{dateTimeLabel(event.time)}</td>
          <td><StatusPill status={event.status}>{event.status === 'delivered' ? 'Processed' : event.status === 'pending' ? 'Needs review' : 'Failed'}</StatusPill></td>
        </tr>)}
      </DataTable>}
    </SectionCard>
    <div className="integration-footer-note"><ShieldCheck size={15} /> API keys, webhook signing, idempotency, replay protection and production payment credentials require a secure backend. The displayed developer surface is a product design preview, not a live API.</div>
  </div>;
}

function LockKeyholeFallback() {
  return <ShieldCheck size={13} />;
}

function SettingsPage({ profile, onSave, onReset, onNotice }: {
  profile: BusinessProfile; onSave: (profile: BusinessProfile) => void; onReset: () => void;
  onNotice: (title: string, detail?: string) => void;
}) {
  const [form, setForm] = useState(profile);
  const [saved, setSaved] = useState(false);
  const update = (key: keyof BusinessProfile, value: string) => {
    setSaved(false);
    setForm(current => ({ ...current, [key]: value }));
  };
  return <div className="page-stack">
    <PageHeader title="Business settings" description="The core business identity and operating configuration used across Hesabu." />
    <div className="content-grid content-grid-main settings-grid">
      <SectionCard title="Business profile" detail="These details appear on invoices and business reports.">
        <form className="settings-form" onSubmit={event => {
          event.preventDefault();
          onSave(form); setSaved(true);
        }}>
          <Field label="Business display name" value={form.name} onChange={value => update('name', value)} required />
          <Field label="Registered business name" value={form.legalName} onChange={value => update('legalName', value)} />
          <div className="form-grid form-grid-two">
            <Field label="Business contact" value={form.phone} onChange={value => update('phone', value)} />
            <Field label="Accounts email" value={form.email} onChange={value => update('email', value)} />
          </div>
          <div className="form-grid form-grid-two">
            <Field label="Location" value={form.location} onChange={value => update('location', value)} />
            <Field label="Industry" value={form.industry} onChange={value => update('industry', value)} />
          </div>
          <Field label="KRA PIN" value={form.taxPin} onChange={value => update('taxPin', value)} hint="The preview does not validate or transmit tax details." />
          <div className="settings-form-footer">{saved && <span className="saved-inline"><CheckCircle2 size={14} /> Saved to this browser</span>}<Button type="submit">Save business profile</Button></div>
        </form>
      </SectionCard>
      <div className="side-stack">
        <SectionCard title="Payment configuration" detail="Merchant payment details for future live integration.">
          <div className="settings-connection">
            <div className="provider-logo provider-mpesa">M</div><div><strong>Safaricom Daraja</strong><small>Sandbox and production credentials not supplied</small></div>
            <StatusPill status="pending">Not connected</StatusPill>
          </div>
          <Button variant="outline" className="btn-block" onClick={() => onNotice('Payment backend required', 'The production flow needs a secure server, merchant shortcode, callback URLs, credentials and payment reconciliation controls.')}>View setup requirements</Button>
        </SectionCard>
        <SectionCard title="Data & workspace" detail="This preview is stored locally on this device.">
          <div className="workspace-detail"><span>Workspace mode</span><strong>Local demo</strong></div>
          <div className="workspace-detail"><span>Database connection</span><strong>Not connected</strong></div>
          <div className="workspace-detail"><span>Data scope</span><strong>This browser only</strong></div>
          <Button variant="outline" className="btn-block" onClick={() => onNotice('Data export', 'The local demo workspace stores records in browser storage. A structured export is planned with the production data layer.') }><Download size={14} /> Export options</Button>
          <Button variant="danger" className="btn-block" onClick={onReset}><RefreshCw size={14} /> Reset demo workspace</Button>
        </SectionCard>
        <div className="settings-footer-note">Demo records are illustrative. Do not enter real customer information, credentials or confidential business data.</div>
      </div>
    </div>
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

function App() {
  const [data, setData] = useState<AppData>(() => readWorkspace());
  const [active, setActive] = useState<ModuleKey>('overview');
  const [dialog, setDialog] = useState<DialogState>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<Notice>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => { saveWorkspace(data); }, [data]);

  const metrics = useMemo(() => getMetrics(data), [data]);
  const selectedInvoice = selectedInvoiceId ? data.invoices.find(invoice => invoice.id === selectedInvoiceId) : undefined;
  const selectedSupplier = dialog?.kind === 'supplier-payment' ? data.suppliers.find(supplier => supplier.id === dialog.supplierId) : undefined;
  const selectedReceipt = dialog?.kind === 'match-receipt' ? data.unmatchedReceipts.find(receipt => receipt.id === dialog.receiptId) : undefined;
  const selectedProduct = dialog?.kind === 'adjust' ? data.products.find(product => product.id === dialog.productId) : undefined;

  const notify = (title: string, detail?: string) => setNotice({ title, detail });
  const closeNotice = () => setNotice(null);
  const navigate = (section: ModuleKey) => {
    setActive(section);
    setSearch('');
    setDialog(null);
    setSelectedInvoiceId(null);
    setMobileMenuOpen(false);
    setSearchOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const createInvoice = (input: NewInvoiceInput) => {
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
  };

  const createPaymentRequest = (input: NewPaymentInput) => {
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
    const duplicateReference = data.unmatchedReceipts.some(item => item.reference.toUpperCase() === input.reference.toUpperCase()) ||
      data.payments.some(item => item.reference.toUpperCase() === input.reference.toUpperCase());
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
    const product: Product = { ...input, id: makeId('PRD'), updatedAt: today() };
    setData(current => ({
      ...current, products: [product, ...current.products],
      events: [{
        id: makeId('EVT'), time: new Date().toISOString(), type: 'inventory.item_created',
        source: 'Inventory', status: 'delivered', reference: product.sku,
        detail: product.name + ' added to the product register',
      }, ...current.events],
    }));
    setDialog(null);
    notify('Product added', product.name + ' is now in the inventory register.');
  };

  const createPurchaseOrder = (input: NewPurchaseInput) => {
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

  const receivePurchaseOrder = (orderId: string) => {
    const order = data.purchaseOrders.find(item => item.id === orderId);
    if (!order || order.status === 'received') return;
    const value = sum(order.lines.map(line => (line.quantity - line.received) * line.unitCost));
    let next: AppData = {
      ...data,
      products: data.products.map(product => {
        const line = order.lines.find(item => item.productId === product.id);
        if (!line) return product;
        return {
          ...product,
          quantity: product.quantity + Math.max(0, line.quantity - line.received),
          costPrice: weightedAverageUnitCost(product.quantity, product.costPrice, Math.max(0, line.quantity - line.received), line.unitCost),
          updatedAt: today(),
        };
      }),
      purchaseOrders: data.purchaseOrders.map(item => item.id === orderId ? {
        ...item, status: 'received', lines: item.lines.map(line => ({ ...line, received: line.quantity })),
      } : item),
      suppliers: data.suppliers.map(supplier => supplier.id === order.supplierId ? { ...supplier, balance: supplier.balance + value } : supplier),
      journal: recordJournal(data, 'Inventory', 'Accounts payable', value, 'Goods received · ' + order.number, order.number),
      events: [{
        id: makeId('EVT'), time: new Date().toISOString(), type: 'purchase_order.received',
        source: 'Procurement', status: 'delivered', reference: order.number,
        detail: 'Goods received and supplier payable posted',
      }, ...data.events],
    };
    setData(next);
    notify('Goods received', order.number + ' updated inventory and accounts payable.');
  };

  const paySupplier = (supplierId: string, amount: number) => {
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
    setData(current => ({ ...current, profile }));
    notify('Business profile updated', 'Changes have been saved to this browser.');
  };

  const resetDemo = () => {
    if (!window.confirm('Reset this browser to the original Hesabu demo workspace? Current local demo changes will be lost.')) return;
    const fresh = makeDemoData();
    setData(fresh);
    setDialog(null);
    notify('Demo workspace reset', 'The original sample records have been restored.');
  };

  const copyText = (value: string) => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(value).then(() => notify('Copied to clipboard')).catch(() => notify('Copy not available', 'Select the text manually in this browser.'));
    } else notify('Copy not available', 'Select the text manually in this browser.');
  };

  const activeMeta = moduleMeta[active];
  return <div className={'app-shell ' + (sidebarCollapsed ? 'sidebar-is-collapsed' : '')}>
    <aside className={'sidebar ' + (mobileMenuOpen ? 'sidebar-mobile-open' : '')}>
      <div className="brand-row">
        <div className="brand-mark">H</div>
        {!sidebarCollapsed && <div className="brand-text"><strong>hesabu<span>.</span></strong><small>Business operating system</small></div>}
        <button className="sidebar-collapse" onClick={() => setSidebarCollapsed(value => !value)} aria-label="Collapse navigation"><PanelLeftClose size={16} /></button>
      </div>
      <button className="workspace-switcher" onClick={() => navigate('settings')}>
        <span className="workspace-avatar"><Store size={15} /></span>
        {!sidebarCollapsed && <><span className="workspace-name"><strong>{data.profile.name}</strong><small>{data.profile.industry}</small></span><ChevronDown size={14} /></>}
      </button>
      <nav className="sidebar-nav">
        {NAV_GROUPS.map(group => <div className="nav-group" key={group.title}>
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
        <div className="sidebar-help"><div><ShieldCheck size={16} /><strong>Records in one place</strong></div><p>Sales, stock and cash movement stay connected in the same workspace.</p><button onClick={() => navigate('integrations')}>Explore integrations <ArrowRight size={12} /></button></div>
        <div className="sidebar-profile" onClick={() => navigate('settings')} role="button" tabIndex={0}>
          <Initials name={data.profile.name} /><span><strong>{data.profile.name}</strong><small>Demo workspace</small></span><MoreHorizontal size={17} />
        </div>
      </div>}
    </aside>

    {mobileMenuOpen && <button className="mobile-menu-scrim" aria-label="Close navigation" onClick={() => setMobileMenuOpen(false)} />}
    <main className="main-shell">
      <header className="topbar">
        <div className="topbar-left">
          <IconButton label="Open navigation" className="mobile-menu-button" onClick={() => setMobileMenuOpen(value => !value)}><Menu size={19} /></IconButton>
          <div className="breadcrumb"><span>Workspace</span><ChevronRight size={13} /><strong>{activeMeta.title}</strong></div>
        </div>
        <div className="topbar-right">
          <div className={'global-search ' + (searchOpen ? 'global-search-open' : '')}><Search size={15} /><input value={search} onFocus={() => setSearchOpen(true)} onBlur={() => setTimeout(() => setSearchOpen(false), 150)} onChange={event => setSearch(event.target.value)} placeholder="Search this register…" /></div>
          <span className="topbar-divider" />
          <button className="topbar-date" onClick={() => notify('Workspace date', dateLabel(today()))}><CalendarDays size={15} /> <span>{dateLabel(today())}</span></button>
          <button className="notification-button" onClick={() => notify('Operational attention', data.products.filter(product => product.quantity <= product.reorderLevel).length + ' stock items are at or below reorder level.')}><Bell size={17} /><i /></button>
          <button className="topbar-avatar" onClick={() => navigate('settings')}><Initials name={data.profile.name} /></button>
        </div>
      </header>

      <div className="page-container">
        {active === 'overview' && <OverviewPage data={data} metrics={metrics} onCreateSale={() => setDialog({ kind: 'sale' })} onNavigate={navigate} onSelectInvoice={setSelectedInvoiceId} onRecordExpense={() => setDialog({ kind: 'expense' })} />}
        {active === 'sales' && <SalesPage data={data} search={search} onSearch={setSearch} onCreateSale={() => setDialog({ kind: 'sale' })} onSelectInvoice={setSelectedInvoiceId} />}
        {active === 'payments' && <PaymentsPage data={data} metrics={metrics} search={search} onSearch={setSearch} onRequestPayment={() => setDialog({ kind: 'stk' })} onResolvePayment={resolvePayment} onAddReceipt={() => setDialog({ kind: 'receipt' })} onMatchReceipt={receiptId => setDialog({ kind: 'match-receipt', receiptId })} />}
        {active === 'inventory' && <InventoryPage data={data} search={search} onSearch={setSearch} onAddProduct={() => setDialog({ kind: 'product' })} onAdjust={productId => setDialog({ kind: 'adjust', productId })} />}
        {active === 'procurement' && <ProcurementPage data={data} onCreatePurchase={() => setDialog({ kind: 'purchase' })} onReceiveOrder={receivePurchaseOrder} onPaySupplier={supplierId => setDialog({ kind: 'supplier-payment', supplierId })} />}
        {active === 'accounts' && <AccountsPage data={data} metrics={metrics} />}
        {active === 'reports' && <ReportsPage data={data} metrics={metrics} />}
        {active === 'integrations' && <IntegrationsPage data={data} onCopy={copyText} onNotice={notify} />}
        {active === 'settings' && <SettingsPage profile={data.profile} onSave={saveProfile} onReset={resetDemo} onNotice={notify} />}
      </div>
      <footer className="app-footer"><span>Hesabu · Business in balance</span><span><i /> Demo workspace · Local records only</span></footer>
    </main>

    <nav className="mobile-bottom-nav">
      {[
        { id: 'overview' as ModuleKey, label: 'Home', icon: LayoutDashboard },
        { id: 'sales' as ModuleKey, label: 'Sales', icon: Receipt },
        { id: 'payments' as ModuleKey, label: 'Money', icon: Wallet },
        { id: 'inventory' as ModuleKey, label: 'Stock', icon: Package },
        { id: 'procurement' as ModuleKey, label: 'Orders', icon: ShoppingCart },
      ].map(item => {
        const Icon = item.icon;
        return <button key={item.id} className={active === item.id ? 'active' : ''} onClick={() => navigate(item.id)}><Icon size={18} /><span>{item.label}</span></button>;
      })}
    </nav>

    {dialog?.kind === 'sale' && <SaleDialog products={data.products} onClose={() => setDialog(null)} onCreate={createInvoice} />}
    {dialog?.kind === 'stk' && <StkDialog invoices={data.invoices} initialInvoiceId={dialog.invoiceId} onClose={() => setDialog(null)} onCreate={createPaymentRequest} />}
    {dialog?.kind === 'receipt' && <ReceiptDialog onClose={() => setDialog(null)} onCreate={addUnmatchedReceipt} />}
    {dialog?.kind === 'match-receipt' && selectedReceipt && <MatchReceiptDialog receipt={selectedReceipt} invoices={data.invoices} onClose={() => setDialog(null)} onMatch={invoiceId => matchUnmatchedReceipt(selectedReceipt.id, invoiceId)} />}
    {dialog?.kind === 'expense' && <ExpenseDialog onClose={() => setDialog(null)} onCreate={createExpense} />}
    {dialog?.kind === 'product' && <ProductDialog onClose={() => setDialog(null)} onCreate={createProduct} />}
    {dialog?.kind === 'purchase' && <PurchaseDialog suppliers={data.suppliers} products={data.products} onClose={() => setDialog(null)} onCreate={createPurchaseOrder} />}
    {dialog?.kind === 'supplier-payment' && selectedSupplier && <SupplierPaymentDialog supplier={selectedSupplier} onClose={() => setDialog(null)} onPay={amount => paySupplier(selectedSupplier.id, amount)} />}
    {dialog?.kind === 'adjust' && selectedProduct && <AdjustStockDialog product={selectedProduct} onClose={() => setDialog(null)} onAdjust={(quantity, reason) => adjustStock(selectedProduct.id, quantity, reason)} />}
    {selectedInvoice && <InvoiceDialog invoice={selectedInvoice} onClose={() => setSelectedInvoiceId(null)} onRequestPayment={() => {
      setSelectedInvoiceId(null);
      setDialog({ kind: 'stk', invoiceId: selectedInvoice.id });
    }} />}
    {notice && <div className="toast" role="status"><CheckCircle2 size={17} /><span><strong>{notice.title}</strong>{notice.detail && <small>{notice.detail}</small>}</span><button onClick={closeNotice} aria-label="Dismiss notification"><X size={15} /></button></div>}
  </div>;
}

export default App;
