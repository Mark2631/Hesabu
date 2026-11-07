import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowDownLeft, ArrowUpRight, Bell, BookOpen, Check, CheckCircle2, ChevronRight, ClipboardList,
  FileSpreadsheet, FileText, HandCoins, House, Mic, MoreHorizontal, Package, Plus, Download, RotateCcw, Settings2,
  Share2, SlidersHorizontal, Store, Upload, Trash2, Users, Wallet, type LucideIcon,
} from 'lucide-react';
import { createBackupEnvelope, hasSavedData, makeDemoData, markBackupAt, parseBackupPayload, readLastBackupAt, readSavedData, saveData } from './data';
import type { AppData, Customer, DailyClose, Reminder, Section, StockItem, Transaction, TransactionDraft, TransactionType } from './types';
import { addDays, buildReport, cashIn, cashOut, currentTime, dateText, debtReminderMessage, daysUntil, drawerCashIn, drawerCashOut, expectedDrawerCash, fullDateText, id, isWithinTradingHours, makeDailyClose, money, normalizeKenyanWhatsAppNumber, normalizeSpokenNumbers, parseTransaction, receiptMessage, shortDay, suggestedOpeningCash, timeText, today, tradingDayFor, transactionLabel, whatsAppUrl } from './utils';

const NAV: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: 'home', label: 'Today', icon: House },
  { id: 'ledger', label: 'Book', icon: BookOpen },
  { id: 'debts', label: 'People', icon: Users },
  { id: 'more', label: 'More', icon: MoreHorizontal },
];

