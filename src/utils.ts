import type { AppData, Transaction, TransactionDraft, TransactionType } from './types';

export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const id = (prefix = 'id') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
export const money = (amount: number) => `KES ${Math.round(amount || 0).toLocaleString('en-KE')}`;
export const signedMoney = (amount: number) => `${amount < 0 ? '−' : '+'}${money(Math.abs(amount))}`;
export const dateText = (date: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) => {
  if (!date) return 'No date';
  const value = new Date(`${date}T12:00:00`);
  if (Number.isNaN(value.getTime())) return 'No date';
  return value.toLocaleDateString('en-KE', options);
};
export const fullDateText = (date = today()) => dateText(date, { weekday: 'long', day: 'numeric', month: 'long' });
export const shortDay = (date: string) => dateText(date, { weekday: 'short', day: 'numeric', month: 'short' });
export const currentTime = () => new Date().toTimeString().slice(0, 5);
export const addDays = (date: string, days: number) => {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + days);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
};
export const daysUntil = (date: string) => Math.floor((new Date(`${date}T12:00:00`).getTime() - new Date(`${today()}T12:00:00`).getTime()) / 86_400_000);
export const timeText = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d.toLocaleTimeString('en-KE', { hour: 'numeric', minute: '2-digit' });
};
export const transactionLabel: Record<TransactionType, string> = {
  sale: 'Cash sale', credit: 'Credit given', expense: 'Expense', payment: 'Debt payment',
};
export const transactionColor: Record<TransactionType, string> = {
  sale: 'green', credit: 'amber', expense: 'red', payment: 'blue',
};

export function cashIn(tx: Transaction[]) {
  return tx.filter(t => (t.type === 'sale' || t.type === 'payment') && t.paymentStatus !== 'pending' && t.paymentStatus !== 'failed').reduce((sum, t) => sum + t.amount, 0);
}
export function cashOut(tx: Transaction[]) {
  return tx.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
}
export function creditGiven(tx: Transaction[]) {
  return tx.filter(t => t.type === 'credit').reduce((sum, t) => sum + t.amount, 0);
}
export function netCash(tx: Transaction[]) { return cashIn(tx) - cashOut(tx); }

let paymentSequence = 0;
export function makePaymentReference(now = Date.now(), nonce = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)) {
  paymentSequence += 1;
  return `HES-${now.toString(36).toUpperCase()}-${paymentSequence.toString(36).toUpperCase()}-${nonce.replaceAll('-', '').slice(0, 8).toUpperCase()}`;
}

export function reconcileDemoPayment(transactions: Transaction[], transactionId: string, status: 'confirmed' | 'failed'): Transaction[] {
  const target = transactions.find(tx => tx.id === transactionId);
  if (!target || target.paymentMethod !== 'mpesa-demo' || target.paymentStatus !== 'pending') return transactions;
  return transactions.map(tx => tx.id === transactionId ? { ...tx, paymentStatus: status } : tx);
}

const aliases: Record<string, string[]> = {
  Sukari: ['sukari', 'sugar'],
  'Unga wa mahindi': ['unga', 'maize flour', 'flour'],
  Mafuta: ['mafuta', 'oil', 'cooking oil'],
  Mkate: ['mkate', 'bread'],
  Chai: ['chai', 'tea leaves', 'tea'],
  Sabuni: ['sabuni', 'soap'],
  Mchele: ['mchele', 'rice'],
  Chumvi: ['chumvi', 'salt'],
};

const nameFromText = (text: string, data: AppData) => {
  const lower = text.toLowerCase();
  const known = data.customers.find(c => lower.includes(c.name.toLowerCase()));
  if (known) return known.name;
  const match = text.match(/\b(?:customer\s+)?([A-Z][a-z]{2,})\b/);
  if (match && !/^(I|Kamau|Njeri|Otieno|Wanjiku|Hassan|Supplier|Bought|Paid|Cash|Sale|Today|Tomorrow)$/i.test(match[1])) return match[1];
  if (/kamau/i.test(text)) return 'Kamau';
  return undefined;
};

