import { useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowDownLeft, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight,
  Bell, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronRight, Clock3,
  CreditCard, FileText, HandCoins, House, Menu, Mic, Package, Plus, ReceiptText,
  Search, Settings2, Share2, ShoppingBag, SlidersHorizontal, Store, Trash2,
  TrendingDown, TrendingUp, Users, Wallet, X, CircleHelp
} from 'lucide-react';

const STORE_KEY = 'hesabu-ledger-v1';
const GREEN = '#1a7a4a';
const fmt = n => 'KES ' + Math.round(Number(n || 0)).toLocaleString('en-KE');
const localKey = (date = new Date()) => {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 10);
};
const today = () => localKey();
const shiftDay = (days, from = new Date()) => { const d = new Date(from); d.setDate(d.getDate() + days); return localKey(d); };
const shortDate = value => new Date(value + 'T12:00:00').toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
const fullDate = value => new Date(value + 'T12:00:00').toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short' });
const clock = value => value || new Date().toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const cashIn = t => t.type === 'sale' || t.type === 'payment';
const cashOut = t => t.type === 'expense';
const typeLabel = type => ({ sale: 'Cash sale', credit: 'Credit given', expense: 'Expense', payment: 'Debt repaid' }[type] || 'Transaction');
const iconFor = type => ({ sale: ArrowDownLeft, credit: HandCoins, expense: ArrowUpRight, payment: Wallet }[type] || ReceiptText);
const toneFor = type => ({ sale: 'green', credit: 'amber', expense: 'red', payment: 'blue' }[type] || 'green');

function seedData() {
  const customers = [
    { id: 'c-kamau', name: 'Kamau', phone: '0712 345 678', openingBalance: 500, owed: 500, dueDate: shiftDay(1), note: 'Usually pays on Friday' },
    { id: 'c-njeri', name: 'Njeri', phone: '0722 456 789', openingBalance: 385, owed: 385, dueDate: shiftDay(5), note: '' },
    { id: 'c-otieno', name: 'Otieno', phone: '0701 234 567', openingBalance: 200, owed: 200, dueDate: shiftDay(-3), note: '' },
    { id: 'c-wanjiku', name: 'Wanjiku', phone: '0718 987 654', openingBalance: 620, owed: 620, dueDate: shiftDay(8), note: '' },
    { id: 'c-hassan', name: 'Hassan', phone: '0790 123 456', openingBalance: 450, owed: 450, dueDate: shiftDay(-1), note: 'Collect payment next visit' }
  ];
  const suppliers = [
    { id: 's-annette', name: 'Madam Annette', phone: '0710 555 014', openingBalance: 2400, owed: 2400, dueDate: shiftDay(1), note: 'Electricity and shop supplies' },
    { id: 's-meru', name: 'Meru Wholesalers', phone: '0720 444 210', openingBalance: 0, owed: 0, dueDate: shiftDay(3), note: '' }
  ];
  const stock = [
    { id: 'p-sukari', name: 'Sukari', qty: 4, unit: 'kg', alert: 5, lastRestocked: shiftDay(-2), cost: 160 },
    { id: 'p-unga', name: 'Unga', qty: 18, unit: 'packets', alert: 5, lastRestocked: shiftDay(-1), cost: 135 },
    { id: 'p-mafuta', name: 'Mafuta', qty: 7, unit: 'litres', alert: 5, lastRestocked: today(), cost: 320 },
    { id: 'p-mkate', name: 'Mkate', qty: 2, unit: 'loaves', alert: 4, lastRestocked: today(), cost: 55 },
    { id: 'p-chai', name: 'Chai', qty: 14, unit: 'packets', alert: 4, lastRestocked: shiftDay(-3), cost: 90 },
    { id: 'p-sabuni', name: 'Sabuni', qty: 9, unit: 'bars', alert: 5, lastRestocked: shiftDay(-1), cost: 45 },
    { id: 'p-mchele', name: 'Mchele', qty: 22, unit: 'kg', alert: 6, lastRestocked: shiftDay(-2), cost: 180 },
    { id: 'p-chumvi', name: 'Chumvi', qty: 12, unit: 'packets', alert: 4, lastRestocked: shiftDay(-3), cost: 30 }
  ];
  const tx = [
    { id: 't1', type: 'credit', description: 'Kamau took 1kg Sukari', amount: 120, customerId: 'c-kamau', date: today(), time: '10:23 AM', dueDate: shiftDay(5), category: 'Groceries', stockChange: { stockId: 'p-sukari', delta: -1 } },
    { id: 't2', type: 'sale', description: 'Cash sale — Unga', amount: 250, date: today(), time: '10:10 AM', category: 'Groceries', stockChange: { stockId: 'p-unga', delta: -1 } },
    { id: 't3', type: 'payment', description: 'Njeri paid part of her debt', amount: 300, customerId: 'c-njeri', date: today(), time: '09:48 AM', category: 'Debt payment' },
    { id: 't4', type: 'expense', description: 'Supplier payment — stock', amount: 1500, supplierId: 's-meru', date: today(), time: '09:15 AM', category: 'Stock purchase' },
    { id: 't5', type: 'credit', description: 'Otieno took milk', amount: 80, customerId: 'c-otieno', date: today(), time: '08:42 AM', dueDate: shiftDay(3), category: 'Groceries' },
    { id: 't6', type: 'sale', description: 'Cash sale — household goods', amount: 410, date: today(), time: '08:20 AM', category: 'Sales' },
    { id: 't7', type: 'expense', description: 'Boda delivery', amount: 100, date: today(), time: '07:55 AM', category: 'Transport' },
    { id: 't8', type: 'sale', description: 'Cash sale — tea and bread', amount: 320, date: today(), time: '07:41 AM', category: 'Sales' },
    { id: 't9', type: 'credit', description: 'Wanjiku took soap', amount: 220, customerId: 'c-wanjiku', date: shiftDay(-1), time: '04:10 PM', dueDate: shiftDay(6), category: 'Groceries' },
    { id: 't10', type: 'sale', description: 'Cash sale — rice', amount: 700, date: shiftDay(-1), time: '03:32 PM', category: 'Sales' },
    { id: 't11', type: 'expense', description: 'Shop supplies', amount: 240, date: shiftDay(-1), time: '12:00 PM', category: 'Shop supplies' },
    { id: 't12', type: 'payment', description: 'Hassan paid part of balance', amount: 200, customerId: 'c-hassan', date: shiftDay(-1), time: '11:35 AM', category: 'Debt payment' },
    { id: 't13', type: 'sale', description: 'Cash sale — maize flour', amount: 1200, date: shiftDay(-2), time: '01:10 PM', category: 'Sales' },
    { id: 't14', type: 'expense', description: 'Electricity tokens', amount: 500, date: shiftDay(-2), time: '11:00 AM', category: 'Utilities' },
    { id: 't15', type: 'credit', description: 'Kamau took cooking oil', amount: 180, customerId: 'c-kamau', date: shiftDay(-2), time: '09:42 AM', dueDate: shiftDay(5), category: 'Groceries' }
  ];
  const reminders = [
    { id: 'r1', title: 'Electricity bill', detail: 'KES 2,400', dueDate: shiftDay(1), kind: 'bill', done: false },
    { id: 'r2', title: 'Call Madam Annette', detail: 'Confirm next delivery', dueDate: today(), kind: 'followup', done: false },
    { id: 'r3', title: 'Pay shop rent', detail: 'KES 8,000', dueDate: shiftDay(4), kind: 'bill', done: false }
  ];
  const data = { shopInfo: { name: 'Mama Grace General Shop', owner: 'Grace', phone: '0712 000 000', type: 'General shop' }, tx, customers, suppliers, stock, reminders };
  return recalcBalances(data);
}