const TYPE_META: Record<TransactionType, { label: string; swahili: string; icon: LucideIcon; hint: string }> = {
  sale: { label: 'Sale', swahili: 'Mauzo', icon: ArrowDownLeft, hint: 'Money received for goods' },
  credit: { label: 'On credit', swahili: 'Deni', icon: HandCoins, hint: 'Goods taken and paid for later' },
  expense: { label: 'Expense', swahili: 'Matumizi', icon: ArrowUpRight, hint: 'Money paid out' },
  payment: { label: 'Debt repayment', swahili: 'Malipo ya deni', icon: Wallet, hint: 'A customer pays what they owe' },
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
  | { kind: 'reminder'; reminder?: Reminder; link?: { customerId?: string; stockItemId?: string; label: string; kind: Reminder['kind'] } }
  | { kind: 'profile' }
  | { kind: 'edit-draft' }
  | { kind: 'transaction'; transactionId: string }
  | { kind: 'edit-transaction'; transactionId: string }
  | { kind: 'settings' }
  | { kind: 'daily-close'; date: string }
  | null;

function cn(...classes: Array<string | undefined | null | false>) { return classes.filter(Boolean).join(' '); }

function Logo() {
  return <span className="brand-lockup" aria-label="Hesabu">
    <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
    <span className="hesabu-wordmark">Hesabu<span className="brand-period">.</span></span>
  </span>;
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
        <button className="modal-close" onClick={onClose} aria-label="Close dialog">Close</button>
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
        <span className="mt-1 block truncate text-[12px] text-hesabu-muted">{timeText(transaction.time)} · {transactionLabel[transaction.type]}{(transaction.type === 'sale' || transaction.type === 'payment' || transaction.type === 'expense') ? ` · ${transaction.paymentMethod === 'mpesa' ? 'M-Pesa' : 'Cash'}` : ''}</span>
      </span>
      <span className="ml-2 shrink-0 text-right">
        <span className={cn('block text-[13px] font-bold tabular-nums', `amount-${transaction.type}`)}>{prefix}{money(transaction.amount)}</span>
        {transaction.type === 'credit' && <span className="mt-1 block text-[9px] font-semibold uppercase tracking-[.06em] text-[#A47731]">On credit</span>}
      </span>
    </button>
    <button className="transaction-delete" onClick={onDelete} aria-label={`Delete ${transaction.description}`}>Delete</button>
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
  const [quickEntryOpen, setQuickEntryOpen] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [pending, setPending] = useState<TransactionDraft | null>(null);
  const [quickText, setQuickText] = useState('');
  const [quickAmount, setQuickAmount] = useState('');
  const [quickPerson, setQuickPerson] = useState('');
  const [quickDueDate, setQuickDueDate] = useState('');
  const [voiceState, setVoiceState] = useState<'idle' | 'listening' | 'unsupported'>('idle');
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [voiceLanguage, setVoiceLanguage] = useState<'en-KE' | 'sw-KE'>(() => {
    try { return localStorage.getItem('hesabu:v1:voice-language') === 'sw-KE' ? 'sw-KE' : 'en-KE'; } catch { return 'en-KE'; }
  });
  const [typeChoice, setTypeChoice] = useState<TransactionType | 'auto'>('sale');
  const [paymentMethodChoice, setPaymentMethodChoice] = useState<'cash' | 'mpesa'>('cash');
  const [storageWriteFailed, setStorageWriteFailed] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(() => readLastBackupAt());
  const [storageProtection, setStorageProtection] = useState<'checking' | 'protected' | 'standard' | 'unsupported'>('checking');
  const [query, setQuery] = useState('');
  const [debtDirection, setDebtDirection] = useState<'owed-to-us' | 'we-owe'>('owed-to-us');
  const [reportPeriod, setReportPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [reportDate, setReportDate] = useState(() => tradingDayFor(new Date(), data.shopInfo.tradingDayStart ?? '06:00', data.shopInfo.tradingDayEnd ?? '21:00'));
  const [toastMessage, setToastMessage] = useState('');
  const [filterTransactions, setFilterTransactions] = useState<'all' | 'cash' | 'mpesa' | 'credit' | 'expense'>('all');
  const [transactionSearch, setTransactionSearch] = useState('');
  const [ledgerDateFilter, setLedgerDateFilter] = useState('');
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  const [online, setOnline] = useState(() => navigator.onLine);
  const [queuedReportDate, setQueuedReportDate] = useState<string | null>(() => { try { return localStorage.getItem('hesabu:v1:queued-report') || null; } catch { return null; } });

  useEffect(() => { if (!showWelcome) setStorageWriteFailed(!saveData(data)); }, [data, showWelcome]);
  useEffect(() => {
    const refresh = () => setClock(new Date());
    const network = () => setOnline(navigator.onLine);
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', network);
    window.addEventListener('offline', network);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('online', network); window.removeEventListener('offline', network); };
  }, []);
  useEffect(() => {
    try { if (queuedReportDate) localStorage.setItem('hesabu:v1:queued-report', queuedReportDate); else localStorage.removeItem('hesabu:v1:queued-report'); } catch { /* The report remains available in this session. */ }
  }, [queuedReportDate]);
  useEffect(() => {
    try { localStorage.setItem('hesabu:v1:voice-language', voiceLanguage); } catch { /* Keep the selected language for this session. */ }
  }, [voiceLanguage]);
  useEffect(() => {
    if (online && queuedReportDate) { setReportDate(queuedReportDate); setReportPeriod('daily'); }
  }, [online, queuedReportDate]);
  useEffect(() => () => { recognitionRef.current?.abort(); }, []);
  useEffect(() => {
    let active = true;
    if (!navigator.storage?.persisted) { setStorageProtection('unsupported'); return () => { active = false; }; }
    navigator.storage.persisted()
      .then(persisted => { if (active) setStorageProtection(persisted ? 'protected' : 'standard'); })
      .catch(() => { if (active) setStorageProtection('unsupported'); });
    return () => { active = false; };
  }, []);

  const notify = (message: string) => setToastMessage(message);
  const protectDeviceStorage = async () => {
    if (!navigator.storage?.persist) { setStorageProtection('unsupported'); notify('This browser does not support persistent storage requests.'); return; }
    try {
      const granted = await navigator.storage.persist();
      setStorageProtection(granted ? 'protected' : 'standard');
      notify(granted ? 'Browser storage protection is enabled. Keep a separate backup too.' : 'The browser did not grant storage protection. Keep regular backups.');
    } catch { setStorageProtection('unsupported'); notify('Could not request browser storage protection. Download a backup regularly.'); }
  };
  const closeToast = () => setToastMessage('');
  const closeModal = () => setModal(null);
  const updateData = (updater: (current: AppData) => AppData) => setData(current => updater(current));
  const saveDailyClose = (date: string, openingCash: number, countedCash: number) => {
    const close = makeDailyClose(data, date, openingCash, countedCash);
    updateData(current => ({ ...current, dailyCloses: [...(current.dailyCloses ?? []).filter(item => item.date !== date), close] }));
    setModal(null);
    notify(close.difference === 0 ? 'Till balanced. Closing count saved.' : 'Closing count saved. Check the difference before you finish.');
  };

  const chooseDemo = () => {
    const demo = makeDemoData();
    setData(demo); saveData(demo); setShowWelcome(false); setSection('home');
  };
  const createLocalShop = (values: { name: string; owner: string; phone: string; businessType: string }) => {
    const fresh: AppData = {
      shopInfo: { name: values.name.trim(), owner: values.owner.trim(), phone: values.phone.trim(), businessType: values.businessType, tradingDayStart: '06:00', tradingDayEnd: '21:00' },
      transactions: [], customers: [], stock: [], reminders: [],
    };
    setData(fresh); saveData(fresh); setShowWelcome(false); setSection('home');
  };

  const tradingStart = data.shopInfo.tradingDayStart ?? '06:00';
  const tradingEnd = data.shopInfo.tradingDayEnd ?? '21:00';
  const tradingDate = tradingDayFor(clock, tradingStart, tradingEnd);
  const shopIsOpen = isWithinTradingHours(clock, tradingStart, tradingEnd);
  const currentDailyClose = data.dailyCloses?.find(close => close.date === tradingDate);
  const todayTransactions = useMemo(() => data.transactions.filter(t => (t.tradingDay ?? t.date) === tradingDate), [data.transactions, tradingDate]);
  const todaysIn = useMemo(() => cashIn(todayTransactions), [todayTransactions]);
  const todaysOut = useMemo(() => cashOut(todayTransactions), [todayTransactions]);
  const outstanding = useMemo(() => data.customers.filter(c => c.balance > 0).reduce((sum, c) => sum + c.balance, 0), [data.customers]);
  const lowStock = useMemo(() => data.stock.filter(s => s.quantity <= s.lowStockAt), [data.stock]);
  const allReminders = useMemo(() => [...data.reminders].sort((a, b) => a.dueDate.localeCompare(b.dueDate)), [data.reminders]);
  const report = useMemo(() => buildReport(data, reportPeriod, reportDate), [data, reportPeriod, reportDate]);

  const navigate = (next: Section) => {
    setSection(next); setQuery(''); setPending(null); setQuickEntryOpen(false); setProfileMenuOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' });
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
      amount: Math.max(0, Math.round(draft.amount)), date: today(), tradingDay: tradingDayFor(new Date(), current.shopInfo.tradingDayStart ?? '06:00', current.shopInfo.tradingDayEnd ?? '21:00'), time: currentTime(),
      customerId: customer?.id, customerName: createdName, dueDate: draft.dueDate,
      stockItemId: matchedStock?.id, stockQuantityDelta: draft.stockQuantityDelta,
      category: draft.category,
      paymentMethod: draft.type === 'sale' || draft.type === 'payment' || draft.type === 'expense' ? (draft.paymentMethod ?? 'cash') : undefined,
    };
    const effectiveStockDelta = matchedStock && draft.stockQuantityDelta !== undefined && draft.stockQuantityDelta < 0
      ? -Math.min(matchedStock.quantity, Math.abs(draft.stockQuantityDelta))
      : draft.stockQuantityDelta;
    txn.stockQuantityDelta = effectiveStockDelta;
    const nextStock = matchedStock && effectiveStockDelta !== undefined
      ? current.stock.map(s => s.id === matchedStock.id ? { ...s, quantity: Math.max(0, s.quantity + effectiveStockDelta), lastRestocked: effectiveStockDelta > 0 ? today() : s.lastRestocked } : s)
      : current.stock;
    updateData(c => ({ ...c, customers: nextCustomers, stock: nextStock, transactions: [txn, ...c.transactions] }));
    setPending(null); setQuickText(''); setQuickAmount(''); setQuickPerson(''); setQuickDueDate(''); setTypeChoice('sale'); setQuickEntryOpen(false);
    notify('Entry saved.');
    if (navigator.vibrate) navigator.vibrate(18);
  };

  const handleQuickSubmit = (event?: FormEvent) => {
    event?.preventDefault();
    const description = quickText.trim();
    const amount = Number(quickAmount);
    if (!description) { notify('Enter what the sale or payment was for.'); return; }
    if (!Number.isFinite(amount) || amount <= 0) { notify('Enter an amount greater than zero.'); return; }
    const selectedType = typeChoice === 'auto' ? 'sale' : typeChoice;
    const parsed = parseTransaction(description + ' for KES ' + amount, data);
    if (!parsed) { notify('Check the description and amount, then try again.'); return; }
    parsed.type = selectedType;
    parsed.description = description;
    parsed.amount = Math.round(amount);
    parsed.customerName = selectedType === 'credit' || selectedType === 'payment' ? (quickPerson.trim() || undefined) : undefined;
    if ((selectedType === 'credit' || selectedType === 'payment') && !parsed.customerName) {
      notify('Enter the customer’s name.'); return;
    }
    if (selectedType === 'payment' && !data.customers.some(c => c.name.toLowerCase() === (parsed.customerName ?? '').toLowerCase() && c.balance > 0)) {
      notify('No unpaid balance found for this person. Add their name and balance first.'); return;
    }
    parsed.dueDate = selectedType === 'credit' ? (quickDueDate || addDays(today(), 7)) : undefined;
    if (selectedType === 'sale' || selectedType === 'payment' || selectedType === 'expense') parsed.paymentMethod = paymentMethodChoice;
    else parsed.paymentMethod = undefined;
    if (selectedType === 'payment') parsed.stockQuantityDelta = undefined;
    if (selectedType === 'expense' && parsed.stockQuantityDelta !== undefined && parsed.stockQuantityDelta < 0) parsed.stockQuantityDelta = undefined;
    const person = parsed.customerName ? parsed.customerName + ' · ' : '';
    parsed.summary = person + TYPE_META[selectedType].label + ' · ' + money(parsed.amount) + ' · ' + description;
    setPending(parsed);
  };

  const startVoice = () => {
    if (!navigator.onLine) {
      setVoiceState('unsupported');
      notify('Voice recognition needs an internet connection in this browser. Offline, tap the description field and use your phone keyboard microphone if available.');
      return;
    }
    const Recognition = (window as Window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition
      ?? (window as Window & { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
    if (!Recognition) { setVoiceState('unsupported'); notify('This browser does not support in-app voice recognition. Use the microphone on your phone keyboard in the description field.'); return; }
    try {
      recognitionRef.current?.abort();
      const recognition = new Recognition();
      recognitionRef.current = recognition;
      recognition.lang = voiceLanguage;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onstart = () => setVoiceState('listening');
      recognition.onresult = event => {
        const spoken = event.results?.[0]?.[0]?.transcript ?? '';
        setVoiceState('idle');
        recognitionRef.current = null;
        const parsed = parseTransaction(spoken, data);
        if (parsed) {
          setQuickText(parsed.description);
          setQuickAmount(String(parsed.amount));
          setQuickPerson(parsed.customerName ?? '');
          setTypeChoice(parsed.type);
          setPaymentMethodChoice(parsed.paymentMethod ?? 'cash');
          setPending(parsed);
        } else {
          setQuickText(normalizeSpokenNumbers(spoken));
          notify('I heard you, but could not identify the amount. Check the details before saving.');
        }
      };
      recognition.onerror = event => {
        setVoiceState('idle');
        recognitionRef.current = null;
        const reason = event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? 'Allow microphone access for Hesabu in your browser settings, then try again.'
          : event.error === 'network'
            ? 'The voice service could not connect. Check your data connection and try again.'
            : 'Could not hear that clearly. Move closer to the phone microphone and try again.';
        notify(reason);
      };
      recognition.onend = () => {
        recognitionRef.current = null;
        setVoiceState(current => current === 'listening' ? 'idle' : current);
      };
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setVoiceState('idle');
      notify('Microphone could not start. Check browser permission or use the phone keyboard microphone.');
    }
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

  const recordPayment = (customer: Customer, amountValue: string, note: string, paymentMethod: 'cash' | 'mpesa' = 'cash') => {
    const entered = Math.max(0, Number(amountValue) || 0);
    const supplierPayment = customer.kind === 'supplier' || (!customer.kind && customer.balance < 0);
    const refundingCustomerCredit = customer.kind === 'customer' && customer.balance < 0;
    const amount = supplierPayment || refundingCustomerCredit ? Math.min(Math.abs(customer.balance), entered) : entered;
    if (!amount) return;
    const txn: Transaction = { id: id('txn'), type: supplierPayment || refundingCustomerCredit ? 'expense' : 'payment', description: note.trim() || (supplierPayment ? 'Supplier payment' : refundingCustomerCredit ? 'Customer credit refund' : 'Debt payment received'), amount, date: today(), tradingDay: tradingDayFor(new Date(), data.shopInfo.tradingDayStart ?? '06:00', data.shopInfo.tradingDayEnd ?? '21:00'), time: currentTime(), customerId: customer.id, customerName: customer.name, category: supplierPayment ? 'Supplier payment' : refundingCustomerCredit ? 'Customer refund' : undefined, paymentMethod: supplierPayment || refundingCustomerCredit ? undefined : paymentMethod };
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

  const saveReminder = (values: { title: string; detail: string; amount: string; dueDate: string; kind: Reminder['kind']; customerId?: string; stockItemId?: string }, existing?: Reminder) => {
    const reminder: Reminder = { id: existing?.id ?? id('rem'), title: values.title.trim(), detail: values.detail.trim(), amount: values.amount.trim() ? Math.max(0, Number(values.amount) || 0) : undefined, dueDate: values.dueDate || today(), kind: values.kind, customerId: values.customerId ?? existing?.customerId, stockItemId: values.stockItemId ?? existing?.stockItemId, done: existing?.done ?? false };
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
  const openReminderRecord = (reminder: Reminder) => {
    if (reminder.customerId) {
      const customer = data.customers.find(item => item.id === reminder.customerId);
      if (customer) { navigate('debts'); setQuery(customer.name); return; }
    }
    if (reminder.stockItemId) {
      const item = data.stock.find(stock => stock.id === reminder.stockItemId);
      if (item) { navigate('stock'); setQuery(item.name); return; }
    }
    notify('This reminder is not linked to a shop record.');
  };

  const shareReport = () => {
    if (!navigator.onLine) {
      setQueuedReportDate(reportDate);
      notify('Report saved on this phone. Connect to the internet, then tap Share on WhatsApp.');
      return;
    }
    const url = 'https://wa.me/?text=' + encodeURIComponent(report.text);
    window.open(url, '_blank', 'noopener,noreferrer');
    setQueuedReportDate(null);
    notify('WhatsApp opened. Review the report and tap Send.');
  };

  const shareReceipt = (transaction: Transaction, customer?: Customer) => {
    const phone = customer?.phone ? normalizeKenyanWhatsAppNumber(customer.phone) : null;
    if (customer?.phone && !phone) { notify('This customer phone number is not a valid Kenyan WhatsApp number. Correct it in the contact record.'); return; }
    const message = receiptMessage(data.shopInfo.name, transaction, customer?.balance);
    window.open(whatsAppUrl(message, phone), '_blank', 'noopener,noreferrer');
    setModal(null);
    notify('Receipt opened in WhatsApp. Review it before sending.');
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
    updateData(current => ({ ...current, shopInfo: { ...current.shopInfo, name: name.trim(), owner: owner.trim(), phone: phone.trim(), businessType } }));
    setModal(null); notify('Shop details saved.');
  };

  const resetDemo = () => {
    if (!window.confirm('Reset this browser to the original Mama Grace demo ledger? Your saved changes will be lost.')) return;
    const original = makeDemoData(); setData(original); saveData(original); setModal(null); setSection('home'); notify('Demo ledger reset.');
  };

  const downloadFile = (filename: string, contents: string, mimeType: string): boolean => {
    try {
      const blob = new Blob([contents], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = filename;
      document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1200);
      return true;
    } catch { return false; }
  };
  const exportBackup = () => {
    const envelope = createBackupEnvelope(data);
    if (!downloadFile(`hesabu-backup-${today()}.json`, JSON.stringify(envelope, null, 2), 'application/json')) {
      notify('Backup could not be downloaded. Try again or use another browser.');
      return;
    }
    const timestamp = new Date().toISOString();
    if (markBackupAt(timestamp)) {
      setLastBackupAt(timestamp);
      notify('Backup downloaded. Keep the file somewhere safe.');
    } else notify('Backup downloaded, but Hesabu could not save its backup date. Keep the file somewhere safe.');
  };
  const exportCsv = () => {
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = [['Date', 'Time', 'Type', 'Description', 'Amount KES', 'Payment method', 'Person', 'Due date', 'Category'], ...data.transactions.map(t => [t.date, t.time, t.type, t.description, t.amount, t.paymentMethod ?? '', t.customerName ?? '', t.dueDate ?? '', t.category ?? ''])];
    downloadFile(`hesabu-transactions-${today()}.csv`, rows.map(row => row.map(escape).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
    notify('Transactions exported to CSV.');
  };
  const importBackup = async (file: File) => {
    try {
      if (file.size > 10 * 1024 * 1024) { notify('This backup is larger than 10 MB. Nothing was changed.'); return; }
      const parsed = parseBackupPayload(JSON.parse(await file.text()));
      if (!parsed) { notify('That file is not a valid Hesabu backup. Nothing was changed.'); return; }
      if (!window.confirm('Restore this backup and replace the data in this browser? Download your current backup first if you need to keep it.')) return;
      setData(parsed);
      setStorageWriteFailed(!saveData(parsed));
      setModal(null);
      notify('Backup restored. Check the storage warning before closing Hesabu.');
    } catch { notify('That file could not be read as a Hesabu backup. Nothing was changed.'); }
  };

  const editDraft = (values: { type: TransactionType; description: string; amount: string; customerName: string; dueDate: string; stockItemName: string }) => {
    if (!pending) return;
    const item = data.stock.find(s => s.name === values.stockItemName);
    const amount = Math.max(0, Number(values.amount) || 0);
    const next: TransactionDraft = {
      ...pending, type: values.type, description: values.description.trim(), amount,
      customerName: values.customerName.trim() || undefined, dueDate: values.type === 'credit' ? values.dueDate || addDays(today(), 7) : undefined,
      paymentMethod: values.type === 'sale' || values.type === 'payment' ? (pending.paymentMethod ?? paymentMethodChoice) : undefined,
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
          <div className={cn('network-status', online ? 'network-online' : 'network-offline')}><span />{online ? 'Online' : 'Offline · saved here'}</div><div className="hidden text-right sm:block"><div className="text-[11px] font-bold text-hesabu-ink">{shortDay(today())}</div><div className="mt-0.5 text-[10px] text-hesabu-muted">Local ledger</div></div>
          <button className="profile-chip" onClick={() => setProfileMenuOpen(v => !v)}><Settings2 size={16} strokeWidth={1.8} />Settings</button>
          {profileMenuOpen && <div className="profile-menu"><div className="border-b border-hesabu-line px-3 pb-3 pt-1"><div className="text-xs font-bold">{data.shopInfo.name}</div><div className="mt-1 text-[10px] text-hesabu-muted">{data.shopInfo.businessType}</div></div><button onClick={() => { setProfileMenuOpen(false); setModal({ kind: 'profile' }); }}><Settings2 size={15} /> Shop details</button><button onClick={() => { setProfileMenuOpen(false); setModal({ kind: 'settings' }); }}><SlidersHorizontal size={15} /> Preferences</button></div>}
        </div>
      </div>
    </header>

    <main className="app-main">
      {section === 'home' && <div className="ledger-home">
        <header className="ledger-page-head"><div className="ledger-head-copy"><div className="ledger-date-line">{fullDateText(tradingDate)} <span>·</span> DAILY BOOK</div><h1>{data.shopInfo.name}</h1><p>{data.shopInfo.owner ? `Shop records for ${data.shopInfo.owner}` : 'Your shop’s daily record'}</p></div><button className="ledger-report-button" onClick={() => { setReportDate(tradingDate); setReportPeriod('daily'); navigate('more'); }}><FileText size={16} /> <span>Today’s report</span></button></header>
        <section className="cashflow-hero" aria-label="Today’s net cash position">
          <div className="cashflow-hero-top"><span>NET CASH TODAY</span><span>{todayTransactions.length} {todayTransactions.length === 1 ? 'entry' : 'entries'}</span></div>
          <div className="cashflow-hero-value"><strong className={todaysIn - todaysOut < 0 ? 'cashflow-negative' : 'cashflow-positive'}>{todaysIn - todaysOut < 0 ? '−' : ''}{money(Math.abs(todaysIn - todaysOut))}</strong><span>{todaysIn - todaysOut < 0 ? 'More went out than came in' : todaysIn - todaysOut > 0 ? 'More came in than went out' : 'No net movement recorded yet'}</span></div>
          <div className="cashflow-bar"><span className="cashflow-bar-in" style={{ width: `${(todaysIn / Math.max(1, todaysIn + todaysOut)) * 100}%` }} /><span className="cashflow-bar-out" style={{ width: `${(todaysOut / Math.max(1, todaysIn + todaysOut)) * 100}%` }} /></div>
          <div className="cashflow-breakdown"><div><span className="cashflow-key cashflow-key-in" /><span>Money in</span><strong>{money(todaysIn)}</strong></div><div><span className="cashflow-key cashflow-key-out" /><span>Money out</span><strong>{money(todaysOut)}</strong></div><small>Cash {money(todayTransactions.filter(t => (t.type === 'sale' || t.type === 'payment') && t.paymentMethod !== 'mpesa').reduce((sum, t) => sum + t.amount, 0))} <i>·</i> M-Pesa {money(todayTransactions.filter(t => (t.type === 'sale' || t.type === 'payment') && t.paymentMethod === 'mpesa').reduce((sum, t) => sum + t.amount, 0))}</small></div>
          <div className="cashflow-collect">Customer balances to collect <strong>{money(outstanding)}</strong></div>
        </section>
        <section className="ledger-quick-actions" aria-label="Add a transaction"><div className="ledger-section-label">WHAT HAPPENED?</div><div className="ledger-action-list">
          <button className="ledger-action ledger-action-sale" onClick={() => { setTypeChoice('sale'); setPaymentMethodChoice('cash'); setPending(null); setQuickEntryOpen(true); }}><span className="ledger-action-icon"><Wallet size={18} /></span><span>Sale</span></button>
          <button className="ledger-action ledger-action-expense" onClick={() => { setTypeChoice('expense'); setPaymentMethodChoice('cash'); setPending(null); setQuickEntryOpen(true); }}><span className="ledger-action-icon"><ArrowUpRight size={18} /></span><span>Expense</span></button>
          <button className="ledger-action ledger-action-credit" onClick={() => { setTypeChoice('credit'); setPending(null); setQuickEntryOpen(true); }}><span className="ledger-action-icon"><HandCoins size={18} /></span><span>On credit</span></button>
        </div></section>
        <button className="voice-entry-launch" onClick={() => { setQuickEntryOpen(true); if (voiceState === 'listening') recognitionRef.current?.stop(); else startVoice(); }}><span className="voice-entry-icon"><Mic size={19} /></span><span className="voice-entry-copy"><strong>Speak a sale or expense</strong><small>Try “two kilos of sugar, two hundred, cash”</small></span><span className="voice-entry-action">{voiceState === 'listening' ? 'Stop' : 'Speak'} <ChevronRight size={16} /></span></button>
        {!shopIsOpen && todayTransactions.length > 0 && <section className="day-close-banner"><div><strong>{currentDailyClose ? 'Till count saved' : 'Trading day closed'}</strong><span>{currentDailyClose ? `Expected ${money(currentDailyClose.expectedCash)} · Counted ${money(currentDailyClose.countedCash)}` : `${todayTransactions.length} ${todayTransactions.length === 1 ? 'entry is' : 'entries are'} ready for closing count.`}</span></div><button onClick={() => setModal({ kind: 'daily-close', date: tradingDate })}>{currentDailyClose ? 'Review count' : 'Count till & close'} <ChevronRight size={15} /></button></section>}
        {storageWriteFailed && <div className="storage-error-inline" role="status">Some changes may not be saved on this device. Open More and download a backup.</div>}
        {quickEntryOpen && <section id="transaction-entry" className="surface ledger-entry-panel">
          <div className="ledger-entry-heading"><div><div className="ledger-section-label">NEW RECORD</div><h2>{pending ? 'Review this entry' : 'Record a transaction'}</h2><p>Check the details before the entry is added to your book.</p></div><button className="ledger-close-entry" onClick={() => { setQuickEntryOpen(false); setPending(null); }} aria-label="Close transaction form">×</button></div>
          <div className="type-picker simple-type-picker" role="group" aria-label="What happened?">{(['sale', 'credit', 'expense', 'payment'] as const).map(type => { const Icon = TYPE_META[type].icon; return <button key={type} onClick={() => { setTypeChoice(type); setPaymentMethodChoice('cash'); setPending(null); }} className={cn('type-pick', typeChoice === type && 'type-pick-active')}><Icon size={16} strokeWidth={1.9} /><span>{TYPE_META[type].label}</span></button>; })}</div>
          <form className="simple-entry-form ledger-entry-form" onSubmit={handleQuickSubmit}>
            <Field label={typeChoice === 'credit' ? 'What did the customer take?' : typeChoice === 'expense' ? 'What did you pay for?' : typeChoice === 'payment' ? 'What was the payment for?' : 'What did you sell?'} value={quickText} onChange={setQuickText} placeholder={typeChoice === 'credit' ? 'e.g. 2 loaves of bread' : typeChoice === 'expense' ? 'e.g. Shop rent' : typeChoice === 'payment' ? 'e.g. Kamau’s debt' : 'e.g. Bread and milk'} required />
            <Field label="Amount (KES)" value={quickAmount} onChange={setQuickAmount} placeholder="0" type="number" min={1} required inputMode="numeric" />
            {(typeChoice === 'credit' || typeChoice === 'payment') && <Field label={typeChoice === 'credit' ? 'Customer name' : 'Who paid you?'} value={quickPerson} onChange={setQuickPerson} placeholder="Enter customer name" required />}
            {typeChoice === 'credit' && <Field label="When should they pay? (optional)" value={quickDueDate} onChange={setQuickDueDate} type="date" />}
            {(typeChoice === 'sale' || typeChoice === 'payment' || typeChoice === 'expense') && <div className="simple-payment-choice"><span>{typeChoice === 'expense' ? 'Paid using' : 'Paid by'}</span><div><button type="button" onClick={() => setPaymentMethodChoice('cash')} className={paymentMethodChoice === 'cash' ? 'selected' : ''}>Cash</button><button type="button" onClick={() => setPaymentMethodChoice('mpesa')} className={paymentMethodChoice === 'mpesa' ? 'selected' : ''}>M-Pesa</button></div></div>}
            <div className="simple-form-actions"><Button type="submit" className="flex-1"><Check size={16} />Review entry</Button><button type="button" className="clear-entry" onClick={() => { setQuickText(''); setQuickAmount(''); setQuickPerson(''); setQuickDueDate(''); setPending(null); setTypeChoice('sale'); setPaymentMethodChoice('cash'); }}>Clear</button></div>
          </form>
          {pending && <div className="draft-review" aria-live="polite"><div className="simple-review-heading">Review before saving</div><div className="draft-review-grid"><div><span>Type</span><strong>{TYPE_META[pending.type].label}</strong></div><div><span>Amount</span><strong>{money(pending.amount)}</strong></div><div><span>Description</span><strong>{pending.description}</strong></div>{pending.customerName && <div><span>Customer</span><strong>{pending.customerName}</strong></div>}{pending.paymentMethod && <div><span>Payment method</span><strong>{pending.paymentMethod === 'mpesa' ? 'M-Pesa' : 'Cash'}</strong></div>}{pending.dueDate && <div><span>Due date</span><strong>{dateText(pending.dueDate, { day: 'numeric', month: 'short', year: 'numeric' })}</strong></div>}</div>{pending.type === 'credit' && <p className="simple-review-note">This amount has not been received yet. It will be added to the customer’s balance.</p>}{pendingStockExceedsCount && pendingStockItem && <p className="simple-review-warning">Only {pendingStockItem.quantity} {pendingStockItem.unit} are in the stock record. Saving will bring the recorded quantity to zero.</p>}<div className="simple-form-actions"><Button onClick={() => applyTransaction(pending)} className="flex-1"><Check size={15} />Confirm and save</Button><Button variant="outline" onClick={() => setModal({ kind: 'edit-draft' })}>Edit fields</Button><button type="button" className="clear-entry" onClick={() => setPending(null)}>Cancel</button></div></div>}
          <div className="ledger-entry-footer"><button type="button" className="speak-link" onClick={() => voiceState === 'listening' ? recognitionRef.current?.stop() : startVoice()}><span className="speak-icon"><Mic size={15} /></span>{voiceState === 'listening' ? 'Stop listening' : 'Speak this entry'}</button><div className="voice-language-row"><span>Speak in</span><div><button type="button" aria-pressed={voiceLanguage === 'en-KE'} className={voiceLanguage === 'en-KE' ? 'voice-language-active' : ''} onClick={() => setVoiceLanguage('en-KE')}>English</button><button type="button" aria-pressed={voiceLanguage === 'sw-KE'} className={voiceLanguage === 'sw-KE' ? 'voice-language-active' : ''} onClick={() => setVoiceLanguage('sw-KE')}>Kiswahili</button></div></div>{voiceState === 'unsupported' && <p className="simple-review-note">In-app voice may need data and microphone permission. Offline, use the microphone on your phone keyboard if available.</p>}</div>
        </section>}
        {(data.customers.some(c => c.balance > 0 && c.dueDate && daysUntil(c.dueDate) < 0) || lowStock.length > 0) && <section className="home-alert-strip">
          {data.customers.some(c => c.balance > 0 && c.dueDate && daysUntil(c.dueDate) < 0) && <button onClick={() => navigate('debts')}><span className="alert-count">{data.customers.filter(c => c.balance > 0 && c.dueDate && daysUntil(c.dueDate) < 0).length}</span><span>overdue customers</span><ChevronRight size={14} /></button>}
          {lowStock.length > 0 && <button onClick={() => navigate('stock')}><span className="alert-count">{lowStock.length}</span><span>items need restocking</span><ChevronRight size={14} /></button>}
        </section>}
        <section className="surface ledger-book home-recent"><header className="ledger-book-heading"><div><div className="ledger-section-label">LATEST ACTIVITY</div><h2>Recent transactions</h2><p>Your last five entries, newest first.</p></div><button className="ledger-view-all" onClick={() => navigate('ledger')}>Open ledger <ChevronRight size={15} /></button></header>
          {sortedTransactions.length ? <div className="simple-transaction-list ledger-transaction-list">{sortedTransactions.slice(0,5).map(tx => <TransactionRow key={tx.id} transaction={tx} onClick={() => setModal({ kind: 'transaction', transactionId: tx.id })} onDelete={() => deleteTransaction(tx)} compact />)}</div> : <EmptyState title="Your book is ready" detail="Your first sale, expense or customer credit will appear here." action={<Button onClick={() => { setTypeChoice('sale'); setQuickEntryOpen(true); }}><Plus size={15} /> Add first entry</Button>} />}
        </section>
        <div className="ledger-privacy-note"><CheckCircle2 size={16} /><span><strong>Saved on this device</strong><small>Your records stay on this device. Keep a separate backup in More.</small></span></div>
      </div>}
      {section === 'ledger' && <LedgerSection transactions={sortedTransactions} filter={filterTransactions} setFilter={setFilterTransactions} search={transactionSearch} setSearch={setTransactionSearch} dateFilter={ledgerDateFilter} setDateFilter={setLedgerDateFilter} onTransaction={transaction => setModal({ kind: 'transaction', transactionId: transaction.id })} onDelete={deleteTransaction} />}
      {section === 'more' && <MoreSection onStock={() => navigate('stock')} online={online} queuedReportDate={queuedReportDate} report={report} reportPeriod={reportPeriod} setReportPeriod={setReportPeriod} reportDate={reportDate} setReportDate={setReportDate} onShareReport={shareReport} onCopyReport={copyReport} onPrintReport={() => window.print()} reminders={allReminders} onToggleReminder={toggleReminder} onEditReminder={reminder => setModal({ kind: 'reminder', reminder })} onAddReminder={() => setModal({ kind: 'reminder' })} onOpenRecord={openReminderRecord} customers={data.customers} stock={data.stock} onExportBackup={exportBackup} onExportCsv={exportCsv} onImportBackup={importBackup} onSettings={() => setModal({ kind: 'settings' })} lastBackupAt={lastBackupAt} storageWriteFailed={storageWriteFailed} storageProtection={storageProtection} />}
      {section === 'debts' && <DebtsSection data={data} query={query} setQuery={setQuery} direction={debtDirection} setDirection={setDebtDirection} onAdd={() => setModal({ kind: 'customer' })} onPayment={customerId => setModal({ kind: 'payment', customerId })} onReminder={customer => { const phone = normalizeKenyanWhatsAppNumber(customer.phone); if (!phone) { notify('Please add a valid Kenyan phone number for this customer.'); return; } const message = debtReminderMessage(customer.name, data.shopInfo.name, customer.balance, customer.dueDate); window.open(whatsAppUrl(message, phone), '_blank', 'noopener,noreferrer'); }} onCreateFollowUp={customer => setModal({ kind: 'reminder', link: { customerId: customer.id, label: customer.name, kind: 'customer' } })} />}
      {section === 'stock' && <StockSection data={data} query={query} setQuery={setQuery} onAdd={() => setModal({ kind: 'stock' })} onEdit={itemId => setModal({ kind: 'stock-edit', itemId })} onUpdate={(itemId, mode) => setModal({ kind: 'stock-update', itemId, mode })} onReminder={item => setModal({ kind: 'reminder', link: { stockItemId: item.id, label: item.name, kind: 'other' } })} />}
    </main>

    <nav className="mobile-nav" aria-label="Primary navigation">{NAV.map(item => { const Icon = item.icon; return <button key={item.id} onClick={() => navigate(item.id)} className={cn('mobile-nav-item', section === item.id && 'mobile-nav-active')}><span className="mobile-nav-icon"><Icon size={21} strokeWidth={section === item.id ? 2.2 : 1.8} /></span><span>{item.label}</span>{section === item.id && <span className="mobile-nav-dot" />}</button>; })}</nav>

    {modal?.kind === 'customer' && <CustomerModal onClose={closeModal} onSave={addCustomer} />}
    {modal?.kind === 'payment' && data.customers.find(c => c.id === modal.customerId) && <PaymentModal customer={data.customers.find(c => c.id === modal.customerId)!} onClose={closeModal} onSave={recordPayment} />}
    {modal?.kind === 'stock' && <StockModal onClose={closeModal} onSave={saveStock} />}
    {modal?.kind === 'stock-update' && data.stock.find(s => s.id === modal.itemId) && <StockUpdateModal item={data.stock.find(s => s.id === modal.itemId)!} mode={modal.mode} onClose={closeModal} onSave={updateStock} />}
    {modal?.kind === 'stock-edit' && data.stock.find(s => s.id === modal.itemId) && <StockEditModal item={data.stock.find(s => s.id === modal.itemId)!} onClose={closeModal} onSave={saveStockDetails} />}
    {modal?.kind === 'reminder' && <ReminderModal reminder={modal.reminder} link={modal.link ?? (modal.reminder?.customerId ? { customerId: modal.reminder.customerId, label: data.customers.find(customer => customer.id === modal.reminder?.customerId)?.name ?? 'Customer', kind: 'customer' as const } : modal.reminder?.stockItemId ? { stockItemId: modal.reminder.stockItemId, label: data.stock.find(item => item.id === modal.reminder?.stockItemId)?.name ?? 'Stock item', kind: 'other' as const } : undefined)} onClose={closeModal} onSave={values => saveReminder(values, modal.reminder)} onDelete={deleteReminder} />}
    {modal?.kind === 'profile' && <ProfileModal data={data} onClose={closeModal} onSave={updateProfile} />}
    {modal?.kind === 'settings' && <SettingsModal shopInfo={data.shopInfo} onSaveTradingHours={(start, end) => { updateData(current => ({ ...current, shopInfo: { ...current.shopInfo, tradingDayStart: start, tradingDayEnd: end } })); notify('Trading hours saved. New entries will use this business day.'); }} onClose={closeModal} onReset={resetDemo} onProfile={() => setModal({ kind: 'profile' })} onExportBackup={exportBackup} onExportCsv={exportCsv} onImportBackup={importBackup} lastBackupAt={lastBackupAt} storageProtection={storageProtection} onProtectStorage={protectDeviceStorage} />}
    {modal?.kind === 'daily-close' && <DailyCloseModal data={data} date={modal.date} existing={data.dailyCloses?.find(close => close.date === modal.date)} onClose={closeModal} onSave={saveDailyClose} />}
    {modal?.kind === 'edit-draft' && pending && <EditDraftModal draft={pending} items={data.stock} onClose={closeModal} onSave={editDraft} />}
    {modal?.kind === 'transaction' && data.transactions.find(t => t.id === modal.transactionId) && <TransactionModal transaction={data.transactions.find(t => t.id === modal.transactionId)!} customer={data.customers.find(c => c.id === data.transactions.find(t => t.id === modal.transactionId)?.customerId)} onClose={closeModal} onEdit={transaction => setModal({ kind: 'edit-transaction', transactionId: transaction.id })} onDelete={deleteTransaction} onShareReceipt={transaction => shareReceipt(transaction, data.customers.find(c => c.id === transaction.customerId))} />}
    {modal?.kind === 'edit-transaction' && data.transactions.find(t => t.id === modal.transactionId) && <EditTransactionModal transaction={data.transactions.find(t => t.id === modal.transactionId)!} onClose={closeModal} onSave={saveTransactionEdit} />}
    <WelcomeScreen show={showWelcome} onUseDemo={chooseDemo} onCreateShop={createLocalShop} />
    <Toast message={toastMessage} onClose={closeToast} />
  </div>;
}

interface SpeechRecognitionLike {
  lang: string; interimResults: boolean; maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void; stop: () => void; abort: () => void;
}

function LedgerSection({ transactions, filter, setFilter, search, setSearch, dateFilter, setDateFilter, onTransaction, onDelete }: {
  transactions: Transaction[]; filter: 'all' | 'cash' | 'mpesa' | 'credit' | 'expense'; setFilter: (value: 'all' | 'cash' | 'mpesa' | 'credit' | 'expense') => void;
  search: string; setSearch: (value: string) => void; dateFilter: string; setDateFilter: (value: string) => void;
  onTransaction: (transaction: Transaction) => void; onDelete: (transaction: Transaction) => void;
}) {
  const filters: { id: typeof filter; label: string }[] = [{id:'all',label:'All'},{id:'cash',label:'Cash'},{id:'mpesa',label:'M-Pesa'},{id:'credit',label:'Credit'},{id:'expense',label:'Expenses'}];
  const shown = transactions.filter(tx => {
    const matches = filter === 'all' || (filter === 'cash' && (tx.type === 'sale' || tx.type === 'payment') && tx.paymentMethod !== 'mpesa') || (filter === 'mpesa' && (tx.type === 'sale' || tx.type === 'payment') && tx.paymentMethod === 'mpesa') || (filter === 'credit' && tx.type === 'credit') || (filter === 'expense' && tx.type === 'expense');
    return matches && `${tx.description} ${tx.customerName ?? ''} ${tx.category ?? ''}`.toLowerCase().includes(search.toLowerCase()) && (!dateFilter || tx.date === dateFilter);
  });
  const grouped = shown.reduce<Record<string, Transaction[]>>((result, tx) => { (result[tx.date] ??= []).push(tx); return result; }, {});
  const received = shown.filter(tx => tx.type === 'sale' || tx.type === 'payment').reduce((sum, tx) => sum + tx.amount, 0);
  const spent = shown.filter(tx => tx.type === 'expense').reduce((sum, tx) => sum + tx.amount, 0);
  return <><SectionTitle eyebrow="THE DAILY BOOK" title="Ledger" detail="Search every entry, check how it was paid and open a record to correct it." />
    <section className="ledger-overview-strip"><div><span>Money received</span><strong className="money-positive">{money(received)}</strong></div><div><span>Money spent</span><strong className="money-negative">{money(spent)}</strong></div><div><span>Net movement</span><strong>{money(received-spent)}</strong></div></section>
    <section className="surface ledger-full-panel"><div className="ledger-full-filters"><label className="search-field"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search description or customer" aria-label="Search ledger" /></label><label className="ledger-date-filter"><span>Date</span><input type="date" value={dateFilter} max={today()} onChange={e=>setDateFilter(e.target.value)} /></label></div>
      <div className="ledger-filter-chips" role="group" aria-label="Filter entries">{filters.map(item=><button key={item.id} className={filter===item.id?'ledger-filter-active':''} onClick={()=>setFilter(item.id)}>{item.label}</button>)}</div>
      <div className="ledger-full-list">{Object.keys(grouped).length ? Object.entries(grouped).map(([date,items])=><section key={date} className="ledger-date-group"><header className="ledger-date-heading"><strong>{date===today()?'Today':dateText(date,{weekday:'long',day:'numeric',month:'short',year:'numeric'})}</strong><span>{items.length} {items.length===1?'entry':'entries'}</span></header>{items.map(tx=><TransactionRow key={tx.id} transaction={tx} onClick={()=>onTransaction(tx)} onDelete={()=>onDelete(tx)} compact />)}</section>) : <EmptyState title="No entries found" detail="Change the search, date or filter to see other records." />}</div>
      <div className="ledger-full-foot">{shown.length} {shown.length===1?'entry':'entries'} shown</div>
    </section>
  </>;
}

function MoreSection({ onStock, online, queuedReportDate, report, reportPeriod, setReportPeriod, reportDate, setReportDate, onShareReport, onCopyReport, onPrintReport, reminders, onToggleReminder, onEditReminder, onAddReminder, onOpenRecord, customers, stock, onExportBackup, onExportCsv, onImportBackup, onSettings, lastBackupAt, storageWriteFailed, storageProtection }: {
  onStock: () => void; online: boolean; queuedReportDate: string | null;
  report: ReturnType<typeof buildReport>; reportPeriod: 'daily'|'weekly'|'monthly'; setReportPeriod: (value:'daily'|'weekly'|'monthly')=>void;
  reportDate:string; setReportDate:(value:string)=>void; onShareReport:()=>void; onCopyReport:()=>void; onPrintReport:()=>void;
  reminders:Reminder[]; onToggleReminder:(reminder:Reminder)=>void; onEditReminder:(reminder:Reminder)=>void; onAddReminder:()=>void;
  onOpenRecord:(reminder:Reminder)=>void; customers:Customer[]; stock:StockItem[];
  onExportBackup:()=>void; onExportCsv:()=>void; onImportBackup:(file:File)=>void; onSettings:()=>void;
  lastBackupAt:string|null; storageWriteFailed:boolean; storageProtection:'checking'|'protected'|'standard'|'unsupported';
}) {
  const open=reminders.filter(r=>!r.done), done=reminders.filter(r=>r.done);
  return <div className="more-page"><SectionTitle eyebrow="SHOP TOOLS" title="More" detail="Reports, reminders, stock and copies of your shop records." right={<Button size="sm" variant="secondary" onClick={onStock}><Package size={14} /> Stock</Button>} />
    <ReportsSection online={online} queuedReportDate={queuedReportDate} report={report} reportPeriod={reportPeriod} setReportPeriod={setReportPeriod} reportDate={reportDate} setReportDate={setReportDate} onShare={onShareReport} onCopy={onCopyReport} onPrint={onPrintReport} />
    <div className="more-tools-grid">
      <section className="surface more-tool-panel"><header className="more-tool-heading"><div><span className="ledger-section-label">FOLLOW THROUGH</span><h2>Reminders</h2><p>Tasks you can tick off when they are done.</p></div><Button size="sm" onClick={onAddReminder}><Plus size={14} /> Add</Button></header>
        {open.length ? <div className="reminder-task-list">{open.map(reminder=>{const customer=reminder.customerId?customers.find(item=>item.id===reminder.customerId):undefined;const item=reminder.stockItemId?stock.find(stockItem=>stockItem.id===reminder.stockItemId):undefined;return <div key={reminder.id} className="reminder-task"><button className="reminder-task-check" onClick={()=>onToggleReminder(reminder)} aria-label={`Mark ${reminder.title} as done`}><span /></button><button className="reminder-task-copy" onClick={()=>onEditReminder(reminder)}><strong>{reminder.title}</strong><small>{reminder.kind==='customer'?'Customer follow-up':reminder.kind==='supplier'?'Supplier':reminder.kind==='bill'?'Bill / expense':'Task'} · {daysUntil(reminder.dueDate)<0?'Overdue':daysUntil(reminder.dueDate)===0?'Today':daysUntil(reminder.dueDate)===1?'Tomorrow':dateText(reminder.dueDate,{day:'numeric',month:'short'})}</small>{customer&&<small className="reminder-linked-label">Debt · {customer.name}</small>}{item&&<small className="reminder-linked-label">Stock · {item.name}</small>}{reminder.detail&&<small>{reminder.detail}</small>}</button>{(customer||item)&&<button className="reminder-open-record" onClick={()=>onOpenRecord(reminder)}>Open</button>}{reminder.amount!==undefined&&<strong className="reminder-task-amount">{money(reminder.amount)}</strong>}</div>})}</div> : <EmptyState title="No reminders waiting" detail="Add a follow-up or bill so it is easy to find later." />}
        {done.length>0&&<details className="completed-reminders"><summary>{done.length} completed</summary>{done.map(reminder=><div key={reminder.id} className="completed-reminder"><button onClick={()=>onToggleReminder(reminder)} aria-label={`Reopen ${reminder.title}`}>↶</button><span>{reminder.title}</span><button onClick={()=>onEditReminder(reminder)}>Edit</button></div>)}</details>}
      </section>
      <section className="surface more-tool-panel backup-panel"><header className="more-tool-heading"><div><span className="ledger-section-label">DATA SAFETY</span><h2>Backup & restore</h2><p>Your book is stored on this device only.</p></div><span className="backup-shield"><CheckCircle2 size={18} /></span></header>
        <div className="backup-status-line"><span>Last backup</span><strong>{lastBackupAt?dateText(lastBackupAt.slice(0,10),{day:'numeric',month:'short',year:'numeric'})+' · '+timeText(lastBackupAt.slice(11,16)):'No backup yet'}</strong></div>
        <div className={`backup-storage-status ${storageWriteFailed?'backup-status-error':''}`}>{storageWriteFailed?'Some recent changes may not have been saved. Download a backup now.':storageProtection==='protected'?'This browser has granted extra protection for local data.':storageProtection==='standard'?'Your records are saved in this browser. A separate backup is still important.':storageProtection==='checking'?'Checking this browser’s local storage settings.':'This browser cannot offer extra storage protection.'}</div>
        <div className="backup-actions"><Button onClick={onExportBackup}><Download size={15} /> Download backup</Button><Button variant="outline" onClick={onExportCsv}><FileSpreadsheet size={15} /> Export CSV</Button><label className="backup-restore-button"><Upload size={15} /> Restore from file<input type="file" accept="application/json,.json" onChange={event=>{const file=event.currentTarget.files?.[0];if(file)onImportBackup(file);event.currentTarget.value='';}} /></label></div>
        <p className="backup-reassurance">Your data stays on this device until you choose to export it. Restoring replaces the records in this browser.</p>
        <button className="more-settings-link" onClick={onSettings}><Settings2 size={15} /> Shop settings and storage options <ChevronRight size={15} /></button>
      </section>
    </div>
  </div>;
}

function DebtsSection({ data, query, setQuery, direction, setDirection, onAdd, onPayment, onReminder, onCreateFollowUp }: {
  data: AppData; query: string; setQuery: (v: string) => void; direction: 'owed-to-us' | 'we-owe'; setDirection: (v: 'owed-to-us' | 'we-owe') => void;
  onAdd: () => void; onPayment: (id: string) => void; onReminder: (customer: Customer) => void; onCreateFollowUp: (customer: Customer) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const customerList = data.customers.filter(c => direction === 'owed-to-us' ? c.balance > 0 : c.balance < 0).filter(c => `${c.name} ${c.phone}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
  const total = customerList.reduce((sum, c) => sum + Math.abs(c.balance), 0);
  return <>
    <SectionTitle title="People and balances" detail="See who owes the shop and who the shop needs to pay." right={<Button onClick={onAdd}>Add person</Button>} />
    <div className="debt-overview"><div><div className="text-[13px] font-medium">{direction === 'owed-to-us' ? 'Customers owe the shop' : 'The shop owes'}</div><div className="mt-2 font-display text-[28px] font-bold">{money(total)}</div><div className="mt-1 text-[12px]">{customerList.length} {customerList.length === 1 ? 'person' : 'people'}</div></div></div>
    <div className="section-tabs mt-5" role="tablist"><button role="tab" aria-selected={direction === 'owed-to-us'} className={cn(direction === 'owed-to-us' && 'section-tab-active')} onClick={() => setDirection('owed-to-us')}>Owe me <span>{data.customers.filter(c => c.balance > 0).length}</span></button><button role="tab" aria-selected={direction === 'we-owe'} className={cn(direction === 'we-owe' && 'section-tab-active')} onClick={() => setDirection('we-owe')}>I owe <span>{data.customers.filter(c => c.balance < 0).length}</span></button></div>
    <div className="debt-toolbar"><label className="search-field"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a person by name or phone" /></label><div className="text-[12px] text-hesabu-muted">Largest balance first</div></div>
    <section className="surface list-surface">
      {customerList.length === 0 ? <EmptyState title={query ? 'No matching person' : 'No outstanding balances'} detail={query ? 'Try another name or phone number.' : direction === 'owed-to-us' ? 'When someone takes goods on credit, they will appear here.' : 'Any unpaid supplier balances will show up here.'} action={!query ? <Button variant="secondary" onClick={onAdd}><Plus size={15} /> Add a person</Button> : undefined} /> : customerList.map(customer => {
        const overdue = customer.balance > 0 && customer.dueDate && daysUntil(customer.dueDate) < 0;
        const dueSoon = customer.balance > 0 && customer.dueDate && daysUntil(customer.dueDate) >= 0 && daysUntil(customer.dueDate) <= 3;
        const expandedNow = expanded === customer.id;
        const history = data.transactions.filter(t => t.customerId === customer.id || t.customerName?.toLowerCase() === customer.name.toLowerCase()).sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`));
        return <div key={customer.id} className="person-record">
          <button className="person-main" onClick={() => setExpanded(expandedNow ? null : customer.id)} aria-expanded={expandedNow}>
            <span className={cn('person-avatar', customer.balance < 0 && 'person-avatar-supplier')}>{customer.name.slice(0, 1).toUpperCase()}</span>
            <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="text-[14px] font-bold text-hesabu-ink">{customer.name}</span>{overdue && <span className="overdue-badge">{Math.abs(daysUntil(customer.dueDate!))}d overdue</span>}{dueSoon && <span className="due-soon-badge">Due soon</span>}</span><span className="mt-1 block text-[11px] text-hesabu-muted">{customer.phone || (customer.balance < 0 ? 'Supplier / business' : 'No phone added')}{customer.dueDate ? ` · Due ${shortDay(customer.dueDate)}` : ''}</span></span>
            <span className="ml-2 shrink-0 text-right"><span className={cn('block text-[14px] font-bold tabular-nums', customer.balance < 0 ? 'text-[#597B9A]' : 'text-[#B94C46]')}>{money(Math.abs(customer.balance))}</span><span className="mt-1 block text-[10px] text-hesabu-muted">{customer.balance < 0 ? (customer.kind === 'customer' ? 'Customer credit' : 'You owe') : 'Owes you'}</span></span><span className="ml-2 shrink-0 text-action">{expandedNow ? 'Hide' : 'View'}</span>
          </button>
          {expandedNow && <div className="person-expanded"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[11px] font-semibold text-hesabu-muted">Recent history</span><span className="text-[10px] text-hesabu-muted">{history.length} entries</span></div>{history.length ? <div className="mt-2">{history.map(t => <div key={t.id} className="history-line"><span className="truncate">{t.description}</span><span className={cn(t.type === 'expense' ? 'text-[#B94C46]' : t.type === 'credit' ? 'text-[#A4762A]' : 'text-hesabu-green')}>{money(t.amount)}</span></div>)}</div> : <p className="mt-2 text-xs text-hesabu-muted">No linked transactions yet. This balance was entered manually.</p>}
            <div className="mt-4 flex flex-wrap gap-2">{customer.balance !== 0 && <Button size="sm" onClick={() => onPayment(customer.id)}><Wallet size={14} /> {customer.balance < 0 ? (customer.kind === 'customer' ? 'Return customer credit' : 'Record payment made') : 'Record payment received'}</Button>}{customer.balance > 0 && <Button size="sm" variant="outline" onClick={() => onCreateFollowUp(customer)}><Bell size={14} /> Remind me</Button>}{customer.balance > 0 && customer.phone && <Button size="sm" variant="secondary" onClick={() => onReminder(customer)}><Share2 size={14} /> WhatsApp reminder</Button>}</div>
          </div>}
        </div>;
      })}
    </section>
    <p className="mx-auto mt-5 max-w-xl text-center text-[12px] leading-5 text-hesabu-muted">When a customer takes goods and will pay later, add it under “On credit”. When they pay, record a “Debt repayment”.</p>
  </>;
}

function StockSection({ data, query, setQuery, onAdd, onEdit, onUpdate, onReminder }: { data: AppData; query: string; setQuery: (v: string) => void; onAdd: () => void; onEdit: (id: string) => void; onUpdate: (id: string, mode: 'restock' | 'adjust') => void; onReminder: (item: StockItem) => void }) {
  const [filter, setFilter] = useState<'all' | 'low' | 'out'>('all');
  const shown = data.stock.filter(s => s.name.toLowerCase().includes(query.toLowerCase())).filter(s => filter === 'all' || (filter === 'low' && s.quantity > 0 && s.quantity <= s.lowStockAt) || (filter === 'out' && s.quantity === 0)).sort((a,b)=>Number(a.quantity>a.lowStockAt)-Number(b.quantity>b.lowStockAt)||(a.quantity/Math.max(1,a.lowStockAt))-(b.quantity/Math.max(1,b.lowStockAt)));
  return <>
    <SectionTitle title="Stock" detail="See what is on the shelf and what needs buying." right={<Button onClick={onAdd}>Add item</Button>} />
    <div className="stock-summary-row"><div className="stock-summary-cell"><span>Items tracked</span><b>{data.stock.length}</b></div><div className="stock-summary-cell"><span>Need buying</span><b>{lowStockCount(data.stock)}</b></div></div>
    <div className="stock-toolbar stock-toolbar-flat"><label className="search-field"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find an item" /></label><div className="segmented-control"><button className={cn(filter === 'all' && 'segment-active')} onClick={() => setFilter('all')}>All items</button><button className={cn(filter === 'low' && 'segment-active')} onClick={() => setFilter('low')}>Running low <span className="count-badge">{data.stock.filter(s=>s.quantity>0&&s.quantity<=s.lowStockAt).length}</span></button><button className={cn(filter === 'out' && 'segment-active')} onClick={() => setFilter('out')}>Out of stock <span className="count-badge">{data.stock.filter(s=>s.quantity===0).length}</span></button></div></div>
    {shown.length===0 ? <section className="surface"><EmptyState title={filter==='low'?'No low-stock items':filter==='out'?'No items are out of stock':'No matching item'} detail="There is nothing to show for this stock filter." action={filter==='all'?<Button onClick={onAdd}><Plus size={15}/> Add item</Button>:undefined}/></section> : <section className="surface stock-table">{shown.map(item=><StockRow key={item.id} item={item} onEdit={()=>onEdit(item.id)} onRestock={()=>onUpdate(item.id,'restock')} onAdjust={()=>onUpdate(item.id,'adjust')} onReminder={()=>onReminder(item)}/>)}</section>}
    <p className="mt-4 text-[12px] leading-5 text-hesabu-muted">When you record a sale, add the item name in the description to reduce its stock count automatically. You can also change the count yourself.</p>
  </>;
}
function lowStockCount(items: StockItem[]) { return items.filter(s => s.quantity <= s.lowStockAt).length; }

function StockRow({ item, onEdit, onRestock, onAdjust, onReminder }: { item: StockItem; onEdit: () => void; onRestock: () => void; onAdjust: () => void; onReminder: () => void }) {
  return <div className="stock-table-row"><div className="stock-row-name"><span className="stock-row-icon"><Package size={17}/></span><span><strong>{item.name}</strong><small>Reorder at {item.lowStockAt} {item.unit}</small></span></div><div className="stock-row-quantity"><strong>{item.quantity}</strong><small>{item.unit}</small></div><StockStatus item={item}/><div className="stock-row-actions"><button onClick={onRestock}><Plus size={14}/> Restock</button><button onClick={onAdjust}>Adjust</button><button onClick={onReminder}>Remind</button><button onClick={onEdit}>Edit</button></div></div>;
}

function ReportsSection({ online, queuedReportDate, report, reportPeriod, setReportPeriod, reportDate, setReportDate, onShare, onCopy, onPrint }: {
  online: boolean; queuedReportDate: string | null;
  report: ReturnType<typeof buildReport>; reportPeriod: 'daily' | 'weekly' | 'monthly'; setReportPeriod: (v: 'daily' | 'weekly' | 'monthly') => void;
  reportDate: string; setReportDate: (v: string) => void; onShare: () => void; onCopy: () => void; onPrint: () => void;
}) {
  const periodLabel = reportPeriod === 'daily'
    ? (reportDate === today() ? 'Today' : dateText(reportDate, { day: 'numeric', month: 'short', year: 'numeric' }))
    : reportPeriod === 'weekly' ? 'Week ending ' + dateText(reportDate)
    : 'Month to ' + dateText(reportDate);
  return <>
    <SectionTitle title="Reports" detail="See what your shop received, spent and still needs to collect." />
    <div className="report-simple-layout">
      <section className="surface report-controls">
        <div className="report-filters">
          <div className="period-tabs">{(['daily', 'weekly', 'monthly'] as const).map(period => <button key={period} className={cn(reportPeriod === period && 'period-tab-active')} onClick={() => setReportPeriod(period)}>{period === 'daily' ? 'Day' : period === 'weekly' ? 'Week' : 'Month'}</button>)}</div>
          <label className="field-wrap"><span className="field-label">Date</span><input type="date" className="field-control" value={reportDate} max={today()} onChange={e => setReportDate(e.target.value)} /></label>
        </div>
        <h2 className="surface-title report-period-title">{periodLabel}</h2>
        <div className="report-mini-stats">
          <div><span>Money received</span><b className="text-hesabu-green">{money(report.cashIn)}</b></div>
          <div><span>Cash</span><b>{money(report.cashReceived)}</b></div>
          <div><span>M-Pesa</span><b>{money(report.mpesaReceived)}</b></div>
          <div><span>Money spent</span><b className="text-[#B94C46]">{money(report.cashOut)}</b></div>
          <div><span>New credit</span><b>{money(report.credit)}</b></div>
          <div><span>Money left after expenses</span><b>{money(report.net)}</b></div>
        </div>
        {report.dailyClose && <section className="report-till-summary"><div><span className="ledger-section-label">TILL RECONCILIATION</span><strong>{report.dailyClose.difference === 0 ? 'Till balanced' : report.dailyClose.difference > 0 ? 'Cash over' : 'Cash short'}</strong></div><div><span>Expected</span><b>{money(report.dailyClose.expectedCash)}</b></div><div><span>Counted</span><b>{money(report.dailyClose.countedCash)}</b></div><div><span>Difference</span><b className={report.dailyClose.difference === 0 ? 'till-positive' : 'till-negative'}>{report.dailyClose.difference > 0 ? '+' : report.dailyClose.difference < 0 ? '−' : ''}{money(Math.abs(report.dailyClose.difference))}</b></div></section>}
        <p className="simple-review-note">Money left is not the same as profit. This report does not calculate the cost of every item sold.</p>
        <p className="report-connect-note">{!online ? 'You are offline. This report is saved on this phone; connect to the internet before sharing.' : queuedReportDate ? 'Your saved report is ready. Review it, then share it on WhatsApp.' : 'Your records stay on this phone. WhatsApp opens only when you choose to share.'}</p><div className="report-share-actions"><Button onClick={onShare}>{online ? 'Share on WhatsApp' : 'Save to share later'}</Button><Button variant="outline" onClick={onCopy}>Copy report</Button><Button variant="secondary" onClick={onPrint}><FileText size={14}/> Print / save PDF</Button></div>
      </section>

      <section className="surface report-entry-list">
        <h2 className="surface-title">Entries in this report</h2>
        <p className="surface-subtitle">{report.transactions.length} entries recorded.</p>
        {report.transactions.length ? <div className="simple-list">{report.transactions.map(tx => <div key={tx.id}><span>{tx.description}<small>{dateText(tx.date)} · {TYPE_META[tx.type].label}{tx.customerName ? ' · ' + tx.customerName : ''}{(tx.type === 'sale' || tx.type === 'payment' || tx.type === 'expense') ? ' · ' + (tx.paymentMethod === 'mpesa' ? 'M-Pesa' : 'Cash') : ''}</small></span><strong>{money(tx.amount)}</strong></div>)}</div> : <p className="simple-empty">No entries for this period.</p>}
      </section>

      <section className="surface report-entry-list">
        <h2 className="surface-title">Things to check</h2>
        <p className="surface-subtitle">Stock and payments that need attention.</p>
        {report.lowStock.length || report.due.length ? <div className="simple-list">
          {report.lowStock.map(item => <div key={item.id}><span>{item.name}<small>{item.quantity} {item.unit} left</small></span><strong>Buy more</strong></div>)}
          {report.due.map(rem => <div key={rem.id}><span>{rem.title}<small>{dateText(rem.dueDate)}{rem.amount ? ' · ' + money(rem.amount) : ''}</small></span><strong>{daysUntil(rem.dueDate) < 0 ? 'Overdue' : daysUntil(rem.dueDate) === 0 ? 'Today' : 'Coming up'}</strong></div>)}
        </div> : <p className="simple-empty">Nothing needs attention.</p>}
      </section>
    </div>
  </>;
}

function CustomerModal({ onClose, onSave }: { onClose: () => void; onSave: (values: { name: string; phone: string; balance: string; direction: 'owed-to-us' | 'we-owe'; kind: 'customer' | 'supplier'; dueDate: string; note: string }) => void }) {
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [balance, setBalance] = useState(''); const [direction, setDirection] = useState<'owed-to-us' | 'we-owe'>('owed-to-us'); const [kind, setKind] = useState<'customer' | 'supplier'>('customer'); const [dueDate, setDueDate] = useState(''); const [note, setNote] = useState('');
  return <Modal title="Add a person" detail="Save customer and supplier names with what is owed." onClose={onClose}>
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

function PaymentModal({ customer, onClose, onSave }: { customer: Customer; onClose: () => void; onSave: (customer: Customer, amount: string, note: string, paymentMethod: 'cash' | 'mpesa') => void }) {
  const supplierPayment = customer.kind === 'supplier' || (!customer.kind && customer.balance < 0);
  const customerCredit = customer.kind === 'customer' && customer.balance < 0;
  const [amount, setAmount] = useState(String(Math.abs(customer.balance)));
  const [note, setNote] = useState(supplierPayment ? 'Supplier payment' : customerCredit ? 'Customer credit refund' : 'Debt payment received');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'mpesa'>('cash');
  const capped = supplierPayment || customerCredit;
  const direction = supplierPayment ? 'paid out' : customerCredit ? 'returned to the customer' : 'received';
  return <Modal title={supplierPayment ? `Record payment to ${customer.name}` : customerCredit ? `Return balance to ${customer.name}` : `Payment from ${customer.name}`} detail={`${customerCredit ? 'Customer credit held' : 'Outstanding balance'}: ${money(Math.abs(customer.balance))}. This entry will be ${direction}.`} onClose={onClose}>
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); onSave(customer, amount, note, paymentMethod); }}>
      <Field label={supplierPayment || customerCredit ? 'Amount paid (KES)' : 'Amount received (KES)'} type="number" min={1} value={amount} onChange={setAmount} required autoFocus inputMode="numeric" />
      {!capped && <div className="flex items-center justify-between gap-3 rounded-lg border border-hesabu-line px-3 py-2 text-[11px]"><span className="font-semibold text-hesabu-muted">Received via</span><div className="flex gap-1"><button type="button" onClick={() => setPaymentMethod('cash')} className={cn('rounded-md px-3 py-1.5 font-bold', paymentMethod === 'cash' ? 'bg-hesabu-green text-white' : 'bg-hesabu-surface text-hesabu-muted')}>Cash</button><button type="button" onClick={() => setPaymentMethod('mpesa')} className={cn('rounded-md px-3 py-1.5 font-bold', paymentMethod === 'mpesa' ? 'bg-hesabu-green text-white' : 'bg-hesabu-surface text-hesabu-muted')}>M-Pesa</button></div></div>}
      <div className="flex flex-wrap gap-2"><button type="button" className="quick-amount" onClick={() => setAmount(String(Math.min(Math.abs(customer.balance), 100)))}>KES 100</button><button type="button" className="quick-amount" onClick={() => setAmount(String(Math.ceil(Math.abs(customer.balance) / 2)))}>Half balance</button><button type="button" className="quick-amount" onClick={() => setAmount(String(Math.abs(customer.balance)))}>Full balance</button></div>
      <Field label="Description" value={note} onChange={setNote} />
      <div className="repayment-preview"><div><span>Balance before</span><strong>{money(Math.abs(customer.balance))}</strong></div><div><span>After this payment</span><strong>{money(capped ? Math.max(0,Math.abs(customer.balance)-Math.min(Math.abs(customer.balance),Number(amount)||0)) : Math.max(0,customer.balance-(Number(amount)||0)))}</strong></div></div>
      {capped && Number(amount) > Math.abs(customer.balance) && <p className="text-[11px] text-[#B45C4A]">This amount is higher than the balance and will be capped at {money(Math.abs(customer.balance))}.</p>}
      {!capped && Number(amount) > customer.balance && <p className="text-[11px] text-[#946B2E]">The extra will stay on the customer account as credit for their next purchase.</p>}
      <div className="modal-actions"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={Number(amount) <= 0}><Check size={15} /> {supplierPayment ? 'Record payment' : customerCredit ? 'Record refund' : 'Record payment'}</Button></div>
    </form>
  </Modal>;
}
function StockModal({ onClose, onSave }: { onClose: () => void; onSave: (values: { name: string; quantity: string; unit: string; threshold: string; cost: string }) => void }) {
  const [name, setName] = useState(''); const [quantity, setQuantity] = useState('0'); const [unit, setUnit] = useState('pcs'); const [threshold, setThreshold] = useState('5'); const [cost, setCost] = useState('');
  return <Modal title="Add an item" detail="Enter the amount you have now and when you want to buy more." onClose={onClose}>
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

function ReminderModal({ reminder, link, onClose, onSave, onDelete }: { reminder?: Reminder; link?: { customerId?: string; stockItemId?: string; label: string; kind: Reminder['kind'] }; onClose: () => void; onSave: (values: { title: string; detail: string; amount: string; dueDate: string; kind: Reminder['kind']; customerId?: string; stockItemId?: string }) => void; onDelete: (reminder: Reminder) => void }) {
  const [title, setTitle] = useState(reminder?.title ?? (link?.customerId ? `Follow up with ${link.label}` : link?.stockItemId ? `Reorder ${link.label}` : '')); const [detail, setDetail] = useState(reminder?.detail ?? ''); const [amount, setAmount] = useState(reminder?.amount === undefined ? '' : String(reminder.amount)); const [dueDate, setDueDate] = useState(reminder?.dueDate ?? today()); const [kind, setKind] = useState<Reminder['kind']>(reminder?.kind ?? link?.kind ?? 'bill');
  return <Modal title={reminder ? 'Edit reminder' : 'Add a reminder'} detail="Add a bill to pay or someone to call." onClose={onClose}>
    {link && <div className="reminder-modal-link">{link.customerId ? 'Debt' : 'Stock'} · {link.label}</div>}
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); onSave({ title, detail, amount, dueDate, kind, customerId: reminder?.customerId ?? link?.customerId, stockItemId: reminder?.stockItemId ?? link?.stockItemId }); }}>
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
  return <Modal title="Your shop details" detail="Change the name and contact details for this shop." onClose={onClose}>
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); onSave(name, owner, phone, businessType); }}>
      <Field label="Shop name" value={name} onChange={setName} required autoFocus /><Field label="Your name" value={owner} onChange={setOwner} required /><Field label="Phone number" value={phone} onChange={setPhone} inputMode="tel" />
      <SelectField label="Business type" value={businessType} onChange={setBusinessType} options={[{ value: 'General shop', label: 'General shop' }, { value: 'Mama Mboga', label: 'Mama Mboga' }, { value: 'Hardware', label: 'Hardware' }, { value: 'Pharmacy', label: 'Pharmacy' }, { value: 'Other', label: 'Other' }]} />
      <div className="modal-actions"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit"><Check size={15} /> Save details</Button></div>
    </form>
  </Modal>;
}

