import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowDownLeft, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, CalendarDays,
  Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, ClipboardList,
  FileSpreadsheet, FileText, HandCoins, Headphones, House, Mic, Mic2, MoreHorizontal, Package, Plus,
  Download, ReceiptText, RotateCcw, Search, Settings2, Share2, SlidersHorizontal, Sparkles, Store, Upload,
  Trash2, TrendingDown, TrendingUp, Users,
  Wallet, X, type LucideIcon,
} from 'lucide-react';
import { hasSavedData, makeDemoData, readSavedData, saveData } from './data';
import type { AppData, Customer, Reminder, Section, StockItem, Transaction, TransactionDraft, TransactionType } from './types';
import { addDays, buildReport, cashIn, cashOut, creditGiven, currentTime, dateText, daysUntil, fullDateText, id, money, parseTransaction, shortDay, timeText, today, transactionLabel } from './utils';

const NAV: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'debts', label: 'Customers', icon: Users },
  { id: 'stock', label: 'Inventory', icon: Package },
  { id: 'reports', label: 'Reports', icon: FileText },
];

const TYPE_META: Record<TransactionType, { label: string; swahili: string; icon: LucideIcon; hint: string }> = {
  sale: { label: 'Cash sale', swahili: 'Mauzo', icon: ArrowDownLeft, hint: 'Cash or M-Pesa received' },
  credit: { label: 'Credit given', swahili: 'Deni', icon: HandCoins, hint: 'Someone takes goods and pays later' },
  expense: { label: 'Expense', swahili: 'Expenses', icon: ArrowUpRight, hint: 'Stock, bills or day-to-day costs' },
  payment: { label: 'Debt payment', swahili: 'Malipo ya deni', icon: Wallet, hint: 'A customer pays what they owe' },
};

const TYPE_TONE: Record<TransactionType, string> = {
  sale: 'tone-green', credit: 'tone-amber', expense: 'tone-red', payment: 'tone-blue',
};

type ModalState =
  | { kind: 'customer'; customer?: Customer }
  | { kind: 'payment'; customerId: string }
  | { kind: 'stock'; item?: StockItem }
  | { kind: 'stock-update'; itemId: string; mode: 'restock' | 'adjust' }
  | { kind: 'stock-edit'; itemId: string }
  | { kind: 'reminder'; reminder?: Reminder }
  | { kind: 'profile' }
  | { kind: 'edit-draft' }
  | { kind: 'transaction'; transactionId: string }
  | { kind: 'edit-transaction'; transactionId: string }
  | { kind: 'settings' }
  | null;

function cn(...classes: Array<string | undefined | null | false>) { return classes.filter(Boolean).join(' '); }

function Logo({ compact = false }: { compact?: boolean }) {
  return <div className="flex min-w-0 items-center gap-3">
    <div className="brand-mark" aria-hidden="true"><svg viewBox="0 0 40 40" fill="none"><path d="M9 9v22M9 20h22M31 9v22" stroke="currentColor" strokeWidth="4.1" strokeLinecap="round"/><circle cx="31" cy="9" r="3.2" fill="#F3AC63" /></svg></div>
    {!compact && <div className="min-w-0"><div className="font-display text-[18px] font-extrabold tracking-[-.055em] text-hesabu-ink">hesabu<span className="text-hesabu-green">.</span></div><div className="-mt-0.5 text-[10px] font-medium tracking-[.03em] text-hesabu-muted">Business, in balance.</div></div>}
  </div>;
}

function SectionTitle({ eyebrow, title, detail, right }: { eyebrow?: string; title: string; detail?: string; right?: ReactNode }) {
  return <div className="mb-6 flex items-end justify-between gap-4">
    <div className="min-w-0">
      {eyebrow && <div className="mb-2 text-[10px] font-bold uppercase tracking-[.16em] text-hesabu-green">{eyebrow}</div>}
      <h1 className="font-display text-[26px] font-extrabold leading-[1.12] tracking-[-.045em] text-hesabu-ink sm:text-[30px]">{title}</h1>
      {detail && <p className="mt-2 max-w-xl text-[13px] leading-5 text-hesabu-muted">{detail}</p>}
    </div>
    {right && <div className="shrink-0">{right}</div>}
  </div>;
}

function Button({ children, variant = 'primary', size = 'md', className, disabled, onClick, type = 'button' }: {
  children: ReactNode; variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'; size?: 'sm' | 'md' | 'lg';
  className?: string; disabled?: boolean; onClick?: () => void; type?: 'button' | 'submit';
}) {
  return <button type={type} disabled={disabled} onClick={onClick} className={cn('btn', `btn-${variant}`, `btn-${size}`, className)}>{children}</button>;
}

function Field({ label, value, onChange, placeholder, type = 'text', min, step, required, help, autoFocus, inputMode }: {
  label: string; value: string | number; onChange: (value: string) => void; placeholder?: string; type?: string;
  min?: number; step?: number; required?: boolean; help?: string; autoFocus?: boolean; inputMode?: 'text' | 'decimal' | 'numeric' | 'tel' | 'search';
}) {
  return <label className="field-wrap block">
    <span className="field-label">{label}</span>
    <input className="field-control" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} type={type} min={min} step={step} required={required} autoFocus={autoFocus} inputMode={inputMode} />
    {help && <span className="mt-1.5 block text-[11px] leading-4 text-hesabu-muted">{help}</span>}
  </label>;
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return <label className="field-wrap block">
    <span className="field-label">{label}</span>
    <select className="field-control" value={value} onChange={e => onChange(e.target.value)}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
  </label>;
}

function Modal({ title, detail, onClose, children, size = 'md' }: { title: string; detail?: string; onClose: () => void; children: ReactNode; size?: 'md' | 'lg' }) {
  useEffect(() => {
    const handle = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handle);
    document.body.classList.add('modal-open');
    return () => { window.removeEventListener('keydown', handle); document.body.classList.remove('modal-open'); };
  }, [onClose]);
  return <div className="modal-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-label={title} className={cn('modal-panel', size === 'lg' && 'modal-panel-lg')}>
      <header className="mb-5 flex items-start justify-between gap-4 border-b border-hesabu-line pb-4">
        <div><h2 className="font-display text-xl font-extrabold tracking-[-.04em]">{title}</h2>{detail && <p className="mt-1.5 text-[12px] leading-5 text-hesabu-muted">{detail}</p>}</div>
        <button className="icon-button -mr-1 -mt-1" onClick={onClose} aria-label="Close dialog"><X size={19} /></button>
      </header>
      {children}
    </section>
  </div>;
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onClose, 2600);
    return () => window.clearTimeout(timer);
  }, [message, onClose]);
  if (!message) return null;
  return <div className="toast" role="status"><CheckCircle2 size={17} /><span>{message}</span></div>;
}

function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon"><ClipboardList size={23} /></div><div className="mt-3 font-display text-base font-bold">{title}</div><p className="mt-1 max-w-[260px] text-xs leading-5 text-hesabu-muted">{detail}</p>{action && <div className="mt-4">{action}</div>}</div>;
}

function ToneDot({ type }: { type: TransactionType }) {
  const Icon = TYPE_META[type].icon;
  return <div className={cn('transaction-icon', TYPE_TONE[type])}><Icon size={17} strokeWidth={1.8} /></div>;
}

function TransactionRow({ transaction, onClick, onDelete, compact = false }: { transaction: Transaction; onClick: () => void; onDelete: () => void; compact?: boolean }) {
  const prefix = transaction.type === 'expense' ? '−' : transaction.type === 'credit' ? '' : '+';
  return <div className={cn('transaction-row group', compact && 'transaction-row-compact')}>
    <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={onClick}>
      <ToneDot type={transaction.type} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-bold leading-[1.35] text-hesabu-ink">{transaction.customerName && transaction.type === 'credit' ? `${transaction.customerName} · ${transaction.description}` : transaction.description}</span>
        <span className="mt-1 block truncate text-[10px] font-medium text-hesabu-muted">{timeText(transaction.time)} <span className="mx-1 text-[#CAD0CA]">·</span> {transactionLabel[transaction.type]}</span>
      </span>
      <span className="ml-2 shrink-0 text-right">
        <span className={cn('block text-[13px] font-bold tabular-nums', `amount-${transaction.type}`)}>{prefix}{money(transaction.amount)}</span>
        {transaction.type === 'credit' && <span className="mt-1 block text-[9px] font-semibold uppercase tracking-[.06em] text-[#A47731]">On credit</span>}
      </span>
    </button>
    <button className="transaction-delete" onClick={onDelete} aria-label={`Delete ${transaction.description}`} title="Delete transaction"><Trash2 size={14} /></button>
  </div>;
}

function Metric({ label, value, hint, tone, icon: Icon }: { label: string; value: number; hint: string; tone: 'green' | 'red' | 'amber'; icon: LucideIcon }) {
  return <div className="metric-card">
    <div className="flex items-center justify-between gap-2"><span className="text-[11px] font-semibold text-[#69776D]">{label}</span><span className={cn('metric-icon', `metric-${tone}`)}><Icon size={15} /></span></div>
    <div className={cn('mt-3 font-display text-[22px] font-extrabold leading-none tracking-[-.055em] tabular-nums sm:text-[24px]', tone === 'red' ? 'text-[#B94C46]' : tone === 'amber' ? 'text-[#A4762A]' : 'text-hesabu-green')}>{money(value)}</div>
    <div className="mt-2 text-[10px] font-medium text-[#89948B]">{hint}</div>
  </div>;
}

function ActivityProgress({ transactions }: { transactions: Transaction[] }) {
  const sales = transactions.filter(t => t.type === 'sale').length;
  const credits = transactions.filter(t => t.type === 'credit').length;
  const expenses = transactions.filter(t => t.type === 'expense').length;
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-hesabu-line pt-3 text-[10px] font-semibold text-hesabu-muted">
    <span className="inline-flex items-center gap-1.5"><span className="legend-dot bg-[#1A7A4A]" />{sales} sales</span>
    <span className="inline-flex items-center gap-1.5"><span className="legend-dot bg-[#C89A43]" />{credits} credit</span>
    <span className="inline-flex items-center gap-1.5"><span className="legend-dot bg-[#D56A63]" />{expenses} expenses</span>
  </div>;
}

function ReminderLine({ reminder, onDone, onEdit }: { reminder: Reminder; onDone: () => void; onEdit: () => void }) {
  const days = daysUntil(reminder.dueDate);
  const due = days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : `Due ${shortDay(reminder.dueDate)}`;
  const Icon = reminder.kind === 'bill' ? ReceiptText : reminder.kind === 'supplier' ? Store : reminder.kind === 'customer' ? Users : Bell;
  return <div className={cn('reminder-row', reminder.done && 'opacity-55')}>
    <div className={cn('reminder-icon', days <= 1 && !reminder.done ? 'reminder-icon-due' : '')}><Icon size={16} /></div>
    <div className="min-w-0 flex-1"><div className="truncate text-[12px] font-bold">{reminder.title}</div><div className="mt-1 text-[10px] text-hesabu-muted">{reminder.amount ? `${money(reminder.amount)} · ` : ''}{due}</div></div>
    <button className="icon-button !h-7 !w-7" onClick={onEdit} title="Edit reminder" aria-label={`Edit reminder: ${reminder.title}`}><Settings2 size={13} /></button>{reminder.done ? <button className="tiny-done" onClick={onDone} title="Reopen reminder" aria-label={`Reopen reminder: ${reminder.title}`}><RotateCcw size={13} /></button> : <button className="tiny-done" onClick={onDone} title="Mark as done" aria-label={`Mark reminder as done: ${reminder.title}`}><Check size={14} /></button>}
  </div>;
}