function findAmount(text: string): { amount: number; quantity?: number } {
  const amountPattern = /(?:kes|ksh|kshs|bob|shillings?|ya|kwa|for|worth|of)\s*(\d[\d,]*(?:\.\d{1,2})?)/gi;
  const explicit: number[] = [];
  for (const match of text.matchAll(amountPattern)) explicit.push(Number(match[1].replaceAll(',', '')));
  const quantityMatch = text.match(/\b(\d+)\s*(kg|kilos?|packets?|pieces?|pcs|litres?|liters?|bars?|bottles?|loaf|loaves|sachets?|trays?|crates?|cartons?|dozen|rolls?|tins?|cups?|bags?|bundles?|units?)\b/i);
  const all = [...text.matchAll(/\b\d[\d,]*(?:\.\d{1,2})?\b/g)].map(m => ({ raw: m[0], value: Number(m[0].replaceAll(',', '')), index: m.index ?? 0 }));
  let amount = explicit.find(v => v > 0) ?? 0;
  if (!amount && all.length) {
    const filtered = all.filter(n => !(quantityMatch && n.raw === quantityMatch[1]));
    amount = (filtered.length ? filtered[filtered.length - 1] : all[all.length - 1])?.value ?? 0;
  }
  return { amount: Math.max(0, Number.isFinite(amount) ? amount : 0), quantity: quantityMatch ? Number(quantityMatch[1]) : undefined };
}

function dueDateFromText(text: string) {
  const lower = text.toLowerCase();
  const current = today();
  if (/today|leo\b/.test(lower)) return current;
  if (/tomorrow|kesho/.test(lower)) return addDays(current, 1);
  if (/next week|wiki ijayo/.test(lower)) return addDays(current, 7);
  if (/friday|ijumaa/.test(lower)) {
    const day = new Date(`${current}T12:00:00`).getDay();
    return addDays(current, ((5 - day + 7) % 7) || 7);
  }
  if (/monday|jumatatu/.test(lower)) {
    const day = new Date(`${current}T12:00:00`).getDay();
    return addDays(current, ((1 - day + 7) % 7) || 7);
  }
  return addDays(current, 7);
}