function SettingsModal({ shopInfo, onSaveTradingHours, onClose, onReset, onProfile, onExportBackup, onExportCsv, onImportBackup, lastBackupAt, storageProtection, onProtectStorage }: { shopInfo: AppData['shopInfo']; onSaveTradingHours: (start: string, end: string) => void; onClose: () => void; onReset: () => void; onProfile: () => void; onExportBackup: () => void; onExportCsv: () => void; onImportBackup: (file: File) => void; lastBackupAt: string | null; storageProtection: 'checking' | 'protected' | 'standard' | 'unsupported'; onProtectStorage: () => void }) {
  const [start, setStart] = useState(shopInfo.tradingDayStart ?? '06:00');
  const [end, setEnd] = useState(shopInfo.tradingDayEnd ?? '21:00');
  return <Modal title="Settings" detail="Shop hours, shop details and saved records." onClose={onClose}>
    <section className="settings-hours-card">
      <div><strong>Trading hours</strong><p>Choose when one shop day starts and ends. Overnight hours are supported.</p></div>
      <form onSubmit={event => { event.preventDefault(); onSaveTradingHours(start, end); }}>
        <label><span>Opens at</span><input type="time" value={start} onChange={event => setStart(event.target.value)} required /></label>
        <label><span>Closes at</span><input type="time" value={end} onChange={event => setEnd(event.target.value)} required /></label>
        <Button type="submit" size="sm"><Check size={14} /> Save hours</Button>
      </form>
      <small>For example: 6:00 a.m. to 9:00 p.m., or 9:00 p.m. to 6:00 a.m. The day-end report follows these hours.</small>
    </section>
    <div className="settings-list">
      <button onClick={onProfile}><span className="settings-item-icon"><Store size={17} /></span><span><b>Shop profile</b><small>Name, phone number and business type</small></span><ChevronRight size={17} className="ml-auto text-hesabu-muted" /></button>
      <div className="settings-info"><span className="settings-item-icon"><Settings2 size={17} /></span><span><b>Your shop book stays on this device</b><small>It will not appear on another phone. Download a backup so you can restore it if needed.</small></span></div>
      <div className="settings-info"><span className="settings-item-icon"><Bell size={17} /></span><span><b>Reminders</b><small>Hesabu shows reminders here. It does not send them automatically.</small></span></div>
      <div className="settings-info"><span className="settings-item-icon"><Download size={17} /></span><span><b>Last backup</b><small>{lastBackupAt ? 'Downloaded ' + dateText(lastBackupAt.slice(0, 10), { day: 'numeric', month: 'short', year: 'numeric' }) + '. Download a new copy at least every 7 days.' : 'No backup date recorded yet. Create your first backup now.'}</small></span></div>
      <button onClick={onProtectStorage}><span className="settings-item-icon"><Settings2 size={17} /></span><span><b>Keep this device’s data</b><small>{storageProtection === 'protected' ? 'The browser has agreed to keep this data unless you clear it. Keep a separate backup too.' : storageProtection === 'standard' ? 'Ask the browser to keep Hesabu data. It may still clear data under some conditions.' : storageProtection === 'checking' ? 'Checking this browser.' : 'This browser cannot offer extra storage protection. Download backups regularly.'}</small></span><span className="settings-chevron">›</span></button>
      <button onClick={onExportBackup}><span className="settings-item-icon"><Download size={17} /></span><span><b>Download backup</b><small>Save all your shop records to a file.</small></span><span className="settings-chevron">›</span></button>
      <button onClick={onExportCsv}><span className="settings-item-icon"><FileSpreadsheet size={17} /></span><span><b>Download transactions for a spreadsheet</b><small>Use the file in Excel or another spreadsheet app.</small></span><span className="settings-chevron">›</span></button>
      <label className="settings-info settings-upload"><span className="settings-item-icon"><Upload size={17} /></span><span><b>Restore from backup</b><small>Choose a saved Hesabu backup to put your records back.</small><input className="settings-file-input" type="file" accept="application/json,.json" onChange={e => { const file = e.currentTarget.files?.[0]; if (file) onImportBackup(file); e.currentTarget.value = ''; }} /></span></label>
      <button className="settings-danger" onClick={onReset}><span className="settings-item-icon"><RotateCcw size={17} /></span><span><b>Reset demo shop</b><small>Replace saved changes with the original sample ledger.</small></span><ChevronRight size={17} className="ml-auto" /></button>
    </div><div className="modal-actions mt-5"><Button variant="secondary" onClick={onClose}>Close</Button></div>
  </Modal>;
}
function EditDraftModal({ draft, items, onClose, onSave }: { draft: TransactionDraft; items: StockItem[]; onClose: () => void; onSave: (values: { type: TransactionType; description: string; amount: string; customerName: string; dueDate: string; stockItemName: string }) => void }) {
  const [type, setType] = useState<TransactionType>(draft.type); const [description, setDescription] = useState(draft.description); const [amount, setAmount] = useState(String(draft.amount)); const [customerName, setCustomerName] = useState(draft.customerName ?? ''); const [dueDate, setDueDate] = useState(draft.dueDate ?? addDays(today(), 7)); const [stockItemName, setStockItemName] = useState(draft.stockItemName ?? '');
  return <Modal title="Edit transaction" detail="Check these details before saving." onClose={onClose}>
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
  return <Modal title="Correct transaction" detail="Change the description, amount or date." onClose={onClose}>
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

function TransactionModal({ transaction, customer, onClose, onEdit, onDelete, onShareReceipt }: { transaction: Transaction; customer?: Customer; onClose: () => void; onEdit: (tx: Transaction) => void; onDelete: (tx: Transaction) => void; onShareReceipt: (tx: Transaction) => void }) {
  const Icon = TYPE_META[transaction.type].icon;
  return <Modal title="Transaction details" detail={shortDay(transaction.date)} onClose={onClose}>
    <div className="transaction-detail-card"><div className={cn('transaction-detail-icon', TYPE_TONE[transaction.type])}><Icon size={22} /></div><div className="mt-4 text-[10px] font-bold uppercase tracking-[.14em] text-hesabu-muted">{TYPE_META[transaction.type].label}</div><div className={cn('mt-1 font-display text-[28px] font-extrabold tracking-[-.06em]', `amount-${transaction.type}`)}>{transaction.type === 'expense' ? '−' : transaction.type === 'credit' ? '' : '+'}{money(transaction.amount)}</div><div className="mt-2 text-sm font-bold">{transaction.description}</div><div className="mt-1 text-[11px] text-hesabu-muted">{dateText(transaction.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} at {timeText(transaction.time)}</div></div>
    <div className="mt-4 space-y-3">{transaction.customerName && <div className="detail-line"><span>Person</span><b>{transaction.customerName}</b></div>}{transaction.dueDate && <div className="detail-line"><span>Due date</span><b>{dateText(transaction.dueDate, { weekday: 'short', day: 'numeric', month: 'short' })}</b></div>}{transaction.category && <div className="detail-line"><span>Category</span><b>{transaction.category}</b></div>}{(transaction.type === 'sale' || transaction.type === 'payment') && <div className="detail-line"><span>Received via</span><b>{transaction.paymentMethod === 'mpesa' ? 'M-Pesa' : 'Cash'}</b></div>}{transaction.stockQuantityDelta !== undefined && <div className="detail-line"><span>Stock adjustment</span><b>{transaction.stockQuantityDelta > 0 ? '+' : ''}{transaction.stockQuantityDelta} item(s)</b></div>}{customer && <div className="detail-line"><span>Remaining balance</span><b>{money(customer.balance)}</b></div>}</div>
    <div className="mt-5 grid grid-cols-2 gap-2"><Button variant="secondary" onClick={onClose}>Close</Button><Button variant="outline" onClick={() => onEdit(transaction)}><Settings2 size={15} /> Edit details</Button>{(transaction.type === 'sale' || transaction.type === 'credit') && <Button variant="secondary" className="col-span-2" onClick={() => onShareReceipt(transaction)}><Share2 size={15} /> Share receipt on WhatsApp</Button>}<Button variant="danger" className="col-span-2" onClick={() => onDelete(transaction)}><Trash2 size={15} /> Delete entry</Button></div>
  </Modal>;
}



function DailyCloseModal({ data, date, existing, onClose, onSave }: {
  data: AppData; date: string; existing?: DailyClose; onClose: () => void; onSave: (date: string, openingCash: number, countedCash: number) => void;
}) {
  const transactions = data.transactions.filter(tx => (tx.tradingDay ?? tx.date) === date);
  const [openingCash, setOpeningCash] = useState(String(existing?.openingCash ?? suggestedOpeningCash(data.dailyCloses ?? [], date)));
  const [countedCash, setCountedCash] = useState(existing ? String(existing.countedCash) : '');
  const expected = expectedDrawerCash(data, date, Math.max(0, Number(openingCash) || 0));
  const drawerIn = drawerCashIn(transactions);
  const drawerOut = drawerCashOut(transactions);
  const difference = countedCash.trim() ? Number(countedCash) - expected : null;
  return <Modal title="Close the till" detail={dateText(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ' · Check the physical cash before saving.'} onClose={onClose}>
    <div className="till-close-breakdown">
      <div><span>Opening cash / float</span><strong>{money(Math.max(0, Number(openingCash) || 0))}</strong></div>
      <div><span>Cash sales and repayments</span><strong className="till-positive">+{money(drawerIn)}</strong></div>
      <div><span>Cash expenses</span><strong className="till-negative">−{money(drawerOut)}</strong></div>
      <div className="till-expected"><span>Expected cash in drawer</span><strong>{money(expected)}</strong></div>
    </div>
    <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (countedCash.trim() && Number.isFinite(Number(countedCash)) && Number(countedCash) >= 0) onSave(date, Number(openingCash) || 0, Number(countedCash)); }}>
      <Field label="Opening cash / float (KES)" value={openingCash} onChange={setOpeningCash} type="number" min={0} inputMode="numeric" help="The cash already in the till when this trading day began. You can change the suggested amount." />
      <Field label="Cash you counted in the drawer (KES)" value={countedCash} onChange={setCountedCash} type="number" min={0} inputMode="numeric" placeholder="Count the notes and coins" required />
      {difference !== null && Number.isFinite(difference) && <div className={cn('till-difference', difference === 0 ? 'till-balanced' : 'till-unbalanced')}>
        <span>{difference === 0 ? 'The till balances' : difference > 0 ? 'More cash than expected' : 'Cash is short'}</span>
        <strong>{difference > 0 ? '+' : difference < 0 ? '−' : ''}{money(Math.abs(difference))}</strong>
      </div>}
      <p className="simple-review-note">M-Pesa is not counted as cash in the drawer. This is a cash check, not a profit calculation.</p>
      <div className="modal-actions"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!countedCash.trim() || !Number.isFinite(Number(countedCash)) || Number(countedCash) < 0}><Check size={15} /> Save closing count</Button></div>
    </form>
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
          <h1>A simple book for your shop.</h1>
          <p>Record sales, money spent, customer debts and stock in one place.</p>
        </div>
      </section>
      <section className="welcome-setup">
        <div className="welcome-form-head"><h2>Set up your shop</h2><p>Enter your shop name to get started.</p></div>
        <form className="welcome-form" onSubmit={event => { event.preventDefault(); onCreateShop({ name, owner, phone, businessType }); }}>
          <Field label="Shop name" value={name} onChange={setName} placeholder="e.g. Mwende Shop" required autoFocus />
          <Field label="Your name (optional)" value={owner} onChange={setOwner} placeholder="Your name" />
          <Field label="Phone number (optional)" value={phone} onChange={setPhone} placeholder="07… or 01…" type="tel" inputMode="tel" />
          <SelectField label="Type of shop" value={businessType} onChange={setBusinessType} options={[{value:'General shop',label:'General shop / duka'},{value:'Kiosk',label:'Kiosk'},{value:'Grocery',label:'Grocery / food shop'},{value:'Hardware',label:'Hardware'},{value:'Clothing',label:'Clothing / boutique'},{value:'Other',label:'Other'}]} />
          <Button type="submit" className="welcome-start-button" disabled={!name.trim()}>Start</Button>
        </form>
        <div className="welcome-device-note"><span>Your records stay on this device. Download a backup regularly.</span></div>
        <div className="welcome-demo-row"><span>Want to look around first?</span><button type="button" onClick={onUseDemo}>Open sample shop</button></div>
      </section>
    </div>
  </main>;
}

export default App;