function StockStatus({ item }: { item: StockItem }) {
  const critical = item.quantity <= Math.max(1, Math.floor(item.lowStockAt / 2));
  const low = item.quantity <= item.lowStockAt;
  const label = critical ? 'Almost out' : low ? 'Running low' : 'In stock';
  return <span className={cn('stock-status', critical ? 'stock-critical' : low ? 'stock-low' : 'stock-good')}><span className="status-led" />{label}</span>;
}

function App() {
  const [data, setData] = useState<AppData>(() => readSavedData());
  const [showWelcome, setShowWelcome] = useState(() => !hasSavedData());
  const [section, setSection] = useState<Section>('home');
  const [modal, setModal] = useState<ModalState>(null);
  const [pending, setPending] = useState<TransactionDraft | null>(null);
  const [quickText, setQuickText] = useState('');
  const [voiceState, setVoiceState] = useState<'idle' | 'listening' | 'unsupported'>('idle');
  const voiceLanguage = 'en-KE';
  const [typeChoice, setTypeChoice] = useState<TransactionType | 'auto'>('auto');
  const [query, setQuery] = useState('');
  const [debtDirection, setDebtDirection] = useState<'owed-to-us' | 'we-owe'>('owed-to-us');
  const [reportPeriod, setReportPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [reportDate, setReportDate] = useState(today());
  const [showAllTransactions, setShowAllTransactions] = useState(false);
  const [showAllReminders, setShowAllReminders] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [filterTransactions, setFilterTransactions] = useState<'all' | TransactionType>('all');
  const [transactionSearch, setTransactionSearch] = useState('');
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  useEffect(() => { if (!showWelcome) saveData(data); }, [data, showWelcome]);

  const notify = (message: string) => setToastMessage(message);
  const closeToast = () => setToastMessage('');
  const closeModal = () => setModal(null);
  const updateData = (updater: (current: AppData) => AppData) => setData(current => updater(current));

  const chooseDemo = () => {
    const demo = makeDemoData();
    setData(demo); saveData(demo); setShowWelcome(false); setSection('home');
  };
  const createLocalShop = (values: { name: string; owner: string; phone: string; businessType: string }) => {
    const fresh: AppData = {
      shopInfo: { name: values.name.trim(), owner: values.owner.trim(), phone: values.phone.trim(), businessType: values.businessType },
      transactions: [], customers: [], stock: [], reminders: [],
    };
    setData(fresh); saveData(fresh); setShowWelcome(false); setSection('home');
  };

  const todayTransactions = useMemo(() => data.transactions.filter(t => t.date === today()), [data.transactions]);
  const todaysIn = useMemo(() => cashIn(todayTransactions), [todayTransactions]);
  const todaysOut = useMemo(() => cashOut(todayTransactions), [todayTransactions]);
  const todaysCredit = useMemo(() => creditGiven(todayTransactions), [todayTransactions]);
  const outstanding = useMemo(() => data.customers.filter(c => c.balance > 0).reduce((sum, c) => sum + c.balance, 0), [data.customers]);
  const lowStock = useMemo(() => data.stock.filter(s => s.quantity <= s.lowStockAt), [data.stock]);
  const allReminders = useMemo(() => [...data.reminders].sort((a, b) => a.dueDate.localeCompare(b.dueDate)), [data.reminders]);
  const activeReminders = useMemo(() => allReminders.filter(r => !r.done), [allReminders]);
  const report = useMemo(() => buildReport(data, reportPeriod, reportDate), [data, reportPeriod, reportDate]);

  const navigate = (next: Section) => {
    setSection(next); setQuery(''); setPending(null); setProfileMenuOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const applyTransaction = (draft: TransactionDraft) => {
    let createdName = draft.customerName?.trim();
    const current = data;
    let nextCustomers = [...current.customers];
    let customer = createdName ? nextCustomers.find(c => c.name.toLowerCase() === createdName?.toLowerCase()) : undefined;
    if ((draft.type === 'credit' || draft.type === 'payment') && createdName && !customer) {
      customer = { id: id('person'), name: createdName, phone: '', balance: 0, dueDate: draft.dueDate, kind: 'customer' };
      nextCustomers = [customer, ...nextCustomers];
    }
    if (customer) {
      const balanceDelta = draft.type === 'credit' ? draft.amount : draft.type === 'payment' ? -draft.amount : 0;
      // Keep any overpayment visible as customer credit instead of silently discarding it.
      nextCustomers = nextCustomers.map(c => c.id === customer?.id ? { ...c, balance: c.balance + balanceDelta, dueDate: draft.type === 'credit' ? draft.dueDate : c.dueDate } : c);
    }
    const matchedStock = draft.stockItemName ? current.stock.find(s => s.name.toLowerCase() === draft.stockItemName?.toLowerCase()) : undefined;
    const txn: Transaction = {
      id: id('txn'), type: draft.type, description: draft.description.trim() || draft.summary,
      amount: Math.max(0, Math.round(draft.amount)), date: today(), time: currentTime(),
      customerId: customer?.id, customerName: createdName, dueDate: draft.dueDate,
      stockItemId: matchedStock?.id, stockQuantityDelta: draft.stockQuantityDelta,
      category: draft.category,
    };
    const effectiveStockDelta = matchedStock && draft.stockQuantityDelta !== undefined && draft.stockQuantityDelta < 0
      ? -Math.min(matchedStock.quantity, Math.abs(draft.stockQuantityDelta))
      : draft.stockQuantityDelta;
    txn.stockQuantityDelta = effectiveStockDelta;
    const nextStock = matchedStock && effectiveStockDelta !== undefined
      ? current.stock.map(s => s.id === matchedStock.id ? { ...s, quantity: Math.max(0, s.quantity + effectiveStockDelta), lastRestocked: effectiveStockDelta > 0 ? today() : s.lastRestocked } : s)
      : current.stock;
    updateData(c => ({ ...c, customers: nextCustomers, stock: nextStock, transactions: [txn, ...c.transactions] }));
    setPending(null); setQuickText(''); setTypeChoice('auto');
    notify('Imeandikwa. Record saved.');
    if (navigator.vibrate) navigator.vibrate(18);
  };

  const handleQuickSubmit = (event?: FormEvent) => {
    event?.preventDefault();
    const parsed = parseTransaction(quickText, data);
    if (!parsed) { notify('Add the amount so Hesabu can record it.'); return; }
    if (typeChoice !== 'auto') {
      parsed.type = typeChoice;
      if (typeChoice === 'credit' && !parsed.dueDate) parsed.dueDate = addDays(today(), 7);
      const typeName = TYPE_META[typeChoice].label.toLowerCase();
      parsed.summary = `${typeName}${parsed.customerName ? ` for ${parsed.customerName}` : ''} — ${money(parsed.amount)}`;
      if (parsed.stockItemName && (typeChoice === 'sale' || typeChoice === 'credit')) parsed.stockQuantityDelta = -(parsed.stockQuantityDelta ? Math.abs(parsed.stockQuantityDelta) : 1);
      else if (typeChoice === 'expense' && parsed.stockQuantityDelta !== undefined && parsed.stockQuantityDelta < 0) parsed.stockQuantityDelta = undefined;
      else if (typeChoice === 'payment') parsed.stockQuantityDelta = undefined;
    }
    if (parsed.type === 'credit' && !parsed.customerName) {
      const name = quickText.trim().match(/\b([A-Z][a-z]{2,})\b/)?.[1];
      if (name && !['I', 'Bought', 'Supplier', 'Cash', 'Sale'].includes(name)) parsed.customerName = name;
    }
    setPending(parsed);
  };

  const startVoice = () => {
    const Recognition = (window as Window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition
      ?? (window as Window & { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
    if (!Recognition) { setVoiceState('unsupported'); notify('Voice typing is not available in this browser. Type the transaction instead.'); return; }
    try {
      const recognition = new Recognition();
      recognition.lang = voiceLanguage; recognition.interimResults = false; recognition.maxAlternatives = 1;
      setVoiceState('listening');
      recognition.onresult = event => {
        const text = event.results?.[0]?.[0]?.transcript ?? '';
        setQuickText(text);
        setVoiceState('idle');
        const parsed = parseTransaction(text, data);
        if (parsed) setPending(parsed);
        else notify('I heard you, but could not find the amount. Check the words and try again.');
      };
      recognition.onerror = () => { setVoiceState('idle'); notify('Could not hear that clearly. Try again or type it.'); };
      recognition.onend = () => setVoiceState(s => s === 'listening' ? 'idle' : s);
      recognition.start();
    } catch { setVoiceState('idle'); notify('Microphone is unavailable. Type the transaction instead.'); }
  };

  const deleteTransaction = (transaction: Transaction) => {
    if (!window.confirm(`Remove “${transaction.description}” from the ledger?`)) return;
    updateData(current => {
      let customers = current.customers;
      if (transaction.customerId && (transaction.type === 'credit' || transaction.type === 'payment' || (transaction.type === 'expense' && (transaction.category === 'Supplier payment' || transaction.category === 'Customer refund')))) {
        const restore = transaction.type === 'credit' ? -transaction.amount : transaction.type === 'payment' ? transaction.amount : -transaction.amount;
        customers = customers.map(c => c.id === transaction.customerId ? { ...c, balance: c.balance + restore } : c);
      }
      const stock = transaction.stockItemId && transaction.stockQuantityDelta !== undefined
        ? current.stock.map(s => s.id === transaction.stockItemId ? { ...s, quantity: Math.max(0, s.quantity - transaction.stockQuantityDelta!) } : s)
        : current.stock;
      return { ...current, customers, stock, transactions: current.transactions.filter(t => t.id !== transaction.id) };
    });
    setModal(null); notify('Transaction removed.');
  };

  const saveTransactionEdit = (transaction: Transaction, values: { description: string; amount: string; date: string; time: string; dueDate: string }) => {
    const amount = Number(values.amount);
    if (!Number.isFinite(amount) || amount <= 0) { notify('Amount must be greater than zero.'); return; }
    if (!values.date || !values.time) { notify('Choose the date and time for this entry.'); return; }
    const updated: Transaction = {
      ...transaction,
      description: values.description.trim() || transaction.description,
      amount: Math.round(amount),
      date: values.date,
      time: values.time,
      dueDate: values.dueDate || undefined,
    };
    const balanceEffect = (tx: Transaction) => {
      if (tx.type === 'credit') return tx.amount;
      if (tx.type === 'payment') return -tx.amount;
      if (tx.type === 'expense' && (tx.category === 'Supplier payment' || tx.category === 'Customer refund')) return tx.amount;
      return 0;
    };
    const balanceAdjustment = balanceEffect(updated) - balanceEffect(transaction);
    updateData(current => ({
      ...current,
      customers: transaction.customerId && balanceAdjustment !== 0
        ? current.customers.map(c => c.id === transaction.customerId ? { ...c, balance: c.balance + balanceAdjustment } : c)
        : current.customers,
      transactions: current.transactions.map(tx => tx.id === transaction.id ? updated : tx),
    }));
    setModal(null);
    notify('Transaction details updated. Account balances were adjusted.');
  };

  const addCustomer = (values: { name: string; phone: string; balance: string; direction: 'owed-to-us' | 'we-owe'; kind: 'customer' | 'supplier'; dueDate: string; note: string }) => {
    const personName = values.name.trim();
    if (data.customers.some(c => c.name.trim().toLowerCase() === personName.toLowerCase())) { notify('A person with that name is already saved. Open their existing record instead.'); return; }
    const amount = Math.max(0, Number(values.balance) || 0);
    const record: Customer = { id: id('person'), name: values.name.trim(), phone: values.phone.trim(), balance: values.direction === 'owed-to-us' ? amount : -amount, kind: values.kind, dueDate: values.dueDate || undefined, note: values.note.trim() || undefined };
    updateData(current => ({ ...current, customers: [record, ...current.customers] }));
    setModal(null); notify('Contact added.');
  };

  const recordPayment = (customer: Customer, amountValue: string, note: string) => {
    const entered = Math.max(0, Number(amountValue) || 0);
    const supplierPayment = customer.kind === 'supplier' || (!customer.kind && customer.balance < 0);
    const refundingCustomerCredit = customer.kind === 'customer' && customer.balance < 0;
    const amount = supplierPayment || refundingCustomerCredit ? Math.min(Math.abs(customer.balance), entered) : entered;
    if (!amount) return;
    const txn: Transaction = { id: id('txn'), type: supplierPayment || refundingCustomerCredit ? 'expense' : 'payment', description: note.trim() || (supplierPayment ? 'Supplier payment' : refundingCustomerCredit ? 'Customer credit refund' : 'Debt payment received'), amount, date: today(), time: currentTime(), customerId: customer.id, customerName: customer.name, category: supplierPayment ? 'Supplier payment' : refundingCustomerCredit ? 'Customer refund' : undefined };
    updateData(current => ({ ...current, customers: current.customers.map(c => c.id === customer.id ? { ...c, balance: supplierPayment || refundingCustomerCredit ? Math.min(0, c.balance + amount) : c.balance - amount } : c), transactions: [txn, ...current.transactions] }));
    setModal(null); setSection('debts'); notify(`${money(amount)} ${supplierPayment ? 'paid to' : refundingCustomerCredit ? 'returned to' : 'received from'} ${customer.name}.`);
  };

  const saveStock = (values: { name: string; quantity: string; unit: string; threshold: string; cost: string }) => {
    const itemName = values.name.trim();
    if (data.stock.some(s => s.name.trim().toLowerCase() === itemName.toLowerCase())) { notify('That item is already tracked. Open its stock card to restock or adjust it.'); return; }
    const record: StockItem = { id: id('stock'), name: itemName, quantity: Math.max(0, Number(values.quantity) || 0), unit: values.unit.trim() || 'pcs', lowStockAt: Math.max(0, Number(values.threshold) || 0), lastRestocked: today(), costPerUnit: Number(values.cost) || undefined };
    updateData(current => ({ ...current, stock: [record, ...current.stock] }));
    setModal(null); notify(`${record.name} added to stock.`);
  };

  const saveStockDetails = (item: StockItem, values: { name: string; unit: string; threshold: string; cost: string }) => {
    const name = values.name.trim();
    if (!name) { notify('Enter a product name.'); return; }
    if (data.stock.some(s => s.id !== item.id && s.name.trim().toLowerCase() === name.toLowerCase())) { notify('Another stock item already uses that name.'); return; }
    updateData(current => ({ ...current, stock: current.stock.map(s => s.id === item.id ? {
      ...s,
      name,
      unit: values.unit.trim() || s.unit,
      lowStockAt: Math.max(0, Number(values.threshold) || 0),
      costPerUnit: values.cost.trim() ? Math.max(0, Number(values.cost) || 0) : undefined,
    } : s) }));
    setModal(null);
    notify(`${name} details updated.`);
  };

  const updateStock = (item: StockItem, amountValue: string, mode: 'restock' | 'adjust') => {
    const amount = Math.max(0, Number(amountValue) || 0);
    updateData(current => ({ ...current, stock: current.stock.map(s => s.id === item.id ? { ...s, quantity: mode === 'restock' ? s.quantity + amount : amount, lastRestocked: mode === 'restock' ? today() : s.lastRestocked } : s) }));
    setModal(null); notify(mode === 'restock' ? `${item.name} stock updated.` : `${item.name} quantity adjusted.`);
  };

  const saveReminder = (values: { title: string; detail: string; amount: string; dueDate: string; kind: Reminder['kind'] }, existing?: Reminder) => {
    const reminder: Reminder = { id: existing?.id ?? id('rem'), title: values.title.trim(), detail: values.detail.trim(), amount: values.amount.trim() ? Math.max(0, Number(values.amount) || 0) : undefined, dueDate: values.dueDate || today(), kind: values.kind, done: existing?.done ?? false };
    updateData(current => ({ ...current, reminders: existing ? current.reminders.map(r => r.id === existing.id ? reminder : r) : [reminder, ...current.reminders] }));
    setModal(null); notify(existing ? 'Reminder updated.' : 'Reminder added.');
  };

  const deleteReminder = (reminder: Reminder) => {
    if (!window.confirm(`Delete reminder “${reminder.title}”? This cannot be undone.`)) return;
    updateData(current => ({ ...current, reminders: current.reminders.filter(r => r.id !== reminder.id) }));
    setModal(null); notify('Reminder deleted.');
  };

  const toggleReminder = (reminder: Reminder) => {
    updateData(current => ({ ...current, reminders: current.reminders.map(r => r.id === reminder.id ? { ...r, done: !r.done } : r) }));
    notify(reminder.done ? 'Reminder reopened.' : 'Marked as done.');
  };

  const shareReport = async () => {
    const url = `https://wa.me/?text=${encodeURIComponent(report.text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(report.text);
      notify('Report copied to clipboard.');
    } catch {
      const textarea = document.createElement('textarea'); textarea.value = report.text; document.body.appendChild(textarea); textarea.select();
      const ok = document.execCommand('copy'); textarea.remove(); notify(ok ? 'Report copied to clipboard.' : 'Copy is not available in this browser.');
    }
  };

  const updateProfile = (name: string, owner: string, phone: string, businessType: string) => {
    updateData(current => ({ ...current, shopInfo: { name: name.trim(), owner: owner.trim(), phone: phone.trim(), businessType } }));
    setModal(null); notify('Shop details saved.');
  };

  const resetDemo = () => {
    if (!window.confirm('Reset this browser to the original Mama Grace demo ledger? Your saved changes will be lost.')) return;
    const original = makeDemoData(); setData(original); saveData(original); setModal(null); setSection('home'); notify('Demo ledger reset.');
  };

  const downloadFile = (filename: string, contents: string, mimeType: string) => {
    const blob = new Blob([contents], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = filename;
    document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1200);
  };
  const exportBackup = () => {
    downloadFile(`hesabu-backup-${today()}.json`, JSON.stringify(data, null, 2), 'application/json');
    notify('Backup downloaded. Keep it somewhere safe.');
  };
  const exportCsv = () => {
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = [['Date', 'Time', 'Type', 'Description', 'Amount KES', 'Person', 'Due date', 'Category'], ...data.transactions.map(t => [t.date, t.time, t.type, t.description, t.amount, t.customerName ?? '', t.dueDate ?? '', t.category ?? ''])];
    downloadFile(`hesabu-transactions-${today()}.csv`, rows.map(row => row.map(escape).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
    notify('Transactions exported to CSV.');
  };
  const importBackup = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as Partial<AppData>;
      if (!parsed.shopInfo || typeof parsed.shopInfo.name !== 'string' || !Array.isArray(parsed.transactions) || !Array.isArray(parsed.customers) || !Array.isArray(parsed.stock)) throw new Error('invalid backup');
      if (!window.confirm('Restore this backup and replace the data in this browser?')) return;
      const backup: AppData = { ...makeDemoData(), ...parsed, shopInfo: { ...makeDemoData().shopInfo, ...parsed.shopInfo }, customers: parsed.customers.map(c => ({ ...c, kind: c.kind ?? (c.balance < 0 ? 'supplier' as const : 'customer' as const) })), transactions: parsed.transactions, stock: parsed.stock, reminders: Array.isArray(parsed.reminders) ? parsed.reminders : [] };
      setData(backup); saveData(backup); setModal(null); notify('Backup restored successfully.');
    } catch { notify('That file does not look like a Hesabu backup. Nothing was changed.'); }
  };

  const editDraft = (values: { type: TransactionType; description: string; amount: string; customerName: string; dueDate: string; stockItemName: string }) => {
    if (!pending) return;
    const item = data.stock.find(s => s.name === values.stockItemName);
    const amount = Math.max(0, Number(values.amount) || 0);
    const next: TransactionDraft = {
      ...pending, type: values.type, description: values.description.trim(), amount,
      customerName: values.customerName.trim() || undefined, dueDate: values.type === 'credit' ? values.dueDate || addDays(today(), 7) : undefined,
      stockItemName: item?.name,
      stockQuantityDelta: item ? (values.type === 'sale' || values.type === 'credit' ? -(pending.stockQuantityDelta ? Math.abs(pending.stockQuantityDelta) : 1) : values.type === 'expense' ? (pending.stockQuantityDelta && pending.stockQuantityDelta > 0 ? pending.stockQuantityDelta : undefined) : undefined) : undefined,
      summary: `${TYPE_META[values.type].label}${values.customerName ? ` for ${values.customerName}` : ''} — ${money(amount)}`,
    };
    setPending(next); setModal(null);
  };

  const sortedTransactions = useMemo(() => [...data.transactions].sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`)), [data.transactions]);
  const pendingStockItem = pending?.stockItemName ? data.stock.find(s => s.name.toLowerCase() === pending.stockItemName?.toLowerCase()) : undefined;
  const pendingStockExceedsCount = Boolean(pendingStockItem && pending?.stockQuantityDelta !== undefined && pending.stockQuantityDelta < 0 && Math.abs(pending.stockQuantityDelta) > pendingStockItem.quantity);

  return <div className="app-shell">
    <header className="app-header">
      <div className="header-inner">
        <button className="brand-button" onClick={() => navigate('home')} aria-label="Hesabu home"><Logo /></button>
        <nav className="desktop-nav" aria-label="Main navigation">
          {NAV.map(item => { const Icon = item.icon; return <button key={item.id} onClick={() => navigate(item.id)} className={cn('nav-link', section === item.id && 'nav-link-active')}><Icon size={16} strokeWidth={1.9} />{item.label}</button>; })}
        </nav>
        <div className="header-tools">
          <div className="hidden text-right sm:block"><div className="text-[11px] font-bold text-hesabu-ink">{shortDay(today())}</div><div className="mt-0.5 text-[10px] text-hesabu-muted">Local ledger</div></div>
          <button className="profile-chip" onClick={() => setProfileMenuOpen(v => !v)} aria-label="Shop settings"><span className="profile-avatar">{(data.shopInfo.owner || data.shopInfo.name || 'H').slice(0, 1).toUpperCase()}</span><ChevronDown size={14} className="text-hesabu-muted" /></button>
          {profileMenuOpen && <div className="profile-menu"><div className="border-b border-hesabu-line px-3 pb-3 pt-1"><div className="text-xs font-bold">{data.shopInfo.name}</div><div className="mt-1 text-[10px] text-hesabu-muted">{data.shopInfo.businessType}</div></div><button onClick={() => { setProfileMenuOpen(false); setModal({ kind: 'profile' }); }}><Settings2 size={15} /> Shop details</button><button onClick={() => { setProfileMenuOpen(false); setModal({ kind: 'settings' }); }}><SlidersHorizontal size={15} /> Preferences</button></div>}
        </div>
      </div>
    </header>

    <main className="app-main">
      {section === 'home' && <>

        <section className="welcome-row">
          <div><div className="eyebrow">{fullDateText()}</div><h1 className="welcome-title">Business overview</h1><p className="welcome-copy">{data.shopInfo.name} · {data.shopInfo.owner ? `Welcome, ${data.shopInfo.owner}` : 'Your daily overview'}</p></div>
          <button className="today-pill" onClick={() => { setReportDate(today()); setReportPeriod('daily'); navigate('reports'); }}><CalendarDays size={15}/><span>Today's report</span><ArrowRight size={13}/></button>
        </section>
        <section className="balance-panel" aria-label="Today's net cash position">
          <div className="balance-panel-copy"><span className="balance-eyebrow"><span className="balance-status"/> TODAY'S NET CASH</span><div className="balance-total">{money(todaysIn - todaysOut)}</div><div className="balance-caption">Cash received less expenses recorded today</div></div>
          <div className="balance-panel-bottom"><div><span>Money in</span><strong>+{money(todaysIn)}</strong></div><span className="balance-divider"/><div><span>Money out</span><strong>−{money(todaysOut)}</strong></div><button aria-label="Open financial reports" className="balance-view" onClick={() => navigate('reports')}><ArrowUpRight size={19}/></button></div>
        </section>
        <section className="action-panel" aria-label="Quick actions"><div className="action-panel-top"><strong>Quick actions</strong><span>Your everyday tools</span></div>
          <div className="quick-actions">
            <button onClick={() => {setTypeChoice('sale'); document.getElementById('transaction-entry')?.scrollIntoView({behavior:'smooth'});}}><span className="qa-icon qa-sale"><ArrowDownLeft size={21}/></span><span>Record sale</span></button>
            <button onClick={() => {setTypeChoice('expense'); document.getElementById('transaction-entry')?.scrollIntoView({behavior:'smooth'});}}><span className="qa-icon qa-expense"><ReceiptText size={21}/></span><span>Add expense</span></button>
            <button onClick={() => navigate('stock')}><span className="qa-icon qa-stock"><Package size={21}/></span><span>Inventory</span></button>
            <button onClick={() => navigate('reports')}><span className="qa-icon qa-reports"><FileSpreadsheet size={21}/></span><span>Reports</span></button>
            <button onClick={() => navigate('debts')}><span className="qa-icon qa-customers"><Users size={21}/></span><span>Customers</span></button>
            <button onClick={shareReport}><span className="qa-icon qa-whatsapp"><Share2 size={21}/></span><span>WhatsApp</span></button>
          </div>
        </section>
        <section className="metrics-grid" aria-label="Today's accounting summary">
          <Metric label="Cash sales" value={todayTransactions.filter(t => t.type === 'sale').reduce((sum,t) => sum + t.amount, 0)} hint="Sales paid today" tone="green" icon={TrendingUp}/>
          <Metric label="Expenses" value={todaysOut} hint="Money paid out" tone="red" icon={TrendingDown}/>
          <Metric label="Credit sales" value={todaysCredit} hint="Not yet collected" tone="amber" icon={HandCoins}/>
        </section>
        <div className="home-grid">
          <div className="home-primary">
            <section id="transaction-entry" className="surface log-surface">
              <div className="section-heading-row"><div><div className="eyebrow">QUICK ENTRY</div><h2 className="surface-title">Record a transaction</h2><p className="surface-subtitle">Record sales, expenses and payments in one place.</p></div><span className="keyboard-shortcut">FAST ENTRY</span></div>
              <div className="type-picker" role="group" aria-label="Transaction type">
                {(['auto', 'sale', 'credit', 'expense', 'payment'] as const).map(type => <button key={type} onClick={() => setTypeChoice(type)} className={cn('type-pick', typeChoice === type && 'type-pick-active')}>
                  {type === 'auto' ? <Sparkles size={15} /> : (() => { const Icon = TYPE_META[type].icon; return <Icon size={15} />; })()}
                  <span>{type === 'auto' ? 'Auto' : TYPE_META[type].label}</span>
                </button>)}
              </div>
              <form onSubmit={handleQuickSubmit}>
                <label className="quick-input-wrap"><span className="sr-only">Describe the transaction</span><input value={quickText} onChange={e => setQuickText(e.target.value)} placeholder="e.g. Sold groceries for KES 1,200" className="quick-input" /><button type="button" className={cn('mic-button', voiceState === 'listening' && 'mic-button-listening')} onClick={startVoice} aria-label="Record by voice">{voiceState === 'listening' ? <span className="listening-dot" /> : <Mic2 size={19} />}</button></label>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row"><Button type="submit" className="flex-1">Review transaction <ArrowRight size={16} /></Button><Button variant="secondary" onClick={() => { setQuickText(''); setPending(null); setTypeChoice('auto'); }} className="sm:!w-[100px]">Clear</Button></div>
              </form>
              
              <div className="helper-row"><span><CheckCircle2 size={13} /> Confirm before it’s saved</span><span className="helper-divider" /><span>English voice input where supported</span></div>
              {pending && <div className="draft-review" aria-live="polite">
                <div className="flex items-start gap-3"><div className="draft-check"><Check size={17} /></div><div className="min-w-0 flex-1"><div className="text-[10px] font-bold uppercase tracking-[.13em] text-hesabu-green">Review before saving</div><div className="mt-1 text-[13px] font-bold leading-5 text-hesabu-ink">{pending.summary}</div>{pending.type === 'credit' && <div className="mt-1 text-[11px] text-hesabu-muted">Due {dateText(pending.dueDate ?? addDays(today(), 7), { weekday: 'long', day: 'numeric', month: 'short' })}. This creates a receivable, not cash collected.</div>}{pending.stockQuantityDelta !== undefined && <div className="mt-1 text-[11px] text-hesabu-muted">Stock adjustment: {pending.stockQuantityDelta > 0 ? '+' : ''}{pending.stockQuantityDelta} {pending.stockItemName ?? 'item'}</div>}{pendingStockExceedsCount && pendingStockItem && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-[#8D6321]">Only <b>{pendingStockItem.quantity} {pendingStockItem.unit}</b> tracked. Saving will bring this item’s tracked count to zero. Use “Edit details” if the quantity or product is wrong.</div>}</div><button onClick={() => setPending(null)} className="icon-button !h-7 !w-7" aria-label="Dismiss review"><X size={14} /></button></div>
                <div className="mt-4 grid grid-cols-2 gap-2"><Button onClick={() => applyTransaction(pending)}><Check size={15} /> Confirm & save</Button><Button variant="outline" onClick={() => setModal({ kind: 'edit-draft' })}>Edit details</Button></div>
              </div>}
              <div className="voice-note"><Mic size={15} /><span>Try: “Njeri paid 500 towards her balance” or “Bought stock for 800”.</span></div>
            </section>

            <section className="surface activity-surface">
              <div className="section-heading-row"><div><h2 className="surface-title">Recent transactions</h2><p className="surface-subtitle">Your latest entries, in one place.</p></div><button className="text-action" onClick={() => { setShowAllTransactions(v => !v); setFilterTransactions('all'); }}>{showAllTransactions ? 'Show less' : 'View all'} <ArrowRight size={14} /></button></div>
              {showAllTransactions && <div className="mb-3 flex gap-2"><label className="search-field flex-1"><Search size={15} /><input value={transactionSearch} onChange={e => setTransactionSearch(e.target.value)} placeholder="Search transactions" /></label><select className="filter-select" value={filterTransactions} onChange={e => setFilterTransactions(e.target.value as 'all' | TransactionType)} aria-label="Filter transaction type"><option value="all">All</option>{Object.entries(TYPE_META).map(([type, meta]) => <option key={type} value={type}>{meta.label}</option>)}</select></div>}
              {sortedTransactions.length === 0 ? <EmptyState title="No entries yet" detail="Your transactions will appear here as soon as you log the first one." /> : <div className="divide-y divide-hesabu-line/80">{sortedTransactions.filter(t => !showAllTransactions || (filterTransactions === 'all' || t.type === filterTransactions)).filter(t => !showAllTransactions || `${t.description} ${t.customerName ?? ''}`.toLowerCase().includes(transactionSearch.toLowerCase())).slice(0, showAllTransactions ? 80 : 5).map(tx => <TransactionRow key={tx.id} transaction={tx} onClick={() => setModal({ kind: 'transaction', transactionId: tx.id })} onDelete={() => deleteTransaction(tx)} compact={!showAllTransactions} />)}</div>}
              <ActivityProgress transactions={todayTransactions} />
            </section>
          </div>

          <aside className="home-aside">
            <section className="surface aside-surface debt-summary">
              <div className="flex items-start justify-between gap-3"><div><div className="eyebrow">CREDIT BOOK</div><h2 className="surface-title mt-1">Customer balances</h2></div><span className="aside-icon"><Users size={18} /></span></div>
              <div className="mt-5 font-display text-[28px] font-extrabold tracking-[-.06em] text-hesabu-ink">{money(outstanding)}</div>
              <div className="mt-1 text-[11px] text-hesabu-muted">Owed to your shop by {data.customers.filter(c => c.balance > 0).length} people</div>
              <div className="mt-4 flex items-center justify-between border-t border-hesabu-line pt-3"><span className="text-[10px] font-semibold text-hesabu-muted">Oldest outstanding</span><span className="text-[11px] font-bold text-[#B96D3C]">{data.customers.filter(c => c.balance > 0 && c.dueDate).some(c => daysUntil(c.dueDate!) < 0) ? 'Needs follow-up' : 'On track'}</span></div>
              <Button variant="secondary" className="mt-4 w-full" onClick={() => navigate('debts')}>Manage balances <ArrowRight size={15} /></Button>
            </section>

            <section className="surface aside-surface">
              <div className="section-heading-row !items-start"><div><div className="eyebrow">DON’T FORGET</div><h2 className="surface-title mt-1">Upcoming</h2></div><button className="icon-button" onClick={() => setModal({ kind: 'reminder' })} aria-label="Add reminder"><Plus size={18} /></button></div>
              {(showAllReminders ? allReminders : activeReminders.slice(0, 3)).length ? <div className="mt-2">{(showAllReminders ? allReminders : activeReminders.slice(0, 3)).map(reminder => <ReminderLine key={reminder.id} reminder={reminder} onDone={() => toggleReminder(reminder)} onEdit={() => setModal({ kind: 'reminder', reminder })} />)}</div> : <p className="py-4 text-xs text-hesabu-muted">{allReminders.length ? 'You’re all caught up. Open all reminders to review completed items.' : 'No reminders yet. Add a bill or follow-up so it doesn’t get forgotten.'}</p>}
              <div className="mt-3 flex items-center justify-between border-t border-hesabu-line pt-3"><button onClick={() => setShowAllReminders(v => !v)} className="text-action">{showAllReminders ? 'Show fewer' : 'All reminders'} <ArrowRight size={13} /></button><button onClick={() => setModal({ kind: 'reminder' })} className="text-action">Add new <Plus size={13} /></button></div>
            </section>

            <section className="stock-callout">
              <div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-bold uppercase tracking-[.14em] text-[#A0C9AE]">STOCK CHECK</div><div className="mt-2 font-display text-[17px] font-bold text-white">{lowStock.length ? `${lowStock.length} items need a look` : 'Stock is looking good'}</div></div><div className="stock-callout-icon"><Package size={19} /></div></div>
              {lowStock.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{lowStock.slice(0, 3).map(s => <span key={s.id} className="stock-callout-chip">{s.name}</span>)}</div>}
              <button className="stock-callout-action" onClick={() => navigate('stock')}>View inventory <ArrowRight size={14} /></button>
            </section>
            <div className="privacy-note"><div className="privacy-lock"><Settings2 size={14} /></div><span><b>Your ledger stays on this device.</b><br />This prototype saves data in this browser only.</span></div>
          </aside>
        </div>
      </>}

      {section === 'debts' && <DebtsSection data={data} query={query} setQuery={setQuery} direction={debtDirection} setDirection={setDebtDirection} onAdd={() => setModal({ kind: 'customer' })} onPayment={customerId => setModal({ kind: 'payment', customerId })} onReminder={customer => { const text = `Hello ${customer.name}, this is a friendly reminder from ${data.shopInfo.name} regarding your balance of ${money(customer.balance)}. Please let us know when you expect to make payment. Thank you.`; const digits = customer.phone.replace(/\D/g, ''); const phone = digits.startsWith('0') ? `254${digits.slice(1)}` : digits.startsWith('254') ? digits : `254${digits}`; if (!/^254[17]\d{8}$/.test(phone)) { notify('Please add a valid Kenyan phone number for this customer.'); return; } window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer'); }} />}
      {section === 'stock' && <StockSection data={data} query={query} setQuery={setQuery} onAdd={() => setModal({ kind: 'stock' })} onEdit={itemId => setModal({ kind: 'stock-edit', itemId })} onUpdate={(itemId, mode) => setModal({ kind: 'stock-update', itemId, mode })} />}
      {section === 'reports' && <ReportsSection data={data} report={report} reportPeriod={reportPeriod} setReportPeriod={setReportPeriod} reportDate={reportDate} setReportDate={setReportDate} onShare={shareReport} onCopy={copyReport} />}
    </main>

    <nav className="mobile-nav" aria-label="Primary navigation">{NAV.map(item => { const Icon = item.icon; return <button key={item.id} onClick={() => navigate(item.id)} className={cn('mobile-nav-item', section === item.id && 'mobile-nav-active')}><span className="mobile-nav-icon"><Icon size={21} strokeWidth={section === item.id ? 2.2 : 1.8} /></span><span>{item.label}</span>{section === item.id && <span className="mobile-nav-dot" />}</button>; })}</nav>

    {modal?.kind === 'customer' && <CustomerModal onClose={closeModal} onSave={addCustomer} />}
    {modal?.kind === 'payment' && data.customers.find(c => c.id === modal.customerId) && <PaymentModal customer={data.customers.find(c => c.id === modal.customerId)!} onClose={closeModal} onSave={recordPayment} />}
    {modal?.kind === 'stock' && <StockModal onClose={closeModal} onSave={saveStock} />}
    {modal?.kind === 'stock-update' && data.stock.find(s => s.id === modal.itemId) && <StockUpdateModal item={data.stock.find(s => s.id === modal.itemId)!} mode={modal.mode} onClose={closeModal} onSave={updateStock} />}
    {modal?.kind === 'stock-edit' && data.stock.find(s => s.id === modal.itemId) && <StockEditModal item={data.stock.find(s => s.id === modal.itemId)!} onClose={closeModal} onSave={saveStockDetails} />}
    {modal?.kind === 'reminder' && <ReminderModal reminder={modal.reminder} onClose={closeModal} onSave={values => saveReminder(values, modal.reminder)} onDelete={deleteReminder} />}
    {modal?.kind === 'profile' && <ProfileModal data={data} onClose={closeModal} onSave={updateProfile} />}
    {modal?.kind === 'settings' && <SettingsModal onClose={closeModal} onReset={resetDemo} onProfile={() => setModal({ kind: 'profile' })} onExportBackup={exportBackup} onExportCsv={exportCsv} onImportBackup={importBackup} />}
    {modal?.kind === 'edit-draft' && pending && <EditDraftModal draft={pending} items={data.stock} onClose={closeModal} onSave={editDraft} />}
    {modal?.kind === 'transaction' && data.transactions.find(t => t.id === modal.transactionId) && <TransactionModal transaction={data.transactions.find(t => t.id === modal.transactionId)!} customer={data.customers.find(c => c.id === data.transactions.find(t => t.id === modal.transactionId)?.customerId)} onClose={closeModal} onEdit={transaction => setModal({ kind: 'edit-transaction', transactionId: transaction.id })} onDelete={deleteTransaction} />}
    {modal?.kind === 'edit-transaction' && data.transactions.find(t => t.id === modal.transactionId) && <EditTransactionModal transaction={data.transactions.find(t => t.id === modal.transactionId)!} onClose={closeModal} onSave={saveTransactionEdit} />}
    <WelcomeScreen show={showWelcome} onUseDemo={chooseDemo} onCreateShop={createLocalShop} />
    <Toast message={toastMessage} onClose={closeToast} />
  </div>;
}

interface SpeechRecognitionLike {
  lang: string; interimResults: boolean; maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null; onend: (() => void) | null;
  start: () => void;
}

function DebtsSection({ data, query, setQuery, direction, setDirection, onAdd, onPayment, onReminder }: {
  data: AppData; query: string; setQuery: (v: string) => void; direction: 'owed-to-us' | 'we-owe'; setDirection: (v: 'owed-to-us' | 'we-owe') => void;
  onAdd: () => void; onPayment: (id: string) => void; onReminder: (customer: Customer) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const customerList = data.customers.filter(c => direction === 'owed-to-us' ? c.balance > 0 : c.balance < 0).filter(c => `${c.name} ${c.phone}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
  const total = customerList.reduce((sum, c) => sum + Math.abs(c.balance), 0);
  return <>
    <SectionTitle eyebrow="THE CREDIT BOOK" title="Customer & supplier balances" detail="Know who owes you, who you owe, and what needs following up." right={<Button onClick={onAdd}><Plus size={16} /> Add person</Button>} />
    <div className="debt-overview"><div><div className="text-[10px] font-bold uppercase tracking-[.12em] text-[#B9D8C2]">{direction === 'owed-to-us' ? 'Owed to your shop' : 'Owed by your shop'}</div><div className="mt-2 font-display text-[28px] font-extrabold tracking-[-.06em] text-white">{money(total)}</div><div className="mt-1 text-[11px] text-[#C0D7C7]">{customerList.length} {customerList.length === 1 ? 'person' : 'people'} on this list</div></div><div className="debt-overview-mark"><HandCoins size={27} strokeWidth={1.6} /></div></div>
    <div className="section-tabs mt-5" role="tablist"><button role="tab" aria-selected={direction === 'owed-to-us'} className={cn(direction === 'owed-to-us' && 'section-tab-active')} onClick={() => setDirection('owed-to-us')}>Wananidai <span>{data.customers.filter(c => c.balance > 0).length}</span></button><button role="tab" aria-selected={direction === 'we-owe'} className={cn(direction === 'we-owe' && 'section-tab-active')} onClick={() => setDirection('we-owe')}>Ninawadai <span>{data.customers.filter(c => c.balance < 0).length}</span></button></div>
    <div className="debt-toolbar"><label className="search-field"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search a name or phone number" /></label><div className="text-[11px] font-medium text-hesabu-muted">Sorted by amount</div></div>
    <section className="surface list-surface">
      {customerList.length === 0 ? <EmptyState title={query ? 'No matching person' : 'No outstanding balances'} detail={query ? 'Try another name or phone number.' : direction === 'owed-to-us' ? 'When someone takes goods on credit, they will appear here.' : 'Any unpaid supplier balances will show up here.'} action={!query ? <Button variant="secondary" onClick={onAdd}><Plus size={15} /> Add a person</Button> : undefined} /> : customerList.map(customer => {
        const overdue = customer.dueDate && daysUntil(customer.dueDate) < 0;
        const expandedNow = expanded === customer.id;
        const history = data.transactions.filter(t => t.customerId === customer.id || t.customerName?.toLowerCase() === customer.name.toLowerCase()).sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`)).slice(0, 5);
        return <div key={customer.id} className="person-record">
          <button className="person-main" onClick={() => setExpanded(expandedNow ? null : customer.id)} aria-expanded={expandedNow}>
            <span className={cn('person-avatar', customer.balance < 0 && 'person-avatar-supplier')}>{customer.name.slice(0, 1).toUpperCase()}</span>
            <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="text-[14px] font-bold text-hesabu-ink">{customer.name}</span>{overdue && <span className="overdue-badge">{Math.abs(daysUntil(customer.dueDate!))}d overdue</span>}</span><span className="mt-1 block text-[11px] text-hesabu-muted">{customer.phone || (customer.balance < 0 ? 'Supplier / business' : 'No phone added')}{customer.dueDate ? ` · Due ${shortDay(customer.dueDate)}` : ''}</span></span>
            <span className="ml-2 shrink-0 text-right"><span className={cn('block text-[14px] font-bold tabular-nums', customer.balance < 0 ? 'text-[#597B9A]' : 'text-[#B94C46]')}>{money(Math.abs(customer.balance))}</span><span className="mt-1 block text-[10px] text-hesabu-muted">{customer.balance < 0 ? (customer.kind === 'customer' ? 'Customer credit' : 'You owe') : 'Owes you'}</span></span><ChevronDown size={16} className={cn('ml-1 shrink-0 text-[#9AA69D] transition-transform', expandedNow && 'rotate-180')} />
          </button>
          {expandedNow && <div className="person-expanded"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[11px] font-semibold text-hesabu-muted">Recent history</span><span className="text-[10px] text-hesabu-muted">{history.length} entries</span></div>{history.length ? <div className="mt-2">{history.map(t => <div key={t.id} className="history-line"><span className="truncate">{t.description}</span><span className={cn(t.type === 'expense' ? 'text-[#B94C46]' : t.type === 'credit' ? 'text-[#A4762A]' : 'text-hesabu-green')}>{money(t.amount)}</span></div>)}</div> : <p className="mt-2 text-xs text-hesabu-muted">No linked transactions yet. This balance was entered manually.</p>}
            <div className="mt-4 flex flex-wrap gap-2">{customer.balance !== 0 && <Button size="sm" onClick={() => onPayment(customer.id)}><Wallet size={14} /> {customer.balance < 0 ? (customer.kind === 'customer' ? 'Return customer credit' : 'Record payment made') : 'Record payment received'}</Button>}{customer.balance > 0 && customer.phone && <Button size="sm" variant="secondary" onClick={() => onReminder(customer)}><Share2 size={14} /> WhatsApp reminder</Button>}</div>
          </div>}
        </div>;
      })}
    </section>
    <p className="mx-auto mt-5 max-w-xl text-center text-[10px] leading-4 text-hesabu-muted">A credit adds to the amount owed. A repayment reduces it. Open a transaction to correct its description, amount or date; delete and re-enter it to change its type or linked person.</p>
  </>;
}

function StockSection({ data, query, setQuery, onAdd, onEdit, onUpdate }: { data: AppData; query: string; setQuery: (v: string) => void; onAdd: () => void; onEdit: (id: string) => void; onUpdate: (id: string, mode: 'restock' | 'adjust') => void }) {
  const [filter, setFilter] = useState<'all' | 'low'>('all');
  const shown = data.stock.filter(s => s.name.toLowerCase().includes(query.toLowerCase())).filter(s => filter === 'all' || s.quantity <= s.lowStockAt).sort((a, b) => (a.quantity / Math.max(1, a.lowStockAt)) - (b.quantity / Math.max(1, b.lowStockAt)));
  return <>
    <SectionTitle eyebrow="WHAT’S ON YOUR SHELVES" title="Bidhaa" detail={`${data.stock.length} items on your shelf. Keep an eye on the ones running low.`} right={<Button onClick={onAdd}><Plus size={16} /> Add item</Button>} />
    <div className="stock-summary-row"><div className="stock-summary-cell"><span className="text-[10px] font-semibold text-hesabu-muted">Items tracked</span><b>{data.stock.length.toString().padStart(2, '0')}</b></div><div className="stock-summary-cell"><span className="text-[10px] font-semibold text-hesabu-muted">Running low</span><b className={lowStockCount(data.stock) ? 'text-[#B8782D]' : 'text-hesabu-green'}>{lowStockCount(data.stock).toString().padStart(2, '0')}</b></div><div className="stock-summary-cell"><span className="text-[10px] font-semibold text-hesabu-muted">Last updated</span><b className="!text-[13px]">Today</b></div></div>
    <div className="stock-toolbar"><label className="search-field"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search your stock" /></label><div className="segmented-control"><button className={cn(filter === 'all' && 'segment-active')} onClick={() => setFilter('all')}>All items</button><button className={cn(filter === 'low' && 'segment-active')} onClick={() => setFilter('low')}>Low stock <span className="count-badge">{lowStockCount(data.stock)}</span></button></div></div>
    {shown.length === 0 ? <section className="surface"><EmptyState title={filter === 'low' ? 'No stock alerts' : 'No matching item'} detail={filter === 'low' ? 'Your quantities are above their reorder levels.' : 'Try another product name or add the item to your shelf list.'} action={filter === 'all' ? <Button onClick={onAdd}><Plus size={15} /> Add item</Button> : undefined} /></section> : <div className="stock-grid">{shown.map(item => <StockCard key={item.id} item={item} onEdit={() => onEdit(item.id)} onRestock={() => onUpdate(item.id, 'restock')} onAdjust={() => onUpdate(item.id, 'adjust')} />)}</div>}
    <div className="mt-5 flex items-start gap-2 rounded-xl bg-[#EEF4EF] px-4 py-3.5 text-[11px] leading-5 text-[#5F7465]"><CircleHelp size={15} className="mt-0.5 shrink-0" /><span>When a sale or credit includes a known item, Hesabu can adjust its quantity. You can always correct stock counts manually.</span></div>
  </>;
}
function lowStockCount(items: StockItem[]) { return items.filter(s => s.quantity <= s.lowStockAt).length; }

function StockCard({ item, onEdit, onRestock, onAdjust }: { item: StockItem; onEdit: () => void; onRestock: () => void; onAdjust: () => void }) {
  const percent = Math.min(100, Math.max(0, item.quantity / Math.max(item.lowStockAt * 2, 1) * 100));
  const critical = item.quantity <= Math.max(1, Math.floor(item.lowStockAt / 2));
  const low = item.quantity <= item.lowStockAt;
  return <section className="surface stock-card">
    <div className="flex items-start justify-between gap-2"><div className="stock-product-icon"><Package size={19} strokeWidth={1.7} /></div><div className="flex items-center gap-2"><StockStatus item={item} /><button type="button" className="icon-button !h-8 !w-8" onClick={onEdit} aria-label={`Edit ${item.name} details`} title="Edit item details"><Settings2 size={14} /></button></div></div>
    <h3 className="mt-4 font-display text-[16px] font-extrabold tracking-[-.03em]">{item.name}</h3><div className="mt-1 text-[10px] text-hesabu-muted">Last restocked {dateText(item.lastRestocked)}</div>
    <div className="mt-5 flex items-end justify-between gap-2"><div><span className={cn('font-display text-[28px] font-extrabold leading-none tracking-[-.06em]', critical ? 'text-[#B94C46]' : low ? 'text-[#A4762A]' : 'text-hesabu-ink')}>{item.quantity}</span><span className="ml-1.5 text-[11px] font-semibold text-hesabu-muted">{item.unit}</span></div><div className="text-right text-[10px] leading-4 text-hesabu-muted">Reorder at<br /><b className="text-hesabu-ink">{item.lowStockAt} {item.unit}</b></div></div>
    <div className="stock-progress"><span className={cn(critical ? 'progress-critical' : low ? 'progress-low' : 'progress-good')} style={{ width: `${percent}%` }} /></div>
    <div className="mt-4 grid grid-cols-[1.1fr_.9fr] gap-2"><Button size="sm" onClick={onRestock}><Plus size={14} /> Restock</Button><Button size="sm" variant="secondary" onClick={onAdjust}>Edit quantity</Button></div>
  </section>;
}

function ReportsSection({ data, report, reportPeriod, setReportPeriod, reportDate, setReportDate, onShare, onCopy }: {
  data: AppData; report: ReturnType<typeof buildReport>; reportPeriod: 'daily' | 'weekly' | 'monthly'; setReportPeriod: (v: 'daily' | 'weekly' | 'monthly') => void;
  reportDate: string; setReportDate: (v: string) => void; onShare: () => void; onCopy: () => void;
}) {
  const periodLabel = reportPeriod === 'daily'
    ? (reportDate === today() ? 'Today’s report' : `Report for ${dateText(reportDate, { day: 'numeric', month: 'short', year: 'numeric' })}`)
    : reportPeriod === 'weekly' ? `Week ending ${dateText(reportDate, { day: 'numeric', month: 'short' })}`
    : `Month to ${dateText(reportDate, { day: 'numeric', month: 'short' })}`;
  return <>
    <SectionTitle eyebrow="KNOW HOW THE DAY WENT" title="Reports" detail="A clear summary you can send to yourself or someone you trust." right={<span className="report-date-chip"><CalendarDays size={14} /> {dateText(reportDate, { day: 'numeric', month: 'short' })}</span>} />
    <div className="report-workspace">
      <section className="report-controls surface">
        <div className="eyebrow">CHOOSE YOUR VIEW</div>
        <div className="period-tabs">{(['daily', 'weekly', 'monthly'] as const).map(period => <button key={period} className={cn(reportPeriod === period && 'period-tab-active')} onClick={() => setReportPeriod(period)}>{period[0].toUpperCase() + period.slice(1)}</button>)}</div>
        <label className="field-wrap mt-5 block"><span className="field-label">Report date</span><input type="date" className="field-control" value={reportDate} max={today()} onChange={e => setReportDate(e.target.value)} /></label>
        <div className="report-mini-stats"><div><span>Cash in</span><b className="text-hesabu-green">{money(report.cashIn)}</b></div><div><span>Cash out</span><b className="text-[#B94C46]">{money(report.cashOut)}</b></div><div><span>Net cash</span><b>{money(report.net)}</b></div></div>
        <div className="mt-4 rounded-xl bg-[#F5F7F4] px-3.5 py-3 text-[10px] leading-5 text-hesabu-muted">Net cash is money in minus money out. It is not profit because cost of goods sold and other accounting adjustments are not calculated here.</div>
        <Button className="mt-5 w-full" onClick={onShare}><Share2 size={16} /> Share on WhatsApp</Button><Button variant="secondary" className="mt-2 w-full" onClick={onCopy}><ClipboardList size={16} /> Copy report text</Button>
      </section>
      <section className="report-preview-wrap"><div className="mb-3 flex items-center justify-between gap-3"><div><div className="eyebrow">MESSAGE PREVIEW</div><h2 className="mt-1 font-display text-[17px] font-extrabold tracking-[-.03em]">{periodLabel}</h2></div><span className="share-ready"><span className="share-ready-dot" /> Ready to share</span></div>
        <div className="whatsapp-sheet"><div className="wa-header"><span className="wa-avatar"><span className="brand-mark brand-mark-small"><span /><span /><span /></span></span><span><b>Hesabu</b><small>Shop summary</small></span><MoreHorizontal size={18} className="ml-auto text-[#6C8275]" /></div>
          <div className="wa-date-divider"><span>{dateText(reportDate, { weekday: 'short', day: 'numeric', month: 'short' })}</span></div>
          <div className="wa-message">
            <div className="flex items-center gap-2"><span className="report-symbol"><TrendingUp size={16} /></span><div><div className="text-[10px] font-bold uppercase tracking-[.1em] text-[#6B8172]">{data.shopInfo.name}</div><h3 className="mt-0.5 font-display text-[18px] font-extrabold tracking-[-.04em]">{periodLabel}</h3></div></div>
            <div className="wa-metric-list"><div><span><ArrowDownRight size={14} /> Money received</span><b className="text-hesabu-green">{money(report.cashIn)}</b></div><div><span><ArrowUpRight size={14} /> Expenses</span><b className="text-[#B94C46]">{money(report.cashOut)}</b></div><div><span><Wallet size={14} /> Net cash</span><b>{money(report.net)}</b></div><div><span><HandCoins size={14} /> New credit sales</span><b className="text-[#A4762A]">{money(report.credit)}</b></div></div>
            <div className="wa-divider" /><div className="wa-subhead"><Users size={15} /> New credit sales</div>
            {report.transactions.filter(t => t.type === 'credit').length ? <div className="wa-list">{report.transactions.filter(t => t.type === 'credit').slice(0, 4).map(t => <div key={t.id}><span>{t.customerName ?? 'Customer'}{t.dueDate ? ` · ${dateText(t.dueDate)}` : ''}</span><b>{money(t.amount)}</b></div>)}</div> : <p className="wa-muted-line">No credit sales in this period.</p>}
            <div className="wa-divider" /><div className="wa-subhead"><Bell size={15} /> Vitu vya kufuatilia</div>
            {report.lowStock.length || report.due.length ? <div className="wa-list wa-alert-list">{report.lowStock.slice(0, 3).map(item => <div key={item.id}><span>{item.name} is running low ({item.quantity} {item.unit})</span><b>Restock</b></div>)}{report.due.slice(0, 3).map(rem => <div key={rem.id}><span>{rem.title}{rem.amount ? ` · ${money(rem.amount)}` : ''}</span><b>{daysUntil(rem.dueDate) < 0 ? 'Overdue' : daysUntil(rem.dueDate) === 0 ? 'Today' : dateText(rem.dueDate)}</b></div>)}</div> : <p className="wa-muted-line">Stock na bills ziko sawa.</p>}
            <div className="mt-4 rounded-lg bg-[#EEF6EF] px-3 py-2.5 text-[11px] leading-5 text-[#55725F]">Your records are up to date. Keep the day moving.</div><div className="mt-2 flex justify-end text-[9px] text-[#8EA496]">Hesabu · preview</div>
          </div>
          <div className="wa-composer"><Plus size={17} className="text-[#7D9485]" /><span>Message</span><Headphones size={17} className="text-[#7D9485]" /></div>
        </div>
      </section>
    </div>
  </>;
}

function CustomerModal({ onClose, onSave }: { onClose: () => void; onSave: (values: { name: string; phone: string; balance: string; direction: 'owed-to-us' | 'we-owe'; kind: 'customer' | 'supplier'; dueDate: string; note: string }) => void }) {
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [balance, setBalance] = useState(''); const [direction, setDirection] = useState<'owed-to-us' | 'we-owe'>('owed-to-us'); const [kind, setKind] = useState<'customer' | 'supplier'>('customer'); const [dueDate, setDueDate] = useState(''); const [note, setNote] = useState('');
  return <Modal title="Add a person" detail="Customers, suppliers and anyone you keep a balance with." onClose={onClose}>
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); onSave({ name, phone, balance, direction, kind, dueDate, note }); }}>
      <Field label="Name" value={name} onChange={setName} placeholder="e.g. Kamau or Madam Annette" required autoFocus />
      <Field label="Phone number (optional)" value={phone} onChange={setPhone} placeholder="07xx xxx xxx" inputMode="tel" />
      <SelectField label="Person type" value={kind} onChange={v => { const next = v as 'customer' | 'supplier'; setKind(next); setDirection(next === 'supplier' ? 'we-owe' : 'owed-to-us'); }} options={[{ value: 'customer', label: 'Customer' }, { value: 'supplier', label: 'Supplier / business' }]} />
      <div><span className="field-label">Opening balance</span><div className="choice-two mt-2"><button type="button" className={cn(direction === 'owed-to-us' && 'choice-two-active')} onClick={() => setDirection('owed-to-us')}>They owe me</button><button type="button" className={cn(direction === 'we-owe' && 'choice-two-active')} onClick={() => setDirection('we-owe')}>I owe them</button></div></div>
      <Field label="Amount (KES)" value={balance} onChange={setBalance} placeholder="0" type="number" min={0} inputMode="numeric" />
      <Field label="Due date (optional)" value={dueDate} onChange={setDueDate} type="date" />
      <Field label="Note (optional)" value={note} onChange={setNote} placeholder="Anything useful to remember" />
      <div className="modal-actions"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!name.trim()}><Plus size={15} /> Save person</Button></div>
    </form>
  </Modal>;
}

function PaymentModal({ customer, onClose, onSave }: { customer: Customer; onClose: () => void; onSave: (customer: Customer, amount: string, note: string) => void }) {
  const supplierPayment = customer.kind === 'supplier' || (!customer.kind && customer.balance < 0);
  const customerCredit = customer.kind === 'customer' && customer.balance < 0;
  const [amount, setAmount] = useState(String(Math.abs(customer.balance)));
  const [note, setNote] = useState(supplierPayment ? 'Supplier payment' : customerCredit ? 'Customer credit refund' : 'Debt payment received');
  const capped = supplierPayment || customerCredit;
  const direction = supplierPayment ? 'paid out' : customerCredit ? 'returned to the customer' : 'received';
  return <Modal title={supplierPayment ? `Record payment to ${customer.name}` : customerCredit ? `Return balance to ${customer.name}` : `Payment from ${customer.name}`} detail={`${customerCredit ? 'Customer credit held' : 'Outstanding balance'}: ${money(Math.abs(customer.balance))}. This entry will be ${direction}.`} onClose={onClose}>
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); onSave(customer, amount, note); }}>
      <Field label={supplierPayment || customerCredit ? 'Amount paid (KES)' : 'Amount received (KES)'} type="number" min={1} value={amount} onChange={setAmount} required autoFocus inputMode="numeric" />
      <div className="flex flex-wrap gap-2"><button type="button" className="quick-amount" onClick={() => setAmount(String(Math.min(Math.abs(customer.balance), 100)))}>KES 100</button><button type="button" className="quick-amount" onClick={() => setAmount(String(Math.ceil(Math.abs(customer.balance) / 2)))}>Half balance</button><button type="button" className="quick-amount" onClick={() => setAmount(String(Math.abs(customer.balance)))}>Full balance</button></div>
      <Field label="Description" value={note} onChange={setNote} />
      {capped && Number(amount) > Math.abs(customer.balance) && <p className="text-[11px] text-[#B94C46]">This amount is higher than the balance and will be capped at {money(Math.abs(customer.balance))}.</p>}
      {!capped && Number(amount) > customer.balance && <p className="text-[11px] text-[#8A6B32]">The extra will stay on the customer account as credit for their next purchase.</p>}
      <div className="modal-actions"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={Number(amount) <= 0}><Check size={15} /> {supplierPayment ? 'Record payment' : customerCredit ? 'Record refund' : 'Record payment'}</Button></div>
    </form>
  </Modal>;
}
function StockModal({ onClose, onSave }: { onClose: () => void; onSave: (values: { name: string; quantity: string; unit: string; threshold: string; cost: string }) => void }) {
  const [name, setName] = useState(''); const [quantity, setQuantity] = useState('0'); const [unit, setUnit] = useState('pcs'); const [threshold, setThreshold] = useState('5'); const [cost, setCost] = useState('');
  return <Modal title="Add an item" detail="Start with the quantity on your shelf and when you want a reminder to reorder." onClose={onClose}>
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); onSave({ name, quantity, unit, threshold, cost }); }}>
      <Field label="Product name" value={name} onChange={setName} placeholder="e.g. Maziwa" required autoFocus />
      <div className="grid grid-cols-2 gap-3"><Field label="Current quantity" value={quantity} onChange={setQuantity} type="number" min={0} required /><Field label="Unit" value={unit} onChange={setUnit} placeholder="pcs, kg, packets" required /></div>
      <div className="grid grid-cols-2 gap-3"><Field label="Reorder at" value={threshold} onChange={setThreshold} type="number" min={0} required /><Field label="Cost per unit (KES)" value={cost} onChange={setCost} type="number" min={0} /></div>
      <div className="modal-actions"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!name.trim()}><Plus size={15} /> Add to stock</Button></div>
    </form>
  </Modal>;
}