function recalcBalances(data) {
  const next = { ...data, customers: data.customers.map(c => ({ ...c, owed: Number(c.openingBalance || 0) })), suppliers: data.suppliers.map(s => ({ ...s, owed: Number(s.openingBalance || 0) })) };
  for (const t of next.tx) {
    if (t.customerId) {
      const c = next.customers.find(x => x.id === t.customerId);
      if (c && t.type === 'credit') c.owed += Number(t.amount);
      if (c && t.type === 'payment') c.owed -= Number(t.amount);
    }
    if (t.supplierId) {
      const s = next.suppliers.find(x => x.id === t.supplierId);
      if (s && t.type === 'expense') s.owed -= Number(t.amount);
    }
  }
  next.customers.forEach(c => { c.owed = Math.max(0, Math.round(c.owed)); });
  next.suppliers.forEach(s => { s.owed = Math.max(0, Math.round(s.owed)); });
  return next;
}

function readData() {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (!saved) return seedData();
    const parsed = JSON.parse(saved);
    return { ...seedData(), ...parsed };
  } catch { return seedData(); }
}

function parseText(text, data) {
  const raw = text.trim();
  const lower = raw.toLowerCase();
  const amountMatch = lower.match(/(?:kes|ksh|kshs|bob|shillings?)\s*([\d,]+(?:\.\d{1,2})?)/i) || lower.match(/([\d,]+(?:\.\d{1,2})?)(?:\s*(?:bob|kes|ksh))?/i);
  const amount = amountMatch ? Number(amountMatch[1].replace(/,/g, '')) : 0;
  const customer = data.customers.find(c => lower.includes(c.name.toLowerCase()));
  const supplier = data.suppliers.find(s => lower.includes(s.name.toLowerCase()) || (s.id === 's-meru' && /supplier|wholesaler/.test(lower)));
  const item = data.stock.find(p => lower.includes(p.name.toLowerCase()));
  const isPayment = /paid (?:his |her |the )?(?:debt|dues)|paid (?:me|back)|alilipa|amelipa|lipa deni|payment received|paid debt/.test(lower);
  const isCredit = !isPayment && (/credit|deni|took|alichukua|akachukua|atalipa|pays friday|pay later|left without paying/.test(lower));
  const isSupplierPayment = !isPayment && /supplier|wholesaler|nililipa|paid supplier|delivered|alileta|nilinunua|bought|stock purchase|restock/.test(lower);
  const type = isPayment ? 'payment' : isCredit ? 'credit' : isSupplierPayment ? 'expense' : 'sale';
  const name = customer?.name || (supplier ? supplier.name : '');
  const autoStock = item && (isCredit || type === 'sale') ? { stockId: item.id, delta: -1 } :
    item && type === 'expense' && /delivered|alileta|brought|restock/.test(lower) ? { stockId: item.id, delta: 5 } : null;
  const dateWords = /tomorrow|kesho/.test(lower) ? shiftDay(1) : /friday|ijumaa/.test(lower) ? shiftDay((5 - new Date().getDay() + 7) % 7 || 7) : shiftDay(7);
  let desc = raw;
  if (customer && isCredit && item) desc = customer.name + ' took ' + item.name + (amount ? ' — ' + fmt(amount) + ' on credit' : ' on credit');
  else if (customer && isPayment) desc = customer.name + ' paid debt';
  return { type, description: desc, amount, customerId: isPayment || isCredit ? customer?.id : undefined, supplierId: type === 'expense' && supplier ? supplier.id : undefined, dueDate: isCredit ? dateWords : undefined, category: isSupplierPayment ? 'Stock purchase' : isCredit ? 'Credit sale' : isPayment ? 'Debt payment' : 'Sales', stockChange: autoStock };
}