export function parseTransaction(input: string, data: AppData): TransactionDraft | null {
  const text = input.trim().replace(/\s+/g, ' ');
  if (text.length < 2) return null;
  const lower = text.toLowerCase();
  const { amount, quantity } = findAmount(text);
  if (!amount) return null;

  const payment = /paid.*debt|paid.*back|alilipa.*deni|amelipa.*deni|deni yake|payment received|received.*payment|paid the balance|lipa deni/.test(lower);
  const credit = !payment && /on credit|credit|alichukua|amechukua|took\b|pay later|ata.?lipa|kwa deni|deni|will pay/.test(lower);
  const expense = !payment && !credit && /supplier|nilinunua|nimenunua|bought|purchase|nililipa|paid supplier|umeme|electricity|rent|fuel|transport|expense|matumizi|bill|bill ilikuwa/.test(lower);
  const type: TransactionType = payment ? 'payment' : credit ? 'credit' : expense ? 'expense' : 'sale';
  const customerName = (type === 'credit' || type === 'payment') ? nameFromText(text, data) : undefined;

  const stockEntry = data.stock.find(item => {
    const terms = aliases[item.name] ?? [item.name.toLowerCase()];
    return terms.some(term => lower.includes(term));
  });
  const stockVerb = /supplier|alileta|nilinunua|nimenunua|bought|purchased|purchase|delivered|restock|restocked|brought|stocked up/.test(lower);
  let stockQuantityDelta: number | undefined;
  if (stockEntry && stockVerb) stockQuantityDelta = quantity ?? 1;
  else if (stockEntry && (type === 'sale' || type === 'credit')) stockQuantityDelta = -(quantity ?? 1);

  const quantityLabel = quantity ? `${quantity} ${stockEntry?.unit ?? 'items'} of ` : '';
  let summary = '';
  if (type === 'credit') summary = `${customerName ?? 'Customer'} took ${quantityLabel}${stockEntry?.name.toLowerCase() ?? 'goods'} on credit — ${money(amount)}`;
  else if (type === 'payment') summary = `${customerName ?? 'Customer'} paid ${money(amount)} towards an existing debt`;
  else if (type === 'expense') summary = `Expense recorded${stockEntry ? ` for ${stockEntry.name.toLowerCase()}` : ''} — ${money(amount)}`;
  else summary = `Cash sale${stockEntry ? ` — ${stockEntry.name.toLowerCase()}` : ''} — ${money(amount)}`;

  let description = text;
  if (type === 'credit' && customerName && stockEntry) description = `${stockEntry.name}${quantity ? ` · ${quantity} ${stockEntry.unit}` : ''}`;
  else if (type === 'payment' && customerName) description = `Debt payment from ${customerName}`;
  else if (type === 'expense' && stockEntry && stockVerb) description = `Supplier restock — ${stockEntry.name}`;

  return {
    type, description, amount, customerName,
    dueDate: type === 'credit' ? dueDateFromText(text) : undefined,
    stockItemName: stockEntry?.name,
    stockQuantityDelta,
    category: type === 'expense' ? (stockEntry ? 'Stock purchase' : /umeme|electricity|bill/.test(lower) ? 'Utilities' : /transport|fuel/.test(lower) ? 'Transport' : 'Other') : undefined,
    rawText: text,
    summary,
  };
}

export function buildReport(data: AppData, period: 'daily' | 'weekly' | 'monthly', reportDate: string) {
  const from = period === 'daily' ? reportDate : period === 'weekly' ? addDays(reportDate, -6) : `${reportDate.slice(0, 7)}-01`;
  const tx = data.transactions.filter(t => t.date >= from && t.date <= reportDate);
  const inTotal = cashIn(tx);
  const outTotal = cashOut(tx);
  const credit = creditGiven(tx);
  const due = data.reminders.filter(r => !r.done && r.dueDate >= from && r.dueDate <= addDays(reportDate, 3));
  const lowStock = data.stock.filter(s => s.quantity <= s.lowStockAt);
  const label = period === 'daily' ? 'Daily' : period === 'weekly' ? 'Weekly' : 'Monthly';
  const lines = [
    `Hesabu yako · ${label} report`,
    new Date(`${reportDate}T12:00:00`).toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
    '',
    `Pesa iliyoingia: ${money(inTotal)}`,
    `Matumizi: ${money(outTotal)}`,
    `Net cash: ${money(inTotal - outTotal)}`,
    `Madeni mapya: ${money(credit)}`,
    '',
    'Wateja waliochukua kwa deni:',
    ...(tx.filter(t => t.type === 'credit').length ? tx.filter(t => t.type === 'credit').map(t => `- ${t.customerName ?? 'Customer'} · ${money(t.amount)}${t.dueDate ? ` (due ${t.dueDate})` : ''}`) : ['- Hakuna']),
    '',
    'Vitu vya kufuatilia:',
    ...(lowStock.length ? lowStock.map(s => `- ${s.name}: ${s.quantity} ${s.unit} left`) : ['- Stock iko sawa']),
    ...(due.length ? due.map(r => `- ${r.title}${r.amount ? ` · ${money(r.amount)}` : ''} · due ${r.dueDate}`) : []),
    '',
    'Keep your records close. Hesabu.',
  ];
  return { transactions: tx, cashIn: inTotal, cashOut: outTotal, net: inTotal - outTotal, credit, lowStock, due, text: lines.join('\n') };
}