function StockEditModal({ item, onClose, onSave }: { item: StockItem; onClose: () => void; onSave: (item: StockItem, values: { name: string; unit: string; threshold: string; cost: string }) => void }) {
  const [name, setName] = useState(item.name);
  const [unit, setUnit] = useState(item.unit);
  const [threshold, setThreshold] = useState(String(item.lowStockAt));
  const [cost, setCost] = useState(item.costPerUnit === undefined ? '' : String(item.costPerUnit));
  return <Modal title={`Edit ${item.name}`} detail="Update the product name, unit and reorder level. The current shelf count will stay unchanged." onClose={onClose}>
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); onSave(item, { name, unit, threshold, cost }); }}>
      <Field label="Product name" value={name} onChange={setName} required autoFocus />
      <Field label="Unit" value={unit} onChange={setUnit} required placeholder="pcs, kg, packets" />
      <div className="grid grid-cols-2 gap-3"><Field label="Reorder at" value={threshold} onChange={setThreshold} type="number" min={0} required /><Field label="Cost per unit (KES)" value={cost} onChange={setCost} type="number" min={0} /></div>
      <div className="rounded-xl bg-hesabu-surface px-3 py-3 text-[11px] leading-5 text-hesabu-muted">Current tracked count: <b>{item.quantity} {item.unit}</b>. Editing the reorder level changes when Hesabu flags it as running low.</div>
      <div className="modal-actions"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!name.trim() || !unit.trim()}><Check size={15} /> Save item details</Button></div>
    </form>
  </Modal>;
}