function IconButton({ icon: Icon, label, onClick, subtle = false, className = '' }) {
  return <button className={'icon-button ' + (subtle ? 'subtle ' : '') + className} onClick={onClick} aria-label={label} title={label}><Icon size={18} strokeWidth={1.8} /></button>;
}
function Button({ children, icon: Icon, variant = 'primary', onClick, type = 'button', className = '', disabled = false }) {
  return <button type={type} onClick={onClick} disabled={disabled} className={'button button-' + variant + ' ' + className}>{Icon && <Icon size={17} strokeWidth={1.8} />}{children}</button>;
}
function Field({ label, children, hint }) { return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
function SectionHeading({ eyebrow, title, detail, action }) {
  return <div className="section-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{detail && <p>{detail}</p>}</div>{action && <div className="heading-action">{action}</div>}</div>;
}
function Brand() { return <div className="brand"><div className="brand-symbol"><i></i><i></i><i></i></div><div><b>hesabu<span>.</span></b><small>Your shop, in order.</small></div></div>; }

function App() {
  const [data, setData] = useState(readData);
  const [page, setPage] = useState('home');
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const [quickText, setQuickText] = useState('');
  const [draft, setDraft] = useState(null);
  const [voiceState, setVoiceState] = useState('idle');
  const [debtTab, setDebtTab] = useState('customers');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState('');
  const [filterStock, setFilterStock] = useState('all');
  const [reportTab, setReportTab] = useState('daily');
  const [reportDate, setReportDate] = useState(today());
  const [pendingDelete, setPendingDelete] = useState(null);
  const [showSnapshot, setShowSnapshot] = useState(false);
  const [txFilter, setTxFilter] = useState('all');
  const [speechSupported] = useState(() => typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window));
  const [recognition, setRecognition] = useState(null);

  useEffect(() => { localStorage.setItem(STORE_KEY, JSON.stringify(data)); }, [data]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 2800); return () => clearTimeout(timer); }, [toast]);

  const todayTx = useMemo(() => data.tx.filter(t => t.date === today()), [data.tx]);
  const moneyIn = todayTx.filter(cashIn).reduce((n, t) => n + t.amount, 0);
  const moneyOut = todayTx.filter(cashOut).reduce((n, t) => n + t.amount, 0);
  const creditToday = todayTx.filter(t => t.type === 'credit').reduce((n, t) => n + t.amount, 0);
  const customerTotal = data.customers.reduce((n, c) => n + c.owed, 0);
  const supplierTotal = data.suppliers.reduce((n, s) => n + s.owed, 0);
  const lowStock = data.stock.filter(p => p.qty <= p.alert);
  const dueSoon = data.reminders.filter(r => !r.done && r.dueDate <= shiftDay(1)).length;

  const mutate = fn => setData(current => recalcBalances(fn(current)));
  const notify = message => setToast(message);
  const createTransaction = draftTx => {
    if (!draftTx || !draftTx.amount || Number(draftTx.amount) <= 0) { notify('Add the amount first.'); return; }
    const tx = { ...draftTx, id: uid(), amount: Math.round(Number(draftTx.amount)), date: draftTx.date || today(), time: clock(), createdAt: Date.now() };
    mutate(current => {
      let next = { ...current, tx: [tx, ...current.tx] };
      if (tx.type === 'credit' && !tx.customerId && tx.partyName) {
        const c = { id: uid(), name: tx.partyName, phone: '', openingBalance: 0, owed: 0, dueDate: tx.dueDate || shiftDay(7), note: '' };
        next.customers = [...next.customers, c];
        tx.customerId = c.id;
      }
      if (tx.stockChange) next.stock = next.stock.map(p => p.id === tx.stockChange.stockId ? { ...p, qty: Math.max(0, p.qty + tx.stockChange.delta), lastRestocked: tx.stockChange.delta > 0 ? today() : p.lastRestocked } : p);
      return next;
    });
    setDraft(null); setQuickText(''); setModal(null); notify('Saved to today’s book.');
  };

  const reverseStock = tx => {
    if (!tx.stockChange) return;
    mutate(current => ({ ...current, tx: current.tx.filter(t => t.id !== tx.id), stock: current.stock.map(p => p.id === tx.stockChange.stockId ? { ...p, qty: Math.max(0, p.qty - tx.stockChange.delta) } : p) }));
  };
  const handleDelete = tx => {
    const confirmed = window.confirm('Delete this transaction? The customer balance will be recalculated.');
    if (!confirmed) return;
    mutate(current => ({ ...current, tx: current.tx.filter(t => t.id !== tx.id), stock: tx.stockChange ? current.stock.map(p => p.id === tx.stockChange.stockId ? { ...p, qty: Math.max(0, p.qty - tx.stockChange.delta) } : p) : current.stock }));
    setPendingDelete(null); notify('Transaction deleted.');
  };

  const startVoice = () => {
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) { notify('Voice entry is not available in this browser. Type the transaction instead.'); return; }
    try {
      const rec = new Speech(); rec.lang = 'en-KE'; rec.interimResults = false; rec.maxAlternatives = 1;
      rec.onstart = () => setVoiceState('listening');
      rec.onresult = event => {
        const transcript = event.results[0][0].transcript;
        setQuickText(transcript);
        setDraft(parseText(transcript, data));
        setVoiceState('review');
      };
      rec.onerror = () => { setVoiceState('idle'); notify('Could not hear that clearly. Try typing it.'); };
      rec.onend = () => setVoiceState(current => current === 'listening' ? 'idle' : current);
      setRecognition(rec); rec.start();
    } catch { notify('Allow microphone access, then try again.'); }
  };

  const openDraft = (text = quickText) => {
    if (!text.trim()) { setModal({ type: 'record' }); return; }
    const parsed = parseText(text, data);
    if (!parsed.amount) { setModal({ type: 'record', initialDescription: text }); return; }
    setDraft(parsed); setVoiceState('review');
  };

  const visibleCustomers = data.customers.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || (c.phone || '').includes(search));
  const visibleSuppliers = data.suppliers.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || (s.phone || '').includes(search));
  const filteredStock = data.stock.filter(p => (p.name.toLowerCase().includes(search.toLowerCase())) && (filterStock === 'all' || (filterStock === 'low' ? p.qty <= p.alert : p.qty > p.alert)));
  const allTx = [...data.tx].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  const icons = { home: House, debts: Users, stock: Package, reports: FileText };
  const titles = { home: 'Nyumbani', debts: 'Madeni', stock: 'Bidhaa', reports: 'Ripoti' };
  const nav = [
    { id: 'home', label: 'Nyumbani', icon: House },
    { id: 'debts', label: 'Madeni', icon: Users },
    { id: 'stock', label: 'Bidhaa', icon: Package },
    { id: 'reports', label: 'Ripoti', icon: FileText }
  ];

  const go = id => { setPage(id); setSearch(''); setExpanded(''); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const sendWhatsApp = text => window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener,noreferrer');
  const reportText = useMemo(() => {
    const selected = data.tx.filter(t => reportTab === 'daily' ? t.date === reportDate : reportTab === 'weekly' ? t.date >= shiftDay(-6, new Date(reportDate + 'T12:00:00')) && t.date <= reportDate : t.date.slice(0, 7) === reportDate.slice(0, 7));
    const ins = selected.filter(cashIn).reduce((n, t) => n + t.amount, 0);
    const outs = selected.filter(cashOut).reduce((n, t) => n + t.amount, 0);
    const credits = selected.filter(t => t.type === 'credit');
    const overdue = data.customers.filter(c => c.owed > 0 && c.dueDate < today());
    const restock = data.stock.filter(p => p.qty <= p.alert);
    return 'HESABU — ' + reportTab.toUpperCase() + ' REPORT\n' + fullDate(reportDate) + '\n\nMoney received: ' + fmt(ins) + '\nCash expenses: ' + fmt(outs) + '\nNet cash: ' + fmt(ins - outs) + '\nCredit given (not cash received): ' + fmt(credits.reduce((n, t) => n + t.amount, 0)) + '\n\nNew credit:\n' + (credits.length ? credits.map(t => '• ' + (data.customers.find(c => c.id === t.customerId)?.name || t.partyName || 'Customer') + ' — ' + fmt(t.amount) + (t.dueDate ? ' (due ' + shortDate(t.dueDate) + ')' : '')).join('\n') : '• None recorded') + '\n\nStock to check:\n' + (restock.length ? restock.map(p => '• ' + p.name + ' — ' + p.qty + ' ' + p.unit + ' left').join('\n') : '• All above reorder levels') + '\n\nReminders due soon: ' + dueSoon + '\n\nHesabu — your shop, in order.';
  }, [data, reportTab, reportDate, dueSoon]);

  const submitModal = event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const get = key => String(form.get(key) || '').trim();
    const num = key => Number(get(key) || 0);
    if (modal?.type === 'record') {
      const type = get('type') || 'sale';
      const partyId = get('partyId');
      const customer = data.customers.find(c => c.id === partyId);
      const supplier = data.suppliers.find(s => s.id === partyId);
      createTransaction({ type, description: get('description') || typeLabel(type), amount: num('amount'), customerId: customer?.id, supplierId: supplier?.id, partyName: get('partyName') || customer?.name, dueDate: get('dueDate') || shiftDay(7), category: get('category') || (type === 'expense' ? 'Expenses' : 'Sales') });
    } else if (modal?.type === 'customer') {
      const c = { id: modal.customer?.id || uid(), name: get('name'), phone: get('phone'), openingBalance: num('openingBalance'), owed: num('openingBalance'), dueDate: get('dueDate') || shiftDay(7), note: get('note') };
      mutate(current => ({ ...current, customers: modal.customer ? current.customers.map(x => x.id === c.id ? { ...x, ...c, openingBalance: x.openingBalance } : x) : [...current.customers, c] }));
      setModal(null); notify(modal.customer ? 'Customer details updated.' : 'Customer added to your book.');
    } else if (modal?.type === 'supplier') {
      const s = { id: modal.supplier?.id || uid(), name: get('name'), phone: get('phone'), openingBalance: num('openingBalance'), owed: num('openingBalance'), dueDate: get('dueDate') || shiftDay(7), note: get('note') };
      mutate(current => ({ ...current, suppliers: modal.supplier ? current.suppliers.map(x => x.id === s.id ? { ...x, ...s, openingBalance: x.openingBalance } : x) : [...current.suppliers, s] }));
      setModal(null); notify('Supplier saved.');
    } else if (modal?.type === 'payment') {
      const partyId = modal.partyId;
      const amount = num('amount');
      const isSupplier = modal.partyType === 'supplier';
      createTransaction({ type: isSupplier ? 'expense' : 'payment', description: (isSupplier ? 'Payment to ' : 'Payment from ') + modal.partyName, amount, customerId: isSupplier ? undefined : partyId, supplierId: isSupplier ? partyId : undefined, category: isSupplier ? 'Supplier payment' : 'Debt payment' });
    } else if (modal?.type === 'stock') {
      const item = { id: modal.item?.id || uid(), name: get('name'), qty: num('qty'), unit: get('unit') || 'pcs', alert: num('alert') || 5, lastRestocked: modal.item?.lastRestocked || today(), cost: num('cost') };
      mutate(current => ({ ...current, stock: modal.item ? current.stock.map(p => p.id === item.id ? { ...p, ...item } : p) : [...current.stock, item] }));
      setModal(null); notify('Stock item saved.');
    } else if (modal?.type === 'stock-update') {
      const amount = num('qty');
      mutate(current => ({ ...current, stock: current.stock.map(p => p.id === modal.item.id ? { ...p, qty: modal.mode === 'restock' ? p.qty + amount : Math.max(0, amount), lastRestocked: modal.mode === 'restock' ? today() : p.lastRestocked } : p) }));
      setModal(null); notify(modal.mode === 'restock' ? 'Restock saved.' : 'Quantity updated.');
    } else if (modal?.type === 'reminder') {
      const reminder = { id: modal.reminder?.id || uid(), title: get('title'), detail: get('detail'), dueDate: get('dueDate') || today(), kind: get('kind') || 'followup', done: modal.reminder?.done || false };
      mutate(current => ({ ...current, reminders: modal.reminder ? current.reminders.map(r => r.id === reminder.id ? reminder : r) : [...current.reminders, reminder] }));
      setModal(null); notify('Reminder saved.');
    } else if (modal?.type === 'profile') {
      mutate(current => ({ ...current, shopInfo: { ...current.shopInfo, name: get('shop'), owner: get('owner'), phone: get('phone'), type: get('type') } }));
      setModal(null); notify('Shop details saved.');
    }
  };

  const logQuickType = type => { setModal({ type: 'record', initialType: type }); };
  const addReminder = reminder => mutate(current => ({ ...current, reminders: current.reminders.map(r => r.id === reminder.id ? { ...r, done: !r.done } : r) }));
  const deleteReminder = reminder => { if (!window.confirm('Remove this reminder?')) return; mutate(current => ({ ...current, reminders: current.reminders.filter(r => r.id !== reminder.id) })); notify('Reminder removed.'); };

  const renderTransaction = t => {
    const Icon = iconFor(t.type);
    const customer = data.customers.find(c => c.id === t.customerId);
    return <div className="transaction-row" key={t.id}>
      <div className={'transaction-icon tone-' + toneFor(t.type)}><Icon size={18} strokeWidth={1.8} /></div>
      <div className="transaction-info"><div className="transaction-title">{t.description}</div><div className="transaction-meta">{t.time} <span>·</span> {typeLabel(t.type)}{customer ? ' · ' + customer.name : ''}</div>{t.type === 'credit' && <span className="mini-tag">Credit{t.dueDate ? ' · due ' + shortDate(t.dueDate) : ''}</span>}</div>
      <div className="transaction-money"><b className={cashOut(t) ? 'money-red' : t.type === 'credit' ? 'money-amber' : 'money-green'}>{cashOut(t) ? '−' : t.type === 'credit' ? '' : '+'}{fmt(t.amount)}</b><IconButton icon={Trash2} label="Delete transaction" subtle onClick={() => handleDelete(t)} /></div>
    </div>;
  };

  const renderReminder = reminder => <div className={'reminder-row ' + (reminder.done ? 'reminder-done' : '')} key={reminder.id}>
    <button className="check-button" onClick={() => addReminder(reminder)} aria-label={reminder.done ? 'Mark incomplete' : 'Mark complete'}>{reminder.done && <Check size={14} />}</button>
    <div className="reminder-copy"><b>{reminder.title}</b><span>{reminder.detail || (reminder.kind === 'bill' ? 'Bill payment' : 'Follow up')}</span><small>{reminder.dueDate === today() ? 'Due today' : reminder.dueDate < today() ? 'Overdue · ' + shortDate(reminder.dueDate) : 'Due ' + shortDate(reminder.dueDate)}</small></div>
    <IconButton icon={Settings2} label="Edit reminder" subtle onClick={() => setModal({ type: 'reminder', reminder })} />
  </div>;

  const homePage = <div className="page-home">
    <div className="welcome-row"><div><div className="eyebrow">YOUR SHOP AT A GLANCE</div><h1>Habari, {data.shopInfo.owner || 'rafiki'}.</h1><p>Here’s how the shop is doing today.</p></div><button className="date-pill" onClick={() => setShowSnapshot(s => !s)}><CalendarDays size={16} />{fullDate(today())}<ChevronDown size={14} /></button></div>
    <div className="metric-grid">
      <button className="metric-card" onClick={() => { setTxFilter('in'); document.getElementById('recent-transactions')?.scrollIntoView({ behavior: 'smooth' }); }}><div className="metric-label"><span className="metric-dot green"></span>Money received</div><strong>{fmt(moneyIn)}</strong><small><TrendingUp size={14} /> Cash sales + debt repayments</small></button>
      <button className="metric-card" onClick={() => { setTxFilter('out'); document.getElementById('recent-transactions')?.scrollIntoView({ behavior: 'smooth' }); }}><div className="metric-label"><span className="metric-dot red"></span>Cash expenses</div><strong className="money-red">{fmt(moneyOut)}</strong><small><TrendingDown size={14} /> Bills, stock and other costs</small></button>
      <button className="metric-card metric-net" onClick={() => setShowSnapshot(s => !s)}><div className="metric-label"><span className="metric-dot dark"></span>Net cash today</div><strong>{fmt(moneyIn - moneyOut)}</strong><small>Credit given: {fmt(creditToday)}</small></button>
    </div>
    {showSnapshot && <div className="explain-strip"><CircleHelp size={16} /><span>Net cash is money received minus cash expenses. Goods taken on credit are tracked separately and are not counted as cash received.</span><button onClick={() => setShowSnapshot(false)} aria-label="Close explanation"><X size={15} /></button></div>}
    <div className="home-columns">
      <section className="panel quick-panel">
        <div className="panel-head"><div><div className="eyebrow">FAST ENTRY</div><h2>What happened?</h2><p>Write it in your own words. We’ll check it with you.</p></div><div className="today-tag"><span></span>Today’s book</div></div>
        <div className="quick-input-wrap"><input value={quickText} onChange={e => setQuickText(e.target.value)} onKeyDown={e => e.key === 'Enter' && openDraft()} placeholder="e.g. Kamau took sugar for 120 bob" aria-label="Describe a transaction" /><IconButton icon={ArrowRight} label="Review transaction" onClick={() => openDraft()} className="send-entry" /></div>
        <div className="quick-actions">{speechSupported && <Button variant="outline" icon={Mic} onClick={startVoice}>{voiceState === 'listening' ? 'Listening…' : 'Speak instead'}</Button>}<Button variant="primary" icon={Plus} onClick={() => setModal({ type: 'record' })}>Record manually</Button></div>
        <div className="quick-examples"><span>Try:</span><button onClick={() => { setQuickText('Kamau took sugar 120 bob'); setDraft(null); }}>Credit sale</button><button onClick={() => { setQuickText('Njeri paid her debt 500 bob'); setDraft(null); }}>Debt payment</button><button onClick={() => { setQuickText('Nilinunua mkaa kwa 800'); setDraft(null); }}>Expense</button></div>
        {draft && <div className="review-card"><div className="review-heading"><CheckCircle2 size={18} /><b>Check before saving</b><button onClick={() => setDraft(null)} aria-label="Dismiss"><X size={15} /></button></div><p>{draft.description}</p><div className="review-detail"><span>{typeLabel(draft.type)}{draft.dueDate ? ' · due ' + shortDate(draft.dueDate) : ''}</span><strong>{fmt(draft.amount)}</strong></div><div className="review-controls"><Button variant="outline" onClick={() => setModal({ type: 'record', initialDescription: draft.description, initialType: draft.type, initialAmount: draft.amount, initialCustomerId: draft.customerId, initialDueDate: draft.dueDate })}>Edit</Button><Button icon={Check} onClick={() => createTransaction(draft)}>Confirm entry</Button></div><small>Check the amount and who the transaction belongs to.</small></div>}
        <div className="panel-divider"></div>
        <div className="panel-head transaction-heading"><div><h2>Recent activity</h2><p>{todayTx.length} entries recorded today</p></div><button className="text-button" onClick={() => setTxFilter(txFilter === 'all' ? 'today' : 'all')}>{txFilter === 'today' ? 'All activity' : 'Today only'} <ChevronRight size={15} /></button></div>
        <div className="transaction-list" id="recent-transactions">{allTx.filter(t => txFilter === 'today' ? t.date === today() : txFilter === 'in' ? cashIn(t) : txFilter === 'out' ? cashOut(t) : true).slice(0, 8).map(renderTransaction)}</div>
        {allTx.length > 8 && <button className="show-more" onClick={() => setModal({ type: 'all-transactions' })}>View all transactions <ArrowRight size={15} /></button>}
      </section>
      <div className="right-column">
        <section className="panel focus-panel"><div className="panel-head"><div><div className="eyebrow">NEEDS ATTENTION</div><h2>Keep on top of it</h2></div><span className="count-badge">{lowStock.length + dueSoon}</span></div>
          <div className="focus-list">{lowStock.slice(0, 3).map(item => <button className="focus-item" key={item.id} onClick={() => { go('stock'); setSearch(item.name); }}><span className="focus-symbol stock-symbol"><Package size={16} /></span><span><b>{item.name} is running low</b><small>{item.qty} {item.unit} left · reorder at {item.alert}</small></span><ChevronRight size={16} /></button>)}{data.reminders.filter(r => !r.done && r.dueDate <= shiftDay(1)).slice(0, 2).map(r => <button className="focus-item" key={r.id} onClick={() => setModal({ type: 'reminder', reminder: r })}><span className="focus-symbol bill-symbol"><Bell size={16} /></span><span><b>{r.title}</b><small>{r.dueDate < today() ? 'Past due' : r.dueDate === today() ? 'Due today' : 'Due tomorrow'} · {r.detail}</small></span><ChevronRight size={16} /></button>)}{!lowStock.length && !dueSoon && <div className="empty-inline">Nothing needs your attention right now.</div>}</div>
          <button className="text-button focus-more" onClick={() => setModal({ type: 'all-reminders' })}>All reminders <ArrowRight size={15} /></button>
        </section>
        <section className="panel debt-glance"><div className="panel-head"><div><div className="eyebrow">ON CREDIT</div><h2>Money to follow up</h2></div><button className="round-small" onClick={() => go('debts')} aria-label="Open debts"><ArrowRight size={16} /></button></div><div className="debt-glance-amount">{fmt(customerTotal)}</div><p>owed by {data.customers.filter(c => c.owed > 0).length} customers</p><div className="mini-debt-list">{data.customers.filter(c => c.owed > 0).sort((a, b) => b.owed - a.owed).slice(0, 3).map(c => <button key={c.id} onClick={() => { setDebtTab('customers'); go('debts'); setExpanded(c.id); }}><span className="avatar">{c.name.slice(0, 1).toUpperCase()}</span><span className="mini-debt-name">{c.name}</span><b>{fmt(c.owed)}</b></button>)}</div><Button variant="soft" className="full-width" onClick={() => go('debts')}>Open debt book</Button></section>
      </div>
    </div>
  </div>;

  const debtsPage = <div className="page-standard">
    <SectionHeading eyebrow="CUSTOMERS & SUPPLIERS" title="Madeni" detail="Know what’s owed, what’s due, and who needs a follow-up." action={<Button icon={Plus} onClick={() => setModal({ type: debtTab === 'customers' ? 'customer' : 'supplier' })}>Add {debtTab === 'customers' ? 'customer' : 'supplier'}</Button>} />
    <div className="debt-summary-grid"><div className="debt-summary"><span>Customers owe you</span><strong>{fmt(customerTotal)}</strong><small>{data.customers.filter(c => c.owed > 0).length} people with a balance</small></div><div className="debt-summary"><span>You owe suppliers</span><strong>{fmt(supplierTotal)}</strong><small>{data.suppliers.filter(s => s.owed > 0).length} supplier balances</small></div></div>
    <div className="workspace-panel">
      <div className="list-toolbar"><div className="segmented"><button className={debtTab === 'customers' ? 'selected' : ''} onClick={() => { setDebtTab('customers'); setSearch(''); setExpanded(''); }}>Wananidai <span>{data.customers.filter(c => c.owed > 0).length}</span></button><button className={debtTab === 'suppliers' ? 'selected' : ''} onClick={() => { setDebtTab('suppliers'); setSearch(''); setExpanded(''); }}>Ninawadai <span>{data.suppliers.filter(s => s.owed > 0).length}</span></button></div><div className="search-box"><Search size={17} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search a name…" /></div></div>
      <div className="ledger-list">{(debtTab === 'customers' ? visibleCustomers : visibleSuppliers).map(person => {
        const isCustomer = debtTab === 'customers'; const personTx = data.tx.filter(t => isCustomer ? t.customerId === person.id : t.supplierId === person.id); const overdue = person.owed > 0 && person.dueDate < today(); const open = expanded === person.id;
        return <div className={'person-entry ' + (open ? 'person-open' : '')} key={person.id}><button className="person-row" onClick={() => setExpanded(open ? '' : person.id)}><span className={'avatar ' + (!isCustomer ? 'avatar-supplier' : '')}>{person.name.slice(0, 1).toUpperCase()}</span><span className="person-name"><b>{person.name}</b><small>{person.phone || 'No phone added'} · {person.owed > 0 ? 'Due ' + shortDate(person.dueDate || shiftDay(7)) : 'Settled'}</small></span><span className="person-balance"><strong className={isCustomer && person.owed ? 'money-red' : ''}>{fmt(person.owed)}</strong>{overdue && <small className="overdue-tag">Overdue</small>}</span><ChevronDown className={open ? 'chevron-open' : ''} size={17} /></button>
          {open && <div className="person-details"><div className="person-note">{person.note || 'No note added yet.'}</div><div className="history-head"><b>Recent history</b><span>{personTx.length} entries</span></div>{personTx.length ? personTx.slice(0, 4).map(t => <div className="history-line" key={t.id}><span>{t.description}<small>{shortDate(t.date)}</small></span><b className={t.type === 'credit' ? 'money-red' : 'money-green'}>{t.type === 'credit' ? '+' : '−'}{fmt(t.amount)}</b></div>) : <p className="empty-inline">No transactions recorded against this balance.</p>}<div className="person-actions">{isCustomer ? <Button icon={Wallet} onClick={() => setModal({ type: 'payment', partyType: 'customer', partyId: person.id, partyName: person.name })}>Record payment</Button> : <Button icon={Wallet} onClick={() => setModal({ type: 'payment', partyType: 'supplier', partyId: person.id, partyName: person.name })}>Pay supplier</Button>}<Button variant="outline" icon={Share2} onClick={() => sendWhatsApp('Habari ' + person.name + ', this is a reminder from ' + data.shopInfo.name + '. Your outstanding balance is ' + fmt(person.owed) + '. Please let us know when you can settle. Asante.')}>WhatsApp reminder</Button><IconButton icon={Settings2} label="Edit details" onClick={() => setModal({ type: isCustomer ? 'customer' : 'supplier', [isCustomer ? 'customer' : 'supplier']: person })} /></div></div>}
        </div>;
      })}</div>
      <div className="list-footer"><span>Balances update when you record a credit or repayment.</span><Button variant="outline" icon={Plus} onClick={() => setModal({ type: debtTab === 'customers' ? 'customer' : 'supplier' })}>Add new</Button></div>
    </div>
  </div>;

  const stockPage = <div className="page-standard">
    <SectionHeading eyebrow="IN THE SHOP" title="Bidhaa" detail="See what’s on the shelf before a customer asks for it." action={<Button icon={Plus} onClick={() => setModal({ type: 'stock' })}>Add item</Button>} />
    <div className="stock-summary-row"><div><span>Items tracked</span><b>{data.stock.length}</b></div><div><span>Need reordering</span><b className={lowStock.length ? 'money-amber' : ''}>{lowStock.length}</b></div><div><span>Units in stock</span><b>{data.stock.reduce((n, p) => n + p.qty, 0).toLocaleString('en-KE')}</b></div></div>
    <div className="workspace-panel"><div className="list-toolbar"><div className="segmented"><button className={filterStock === 'all' ? 'selected' : ''} onClick={() => setFilterStock('all')}>All items</button><button className={filterStock === 'low' ? 'selected' : ''} onClick={() => setFilterStock('low')}>Low stock <span>{lowStock.length}</span></button></div><div className="search-box"><Search size={17} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a product…" /></div></div>
      <div className="stock-grid">{filteredStock.map(item => { const level = item.qty <= Math.max(1, Math.floor(item.alert / 2)) ? 'critical' : item.qty <= item.alert ? 'low' : 'healthy'; return <div className="stock-card" key={item.id}><div className="stock-card-top"><div className="stock-product-icon"><ShoppingBag size={19} /></div><button className="stock-menu" onClick={() => setModal({ type: 'stock', item })} aria-label={'Edit ' + item.name}><Settings2 size={17} /></button></div><h3>{item.name}</h3><div className="stock-quantity"><strong>{item.qty}</strong><span>{item.unit}</span></div><div className="stock-status"><span className={'status-dot ' + level}></span><span className={level === 'healthy' ? '' : level === 'low' ? 'money-amber' : 'money-red'}>{level === 'healthy' ? 'In good shape' : level === 'low' ? 'Running low' : 'Almost out'}</span></div><div className="stock-meter"><span className={'meter-fill ' + level} style={{ width: Math.min(100, item.qty / Math.max(item.alert * 2, 1) * 100) + '%' }}></span></div><small className="stock-meta">Reorder level: {item.alert} {item.unit} · Restocked {shortDate(item.lastRestocked)}</small><div className="stock-actions"><Button variant="soft" icon={Plus} onClick={() => setModal({ type: 'stock-update', mode: 'restock', item })}>Restock</Button><Button variant="ghost" onClick={() => setModal({ type: 'stock-update', mode: 'adjust', item })}>Adjust qty</Button></div></div>; })}</div>
      {!filteredStock.length && <div className="empty-state"><Package size={26} /><b>No items match that search</b><span>Try another name or change the filter.</span></div>}
    </div>
  </div>;

  const reportsPage = <div className="page-standard">
    <SectionHeading eyebrow="KNOW HOW THE DAY WENT" title="Ripoti" detail="A clear summary, ready to send to yourself or your business partner." action={<Button variant="outline" icon={Share2} onClick={() => sendWhatsApp(reportText)}>Share report</Button>} />
    <div className="report-toolbar"><div className="segmented"><button className={reportTab === 'daily' ? 'selected' : ''} onClick={() => setReportTab('daily')}>Daily</button><button className={reportTab === 'weekly' ? 'selected' : ''} onClick={() => setReportTab('weekly')}>Weekly</button><button className={reportTab === 'monthly' ? 'selected' : ''} onClick={() => setReportTab('monthly')}>Monthly</button></div><label className="date-input"><CalendarDays size={16} /><input type="date" max={today()} value={reportDate} onChange={e => setReportDate(e.target.value)} /></label></div>
    <div className="report-layout"><div className="report-preview-wrap"><div className="report-phone"><div className="phone-top"><span className="phone-camera"></span><div><b>{data.shopInfo.owner || 'Shop owner'}</b><small>Hesabu daily book</small></div><MoreHorizontalIcon /></div><div className="chat-surface"><div className="chat-date">{fullDate(reportDate)}</div><div className="chat-bubble"><div className="report-brandline"><div className="brand-mark-mini">h.</div><b>Hesabu Yako</b><span>{reportTab === 'daily' ? 'Daily report' : reportTab === 'weekly' ? 'Weekly summary' : 'Monthly summary'}</span></div><p className="report-date-label">{fullDate(reportDate)}</p>{(() => { const selected = data.tx.filter(t => reportTab === 'daily' ? t.date === reportDate : reportTab === 'weekly' ? t.date >= shiftDay(-6, new Date(reportDate + 'T12:00:00')) && t.date <= reportDate : t.date.slice(0, 7) === reportDate.slice(0, 7)); const ins = selected.filter(cashIn).reduce((n,t)=>n+t.amount,0); const outs = selected.filter(cashOut).reduce((n,t)=>n+t.amount,0); const cr = selected.filter(t=>t.type==='credit'); return <><div className="report-line"><span>Money received</span><b className="money-green">{fmt(ins)}</b></div><div className="report-line"><span>Cash expenses</span><b className="money-red">{fmt(outs)}</b></div><div className="report-line report-net"><span>Net cash</span><b>{fmt(ins-outs)}</b></div><div className="report-rule"></div><b className="report-section-label">Credit given</b>{cr.length ? cr.slice(0,4).map(t=><div className="report-bullet" key={t.id}><span>{data.customers.find(c=>c.id===t.customerId)?.name || t.partyName || 'Customer'}</span><b>{fmt(t.amount)}</b></div>) : <p className="report-muted">No new credit recorded.</p>}<div className="report-rule"></div><b className="report-section-label">Stock to check</b>{lowStock.length ? lowStock.slice(0,3).map(p=><div className="report-bullet" key={p.id}><span>{p.name} · {p.qty} {p.unit} left</span><b className="money-amber">Reorder</b></div>) : <p className="report-muted">All stock is above the reorder level.</p>}<div className="report-foot">Your shop, in order.</div></>; })()}</div><div className="chat-time">Hesabu · preview</div></div></div></div>
      <section className="panel report-actions-panel"><div className="eyebrow">READY WHEN YOU ARE</div><h2>Send your report</h2><p>Share a copy with yourself or someone you trust. Hesabu won’t send anything without your action.</p><Button icon={Share2} className="full-width" onClick={() => sendWhatsApp(reportText)}>Share on WhatsApp</Button><Button variant="outline" icon={FileText} className="full-width copy-report" onClick={() => { if (navigator.clipboard?.writeText) navigator.clipboard.writeText(reportText).then(() => notify('Report copied.')).catch(() => notify('Copy is not available here.')); else { const box = document.createElement('textarea'); box.value = reportText; document.body.appendChild(box); box.select(); document.execCommand('copy'); box.remove(); notify('Report copied.'); } }}>Copy report text</Button><div className="report-note"><CircleHelp size={16} /><span>Net cash is not the same as profit. This report does not yet account for the cost of goods sold.</span></div><div className="report-breakdown"><div><span>Customers who owe</span><b>{fmt(customerTotal)}</b></div><div><span>Supplier balances</span><b>{fmt(supplierTotal)}</b></div><div><span>Reminders due soon</span><b>{dueSoon}</b></div></div></section></div>
  </div>;

  const modalContent = () => {
    if (!modal) return null;
    let title = '', subtitle = '', fields = null, actionLabel = 'Save';
    const person = modal.type === 'customer' ? modal.customer : modal.type === 'supplier' ? modal.supplier : null;
    if (modal.type === 'record') {
      title = 'Record a transaction'; subtitle = 'Keep it simple. You can check the entry before it is saved.';
      actionLabel = 'Save transaction';
      fields = <><Field label="What happened?"><select name="type" defaultValue={modal.initialType || 'sale'}><option value="sale">Cash sale — money received</option><option value="credit">Credit given — pay later</option><option value="payment">Debt repayment — customer paid</option><option value="expense">Expense — money paid out</option></select></Field><Field label="Description"><input name="description" required defaultValue={modal.initialDescription || ''} placeholder="e.g. 2 packets of unga" /></Field><div className="form-row"><Field label="Amount (KES)"><input name="amount" inputMode="decimal" type="number" min="1" required defaultValue={modal.initialAmount || ''} placeholder="120" /></Field><Field label={modal.initialType === 'expense' ? 'Supplier' : 'Customer (optional)'}><select name="partyId" defaultValue={modal.initialCustomerId || ''}><option value="">Not linked</option>{(modal.initialType === 'expense' ? data.suppliers : data.customers).map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select></Field></div><Field label="Name if not listed"><input name="partyName" placeholder="Customer or supplier name" /></Field><div className="form-row"><Field label="Category"><select name="category" defaultValue=""><option value="">Choose later</option><option>Groceries</option><option>Stock purchase</option><option>Transport</option><option>Utilities</option><option>Rent</option><option>Sales</option><option>Other</option></select></Field><Field label="Credit due date"><input name="dueDate" type="date" defaultValue={modal.initialDueDate || shiftDay(7)} /></Field></div><p className="form-hint">Credit is recorded as money owed, not cash received.</p></>;
    } else if (modal.type === 'customer' || modal.type === 'supplier') {
      const isC = modal.type === 'customer'; title = (person ? 'Edit ' : 'Add ') + (isC ? 'customer' : 'supplier'); subtitle = isC ? 'Keep names and balances easy to find.' : 'Track what you still need to pay your suppliers.';
      fields = <><Field label="Name"><input name="name" required defaultValue={person?.name || ''} placeholder={isC ? 'Customer name' : 'Supplier name'} /></Field><Field label="Phone number"><input name="phone" defaultValue={person?.phone || ''} placeholder="07xx xxx xxx" /></Field>{!person && <Field label={isC ? 'Opening amount they owe (KES)' : 'Opening amount you owe (KES)'}><input name="openingBalance" type="number" min="0" defaultValue="0" /></Field>}<Field label="Next due date"><input name="dueDate" type="date" defaultValue={person?.dueDate || shiftDay(7)} /></Field><Field label="Note"><textarea name="note" defaultValue={person?.note || ''} rows="2" placeholder="Optional detail or follow-up note" /></Field></>;
    } else if (modal.type === 'payment') {
      const isS = modal.partyType === 'supplier'; title = isS ? 'Pay supplier' : 'Record debt payment'; subtitle = (isS ? 'Record cash paid to ' : 'Record money received from ') + modal.partyName + '.'; actionLabel = isS ? 'Record payment' : 'Record receipt';
      fields = <><div className="party-summary"><span className="avatar">{(modal.partyName || 'P').slice(0,1)}</span><div><b>{modal.partyName}</b><small>Current balance: {fmt((isS ? data.suppliers : data.customers).find(p=>p.id===modal.partyId)?.owed || 0)}</small></div></div><Field label="Amount (KES)"><input name="amount" type="number" min="1" required defaultValue="" placeholder="Amount paid" /></Field><p className="form-hint">{isS ? 'This is recorded as a cash expense and reduces the supplier balance.' : 'This increases cash received and reduces what the customer owes.'}</p></>;
    } else if (modal.type === 'stock') {
      title = modal.item ? 'Edit stock item' : 'Add stock item'; subtitle = 'Use the units you already use in the shop.';
      fields = <><Field label="Product name"><input name="name" required defaultValue={modal.item?.name || ''} placeholder="e.g. Mchele" /></Field><div className="form-row"><Field label="Quantity on hand"><input name="qty" type="number" min="0" required defaultValue={modal.item?.qty ?? 0} /></Field><Field label="Unit"><input name="unit" defaultValue={modal.item?.unit || 'pcs'} placeholder="kg, packets, bottles" /></Field></div><div className="form-row"><Field label="Reorder when below"><input name="alert" type="number" min="0" defaultValue={modal.item?.alert ?? 5} /></Field><Field label="Cost per unit (KES)"><input name="cost" type="number" min="0" defaultValue={modal.item?.cost ?? 0} /></Field></div></>;
    } else if (modal.type === 'stock-update') {
      title = modal.mode === 'restock' ? 'Restock ' + modal.item.name : 'Adjust ' + modal.item.name; subtitle = 'Current stock: ' + modal.item.qty + ' ' + modal.item.unit + '.'; actionLabel = modal.mode === 'restock' ? 'Add to stock' : 'Save quantity';
      fields = <Field label={modal.mode === 'restock' ? 'How many units came in?' : 'Correct total quantity'}><input name="qty" type="number" min="0" required defaultValue={modal.mode === 'restock' ? '' : modal.item.qty} placeholder={modal.mode === 'restock' ? 'Quantity received' : ''} /></Field>;
    } else if (modal.type === 'reminder') {
      title = modal.reminder ? 'Edit reminder' : 'Add reminder'; subtitle = 'Bills, calls and small things the shop needs to remember.';
      fields = <><Field label="Reminder"><input name="title" required defaultValue={modal.reminder?.title || ''} placeholder="e.g. Pay electricity bill" /></Field><Field label="Amount or note"><input name="detail" defaultValue={modal.reminder?.detail || ''} placeholder="e.g. KES 2,400" /></Field><div className="form-row"><Field label="Due date"><input name="dueDate" type="date" required defaultValue={modal.reminder?.dueDate || today()} /></Field><Field label="Type"><select name="kind" defaultValue={modal.reminder?.kind || 'bill'}><option value="bill">Bill / payment</option><option value="followup">Follow-up</option><option value="stock">Stock</option><option value="other">Other</option></select></Field></div></>;
    } else if (modal.type === 'profile') {
      title = 'Shop details'; subtitle = 'This is how your shop appears in your daily book.';
      fields = <><Field label="Shop name"><input name="shop" required defaultValue={data.shopInfo.name} /></Field><Field label="Owner name"><input name="owner" defaultValue={data.shopInfo.owner} /></Field><Field label="Phone for reports"><input name="phone" defaultValue={data.shopInfo.phone} placeholder="07xx xxx xxx" /></Field><Field label="Business type"><select name="type" defaultValue={data.shopInfo.type}><option>General shop</option><option>Mama mboga</option><option>Hardware</option><option>Pharmacy</option><option>Other</option></select></Field></>;
    } else if (modal.type === 'all-transactions') {
      return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setModal(null)}><div className="modal-card modal-wide"><div className="modal-head"><div><h2>All transactions</h2><p>Recent entries from your shop book.</p></div><IconButton icon={X} label="Close" onClick={() => setModal(null)} /></div><div className="all-tx-list">{allTx.map(renderTransaction)}</div></div></div>;
    } else if (modal.type === 'all-reminders') {
      return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setModal(null)}><div className="modal-card"><div className="modal-head"><div><h2>Shop reminders</h2><p>Finish one at a time.</p></div><IconButton icon={X} label="Close" onClick={() => setModal(null)} /></div><div className="reminder-list">{data.reminders.map(renderReminder)}</div><Button icon={Plus} className="full-width" onClick={() => setModal({ type: 'reminder' })}>Add reminder</Button></div></div>;
    } else return null;
    return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setModal(null)}><div className="modal-card"><div className="modal-head"><div><div className="eyebrow">HESABU BOOK</div><h2>{title}</h2><p>{subtitle}</p></div><IconButton icon={X} label="Close" onClick={() => setModal(null)} /></div><form onSubmit={submitModal} className="modal-form">{fields}<div className="modal-actions"><Button variant="outline" onClick={() => setModal(null)}>Cancel</Button><Button type="submit">{actionLabel}</Button></div></form></div></div>;
  };

  return <div className="app-shell">
    <header className="topbar"><div className="topbar-inner"><button className="mobile-menu" onClick={() => setModal({ type: 'profile' })} aria-label="Shop settings"><Menu size={21} /></button><button className="brand-home" onClick={() => go('home')}><Brand /></button><nav className="desktop-nav">{nav.map(item => { const Icon = item.icon; return <button key={item.id} className={page === item.id ? 'nav-active' : ''} onClick={() => go(item.id)}><Icon size={17} strokeWidth={1.8} />{item.label}</button>; })}</nav><div className="topbar-right"><button className="store-switch" onClick={() => setModal({ type: 'profile' })}><div className="store-avatar"><Store size={17} /></div><span><b>{data.shopInfo.name}</b><small>My shop</small></span><ChevronDown size={15} /></button><IconButton icon={Settings2} label="Shop settings" subtle onClick={() => setModal({ type: 'profile' })} /></div></div></header>
    <main className="main-content">{page === 'home' ? homePage : page === 'debts' ? debtsPage : page === 'stock' ? stockPage : reportsPage}</main>
    <footer className="footer"><span><span className="footer-dot"></span> Saved on this device</span><span>Hesabu · A simpler shop book</span><button onClick={() => setModal({ type: 'profile' })}>Shop settings</button></footer>
    <nav className="mobile-nav">{nav.map(item => { const Icon = item.icon; return <button key={item.id} className={page === item.id ? 'mobile-nav-active' : ''} onClick={() => go(item.id)}><Icon size={21} strokeWidth={1.8} /><span>{item.label}</span><i></i></button>; })}</nav>
    {modalContent()}
    {toast && <div className="toast"><CheckCircle2 size={17} />{toast}</div>}
    <div className="a11y-live" aria-live="polite">{toast}</div>
  </div>;
}

function MoreHorizontalIcon() { return <SlidersHorizontal size={17} />; }
export default App;