function StockUpdateModal({ item, mode, onClose, onSave }: { item: StockItem; mode: 'restock' | 'adjust'; onClose: () => void; onSave: (item: StockItem, amount: string, mode: 'restock' | 'adjust') => void }) {
  const [amount, setAmount] = useState(mode === 'restock' ? '1' : String(item.quantity));
  return <Modal title={mode === 'restock' ? `Restock ${item.name}` : `Adjust ${item.name}`} detail={mode === 'restock' ? `Current quantity: ${item.quantity} ${item.unit}. Enter how many you received.` : 'Enter the actual quantity currently on the shelf.'} onClose={onClose}>
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); onSave(item, amount, mode); }}>
      <Field label={mode === 'restock' ? `Quantity received (${item.unit})` : `Actual quantity (${item.unit})`} value={amount} onChange={setAmount} type="number" min={0} required autoFocus />
      {mode === 'restock' && <div className="rounded-xl bg-[#F1F6F1] px-4 py-3 text-[12px] text-[#5C7162]">New quantity will be <b>{item.quantity + Math.max(0, Number(amount) || 0)} {item.unit}</b>.</div>}
      <div className="modal-actions"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit"><Check size={15} /> Save quantity</Button></div>
    </form>
  </Modal>;
}

function ReminderModal({ reminder, onClose, onSave, onDelete }: { reminder?: Reminder; onClose: () => void; onSave: (values: { title: string; detail: string; amount: string; dueDate: string; kind: Reminder['kind'] }) => void; onDelete: (reminder: Reminder) => void }) {
  const [title, setTitle] = useState(reminder?.title ?? ''); const [detail, setDetail] = useState(reminder?.detail ?? ''); const [amount, setAmount] = useState(reminder?.amount === undefined ? '' : String(reminder.amount)); const [dueDate, setDueDate] = useState(reminder?.dueDate ?? today()); const [kind, setKind] = useState<Reminder['kind']>(reminder?.kind ?? 'bill');
  return <Modal title={reminder ? 'Edit reminder' : 'Add a reminder'} detail="A bill, supplier follow-up or a customer you need to call." onClose={onClose}>
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); onSave({ title, detail, amount, dueDate, kind }); }}>
      <Field label="Reminder" value={title} onChange={setTitle} placeholder="e.g. Pay electricity tokens" required autoFocus />
      <SelectField label="Type" value={kind} onChange={v => setKind(v as Reminder['kind'])} options={[{ value: 'bill', label: 'Bill / expense' }, { value: 'supplier', label: 'Supplier' }, { value: 'customer', label: 'Customer follow-up' }, { value: 'other', label: 'Other' }]} />
      <div className="grid grid-cols-2 gap-3"><Field label="Amount (optional)" value={amount} onChange={setAmount} type="number" min={0} placeholder="KES" /><Field label="Due date" value={dueDate} onChange={setDueDate} type="date" required /></div>
      <Field label="Details (optional)" value={detail} onChange={setDetail} placeholder="Any extra detail" />
      <div className="modal-actions">{reminder && <Button variant="danger" onClick={() => onDelete(reminder)}><Trash2 size={14} /> Delete</Button>}<div className="ml-auto flex gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!title.trim()}><Check size={15} /> {reminder ? 'Save changes' : 'Save reminder'}</Button></div></div>
    </form>
  </Modal>;
}

function ProfileModal({ data, onClose, onSave }: { data: AppData; onClose: () => void; onSave: (name: string, owner: string, phone: string, businessType: string) => void }) {
  const [name, setName] = useState(data.shopInfo.name); const [owner, setOwner] = useState(data.shopInfo.owner); const [phone, setPhone] = useState(data.shopInfo.phone); const [businessType, setBusinessType] = useState(data.shopInfo.businessType);
  return <Modal title="Your shop details" detail="These details are used in your reports and shop header." onClose={onClose}>
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); onSave(name, owner, phone, businessType); }}>
      <Field label="Shop name" value={name} onChange={setName} required autoFocus /><Field label="Your name" value={owner} onChange={setOwner} required /><Field label="Phone number" value={phone} onChange={setPhone} inputMode="tel" />
      <SelectField label="Business type" value={businessType} onChange={setBusinessType} options={[{ value: 'General shop', label: 'General shop' }, { value: 'Mama Mboga', label: 'Mama Mboga' }, { value: 'Hardware', label: 'Hardware' }, { value: 'Pharmacy', label: 'Pharmacy' }, { value: 'Other', label: 'Other' }]} />
      <div className="modal-actions"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit"><Check size={15} /> Save details</Button></div>
    </form>
  </Modal>;
}

function SettingsModal({ onClose, onReset, onProfile, onExportBackup, onExportCsv, onImportBackup }: { onClose: () => void; onReset: () => void; onProfile: () => void; onExportBackup: () => void; onExportCsv: () => void; onImportBackup: (file: File) => void }) {
  return <Modal title="Preferences" detail="Keep your shop details current and protect the records on this device." onClose={onClose}>
    <div className="settings-list">
      <button onClick={onProfile}><span className="settings-item-icon"><Store size={17} /></span><span><b>Shop profile</b><small>Name, phone number and business type</small></span><ChevronRight size={17} className="ml-auto text-hesabu-muted" /></button>
      <div className="settings-info"><span className="settings-item-icon"><Settings2 size={17} /></span><span><b>Stored on this device</b><small>Hesabu uses this browser’s local storage. Clearing browser data removes this ledger.</small></span></div>
      <div className="settings-info"><span className="settings-item-icon"><Bell size={17} /></span><span><b>Reminders</b><small>Shown inside the app. Automatic WhatsApp delivery is not connected in this prototype.</small></span></div>
      <button onClick={onExportBackup}><span className="settings-item-icon"><Download size={17} /></span><span><b>Download a backup</b><small>Save your shop, transactions, people, stock and reminders as a JSON file.</small></span><ChevronRight size={17} className="ml-auto text-hesabu-muted" /></button>
      <button onClick={onExportCsv}><span className="settings-item-icon"><FileSpreadsheet size={17} /></span><span><b>Export transactions (CSV)</b><small>Open your ledger in Excel, Google Sheets or another spreadsheet.</small></span><ChevronRight size={17} className="ml-auto text-hesabu-muted" /></button>
      <label className="settings-info settings-upload"><span className="settings-item-icon"><Upload size={17} /></span><span><b>Restore from backup</b><small>Choose a Hesabu JSON backup. Your current browser data will be replaced after confirmation.</small><input className="settings-file-input" type="file" accept="application/json,.json" onChange={e => { const file = e.currentTarget.files?.[0]; if (file) onImportBackup(file); e.currentTarget.value = ''; }} /></span></label>
      <button className="settings-danger" onClick={onReset}><span className="settings-item-icon"><RotateCcw size={17} /></span><span><b>Reset demo shop</b><small>Replace saved changes with the original sample ledger.</small></span><ChevronRight size={17} className="ml-auto" /></button>
    </div><div className="modal-actions mt-5"><Button variant="secondary" onClick={onClose}>Close</Button></div>
  </Modal>;
}
function EditDraftModal({ draft, items, onClose, onSave }: { draft: TransactionDraft; items: StockItem[]; onClose: () => void; onSave: (values: { type: TransactionType; description: string; amount: string; customerName: string; dueDate: string; stockItemName: string }) => void }) {
  const [type, setType] = useState<TransactionType>(draft.type); const [description, setDescription] = useState(draft.description); const [amount, setAmount] = useState(String(draft.amount)); const [customerName, setCustomerName] = useState(draft.customerName ?? ''); const [dueDate, setDueDate] = useState(draft.dueDate ?? addDays(today(), 7)); const [stockItemName, setStockItemName] = useState(draft.stockItemName ?? '');
  return <Modal title="Edit transaction" detail="Check the details before they enter your ledger." onClose={onClose}>
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); onSave({ type, description, amount, customerName, dueDate, stockItemName }); }}>
      <SelectField label="Transaction type" value={type} onChange={v => setType(v as TransactionType)} options={Object.entries(TYPE_META).map(([key, value]) => ({ value: key, label: value.label }))} />
      <Field label="Description" value={description} onChange={setDescription} required />
      <Field label="Amount (KES)" value={amount} onChange={setAmount} type="number" min={1} required />
      {(type === 'credit' || type === 'payment') && <Field label="Customer name" value={customerName} onChange={setCustomerName} placeholder="Customer name" required />}
      {type === 'credit' && <Field label="Due date" value={dueDate} onChange={setDueDate} type="date" required />}
      <SelectField label="Stock item (optional)" value={stockItemName} onChange={setStockItemName} options={[{ value: '', label: 'Do not adjust stock' }, ...items.map(i => ({ value: i.name, label: i.name }))]} />
      <div className="modal-actions"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={Number(amount) <= 0}><Check size={15} /> Update review</Button></div>
    </form>
  </Modal>;
}

function EditTransactionModal({ transaction, onClose, onSave }: { transaction: Transaction; onClose: () => void; onSave: (transaction: Transaction, values: { description: string; amount: string; date: string; time: string; dueDate: string }) => void }) {
  const [description, setDescription] = useState(transaction.description);
  const [amount, setAmount] = useState(String(transaction.amount));
  const [date, setDate] = useState(transaction.date);
  const [time, setTime] = useState(transaction.time);
  const [dueDate, setDueDate] = useState(transaction.dueDate ?? '');
  return <Modal title="Correct transaction" detail="The original transaction type, linked person and stock movement stay unchanged. To change those, delete this record and add it again." onClose={onClose}>
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); onSave(transaction, { description, amount, date, time, dueDate }); }}>
      <Field label="Description" value={description} onChange={setDescription} required autoFocus />
      <Field label="Amount (KES)" value={amount} onChange={setAmount} type="number" min={1} required inputMode="numeric" />
      <div className="grid grid-cols-2 gap-3"><Field label="Date" value={date} onChange={setDate} type="date" required /><Field label="Time" value={time} onChange={setTime} type="time" required /></div>
      {transaction.type === 'credit' && <Field label="Due date (optional)" value={dueDate} onChange={setDueDate} type="date" />}
      <div className="rounded-xl border border-hesabu-line bg-hesabu-surface px-3 py-3 text-[11px] leading-5 text-hesabu-muted">
        {transaction.customerId && (transaction.type === 'credit' || transaction.type === 'payment' || transaction.category === 'Supplier payment' || transaction.category === 'Customer refund')
          ? 'Changing the amount will adjust the linked customer or supplier balance.'
          : 'Changing the date will move this entry between report periods.'}
      </div>
      <div className="modal-actions"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!description.trim() || Number(amount) <= 0 || !date || !time}><Check size={15} /> Save correction</Button></div>
    </form>
  </Modal>;
}

function TransactionModal({ transaction, customer, onClose, onEdit, onDelete }: { transaction: Transaction; customer?: Customer; onClose: () => void; onEdit: (tx: Transaction) => void; onDelete: (tx: Transaction) => void }) {
  const Icon = TYPE_META[transaction.type].icon;
  return <Modal title="Transaction details" detail={shortDay(transaction.date)} onClose={onClose}>
    <div className="transaction-detail-card"><div className={cn('transaction-detail-icon', TYPE_TONE[transaction.type])}><Icon size={22} /></div><div className="mt-4 text-[10px] font-bold uppercase tracking-[.14em] text-hesabu-muted">{TYPE_META[transaction.type].label}</div><div className={cn('mt-1 font-display text-[28px] font-extrabold tracking-[-.06em]', `amount-${transaction.type}`)}>{transaction.type === 'expense' ? '−' : transaction.type === 'credit' ? '' : '+'}{money(transaction.amount)}</div><div className="mt-2 text-sm font-bold">{transaction.description}</div><div className="mt-1 text-[11px] text-hesabu-muted">{dateText(transaction.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} at {timeText(transaction.time)}</div></div>
    <div className="mt-4 space-y-3">{transaction.customerName && <div className="detail-line"><span>Person</span><b>{transaction.customerName}</b></div>}{transaction.dueDate && <div className="detail-line"><span>Due date</span><b>{dateText(transaction.dueDate, { weekday: 'short', day: 'numeric', month: 'short' })}</b></div>}{transaction.category && <div className="detail-line"><span>Category</span><b>{transaction.category}</b></div>}{transaction.stockQuantityDelta !== undefined && <div className="detail-line"><span>Stock adjustment</span><b>{transaction.stockQuantityDelta > 0 ? '+' : ''}{transaction.stockQuantityDelta} item(s)</b></div>}{customer && <div className="detail-line"><span>Remaining balance</span><b>{money(customer.balance)}</b></div>}</div>
    <div className="mt-5 grid grid-cols-2 gap-2"><Button variant="secondary" onClick={onClose}>Close</Button><Button variant="outline" onClick={() => onEdit(transaction)}><Settings2 size={15} /> Edit details</Button><Button variant="danger" className="col-span-2" onClick={() => onDelete(transaction)}><Trash2 size={15} /> Delete entry</Button></div>
  </Modal>;
}


function WelcomeScreen({ show, onUseDemo, onCreateShop }: { show: boolean; onUseDemo: () => void; onCreateShop: (values: { name: string; owner: string; phone: string; businessType: string }) => void }) {
  const [name, setName] = useState('');
  const [owner, setOwner] = useState('');
  const [phone, setPhone] = useState('');
  const [businessType, setBusinessType] = useState('General shop');
  if (!show) return null;
  return <main className="welcome-screen">
    <div className="welcome-layout">
      <section className="welcome-story">
        <Logo />
        <div className="welcome-copy">
          <div className="eyebrow">ACCOUNTING FOR EVERYDAY BUSINESS</div>
          <h1>Know your numbers. Run your business.</h1>
          <p>Keep sales, expenses, customer debts, stock and reminders together. No accounting lessons. No more hunting through yesterday’s pages.</p>
        </div>
        <div className="welcome-points">
          <div className="welcome-point"><span className="welcome-point-icon"><Wallet size={18} /></span><div><b>Know what came in and went out</b><span>Keep cash sales separate from goods taken on credit.</span></div></div>
          <div className="welcome-point"><span className="welcome-point-icon"><Users size={18} /></span><div><b>Remember who owes what</b><span>Record repayments and follow-ups without searching the book.</span></div></div>
          <div className="welcome-point"><span className="welcome-point-icon"><Package size={18} /></span><div><b>See what is running low</b><span>Set reorder levels and keep the shelves in view.</span></div></div>
        </div>
      </section>
      <section className="welcome-setup">
        <div className="welcome-form-head"><div className="eyebrow">LET’S SET THINGS UP</div><h2>Set up your business.</h2><p>Use your own details to get started, or explore the sample shop first.</p></div>
        <form className="welcome-form" onSubmit={event => { event.preventDefault(); onCreateShop({ name, owner, phone, businessType }); }}>
          <Field label="Shop name" value={name} onChange={setName} placeholder="e.g. Mwende General Shop" required autoFocus />
          <Field label="Your name (optional)" value={owner} onChange={setOwner} placeholder="What should Hesabu call you?" />
          <Field label="Phone number (optional)" value={phone} onChange={setPhone} placeholder="07… or 01…" type="tel" inputMode="tel" />
          <SelectField label="Type of business" value={businessType} onChange={setBusinessType} options={[{value:'General shop',label:'General shop / duka'},{value:'Kiosk',label:'Kiosk'},{value:'Grocery',label:'Grocery / food shop'},{value:'Hardware',label:'Hardware'},{value:'Clothing',label:'Clothing / boutique'},{value:'Other',label:'Other small business'}]} />
          <Button type="submit" className="welcome-start-button" disabled={!name.trim()}>Start my business ledger <ArrowRight size={16} /></Button>
        </form>
        <div className="welcome-device-note"><CheckCircle2 size={15} /><span>Device-only setup, not an online account. Download backups until cloud sign-up and sync are connected.</span></div>
        <div className="welcome-demo-row"><span>Just looking around?</span><button type="button" onClick={onUseDemo}>Explore the sample ledger <ArrowRight size={14} /></button></div>
      </section>
    </div>
  </main>;
}

export default App;
