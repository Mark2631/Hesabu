import type { AppData, DailyClose, Transaction, TransactionDraft, TransactionType } from './types';

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
  return tx.filter(t => t.type === 'sale' || t.type === 'payment').reduce((sum, t) => sum + t.amount, 0);
}
export function cashOut(tx: Transaction[]) {
  return tx.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
}
export function creditGiven(tx: Transaction[]) {
  return tx.filter(t => t.type === 'credit').reduce((sum, t) => sum + t.amount, 0);
}
export function netCash(tx: Transaction[]) { return cashIn(tx) - cashOut(tx); }

export function mpesaReceived(tx: Transaction[]) {
  return tx.filter(t => (t.type === 'sale' || t.type === 'payment') && t.paymentMethod === 'mpesa').reduce((sum, t) => sum + t.amount, 0);
}
export function cashReceived(tx: Transaction[]) {
  return tx.filter(t => (t.type === 'sale' || t.type === 'payment') && t.paymentMethod !== 'mpesa').reduce((sum, t) => sum + t.amount, 0);
}

export function drawerCashIn(tx: Transaction[]) {
  return tx.filter(t => (t.type === 'sale' || t.type === 'payment')
    && t.paymentMethod !== 'mpesa')
    .reduce((sum, t) => sum + t.amount, 0);
}
export function drawerCashOut(tx: Transaction[]) {
  return tx.filter(t => t.type === 'expense' && t.paymentMethod !== 'mpesa')
    .reduce((sum, t) => sum + t.amount, 0);
}
export function expectedDrawerCash(data: AppData, date: string, openingCash: number) {
  const tx = data.transactions.filter(t => (t.tradingDay ?? t.date) === date);
  return Math.max(0, Math.round(openingCash) + drawerCashIn(tx) - drawerCashOut(tx));
}
export function makeDailyClose(data: AppData, date: string, openingCash: number, countedCash: number, closedAt = new Date()): DailyClose {
  const opening = Math.max(0, Math.round(openingCash));
  const counted = Math.max(0, Math.round(countedCash));
  const expected = expectedDrawerCash(data, date, opening);
  return { id: 'close-' + date, date, openingCash: opening, expectedCash: expected, countedCash: counted, difference: counted - expected, closedAt: closedAt.toISOString() };
}
export function suggestedOpeningCash(closes: DailyClose[], date: string) {
  const previous = [...closes].filter(close => close.date < date)
    .sort((a, b) => (b.date + b.closedAt).localeCompare(a.date + a.closedAt))[0];
  return previous?.countedCash ?? 0;
}

/** Any ledger edit made after till close requires a fresh physical cash count. */
export function invalidateDailyClose(data: AppData, ...dates: string[]): AppData {
  if (!data.dailyCloses?.length || !dates.length) return data;
  const invalidDates = new Set(dates.filter(Boolean));
  return { ...data, dailyCloses: data.dailyCloses.filter(close => !invalidDates.has(close.date)) };
}

function localDateString(date: Date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}
function clockMinutes(value: string, fallback: number) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return fallback;
  const hours = Number(match[1]), minutes = Number(match[2]);
  return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : fallback;
}

/** Resolve the business date for a shop's trading session, including overnight shifts. */
export function tradingDayFor(now = new Date(), start = '06:00', end = '21:00') {
  const date = localDateString(now);
  const minute = now.getHours() * 60 + now.getMinutes();
  const startMinute = clockMinutes(start, 360);
  const endMinute = clockMinutes(end, 1260);
  if (startMinute === endMinute) return date;
  if (startMinute < endMinute) return minute < startMinute ? addDays(date, -1) : date;
  return minute >= startMinute ? date : addDays(date, -1);
}

/** Whether the shop is currently inside its configured trading window. */
export function isWithinTradingHours(now = new Date(), start = '06:00', end = '21:00') {
  const minute = now.getHours() * 60 + now.getMinutes();
  const startMinute = clockMinutes(start, 360);
  const endMinute = clockMinutes(end, 1260);
  if (startMinute === endMinute) return true;
  return startMinute < endMinute
    ? minute >= startMinute && minute < endMinute
    : minute >= startMinute || minute < endMinute;
}

/** Convert common dictated English/Kiswahili number words to digits before parsing entries. */
export function normalizeSpokenNumbers(input: string) {
  const words = 'zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|and|moja|mbili|tatu|nne|tano|sita|saba|nane|tisa|kumi|ishirini|thelathini|arobaini|hamsini|sitini|sabini|themanini|tisini|mia|elfu|na';
  const pattern = new RegExp('\\b(?:' + words + ')(?:[\\s-]+(?:' + words + '))*\\b', 'gi');
  const units: Record<string, number> = {
    zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9,
    ten:10, eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15, sixteen:16,
    seventeen:17, eighteen:18, nineteen:19, moja:1, mbili:2, tatu:3, nne:4, tano:5,
    sita:6, saba:7, nane:8, tisa:9, kumi:10,
  };
  const tens: Record<string, number> = {
    twenty:20, thirty:30, forty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90,
    ishirini:20, thelathini:30, arobaini:40, hamsini:50, sitini:60, sabini:70, themanini:80, tisini:90,
  };
  return input.replace(pattern, phrase => {
    const tokens = phrase.toLowerCase().split(/[\s-]+/).filter(token => token !== 'and' && token !== 'na');
    if (!tokens.length || tokens.every(token => token === 'hundred' || token === 'thousand' || token === 'mia' || token === 'elfu')) return phrase;
    let total = 0, group = 0, prefixScale = 0;
    for (const token of tokens) {
      if (units[token] !== undefined || tens[token] !== undefined) {
        const number = units[token] ?? tens[token];
        if (prefixScale) {
          total += number * prefixScale;
          prefixScale = 0;
        } else {
          group += number;
        }
      } else if (token === 'hundred' || token === 'thousand') {
        const scale = token === 'hundred' ? 100 : 1000;
        total += (group || 1) * scale;
        group = 0;
      } else if (token === 'mia' || token === 'elfu') {
        prefixScale = token === 'mia' ? 100 : 1000;
      }
    }
    return String(total + group);
  });
}
export function normalizeKenyanWhatsAppNumber(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (/^0[17]\d{8}$/.test(digits)) return '254' + digits.slice(1);
  if (/^254[17]\d{8}$/.test(digits)) return digits;
  return null;
}
export function whatsAppUrl(message: string, phone?: string | null) {
  return 'https://wa.me/' + (phone ?? '') + '?text=' + encodeURIComponent(message);
}
export function debtReminderMessage(customerName: string, shopName: string, balance: number, dueDate?: string) {
  return [
    'Habari ' + customerName + ',',
    'Tunakuandikia kutoka ' + shopName + ' kukukumbusha salio lako la ' + money(balance) + '.',
    dueDate ? 'Tarehe ya kulipa ilikuwa/ni ' + dateText(dueDate, { day: 'numeric', month: 'short' }) + '.' : '',
    'Tafadhali tujulishe utakapoweza kulipa. Asante kwa biashara yako.',
  ].filter(Boolean).join('\n');
}
export function receiptMessage(shopName: string, transaction: Transaction, outstandingBalance?: number) {
  const credit = transaction.type === 'credit';
  return [
    shopName,
    credit ? 'CREDIT NOTE' : 'SALES RECEIPT',
    'Item / maelezo: ' + transaction.description,
    'Amount: ' + money(transaction.amount),
    'Date: ' + dateText(transaction.date, { day: 'numeric', month: 'short', year: 'numeric' }) + ' · ' + timeText(transaction.time),
    'Payment: ' + (credit ? 'Credit / Deni' : transaction.paymentMethod === 'mpesa' ? 'M-Pesa' : 'Cash'),
    ...(credit && outstandingBalance !== undefined ? ['Outstanding balance: ' + money(outstandingBalance)] : []),
    'Asante kwa biashara yako.',
  ].join('\n');
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
  const match = text.match(/\b(?:customer\s+)?([A-Z][a-z]{2,})\b/i);
  if (match && !/^(I|we|my|our|Supplier|Bought|Paid|Cash|Sale|Today|Tomorrow|Two|One|Three|Four|Five|Six|Seven|Eight|Nine|Ten)$/i.test(match[1])) return match[1];
  if (/kamau/i.test(text)) return 'Kamau';
  return undefined;
};

function findAmount(text: string): { amount: number; quantity?: number } {
  const amountPattern = /(?:kes|ksh|kshs|bob|shillings?|ya|kwa|for|worth|of)\s*(\d[\d,]*(?:\.\d{1,2})?)/gi;
  const explicit: number[] = [];
  for (const match of text.matchAll(amountPattern)) explicit.push(Number(match[1].replaceAll(',', '')));
  const quantityMatch = text.match(/\b(\d+)\s*(kg|kgs|kilograms?|kilos?|kilo|packets?|pieces?|pcs|litres?|liters?|bars?|bottles?|loaf|loaves|sachets?|trays?|crates?|cartons?|dozen|rolls?|tins?|cups?|bags?|bundles?|units?)\b/i);
  const quantityAfterUnit = !quantityMatch ? text.match(/\b(kg|kgs|kilograms?|kilos?|kilo|packets?|pieces?|pcs|litres?|liters?|bars?|bottles?|loaf|loaves|sachets?|trays?|crates?|cartons?|dozen|rolls?|tins?|cups?|bags?|bundles?|units?)\s*(\d+)\b/i) : null;
  const quantityToken = quantityMatch?.[1] ?? quantityAfterUnit?.[2];
  const quantity = quantityToken ? Number(quantityToken) : undefined;
  const all = [...text.matchAll(/\b\d[\d,]*(?:\.\d{1,2})?\b/g)].map(m => ({ raw: m[0], value: Number(m[0].replaceAll(',', '')), index: m.index ?? 0 }));
  let amount = explicit.find(v => v > 0) ?? 0;
  if (!amount && all.length) {
    const filtered = all.filter(n => !(quantityToken && n.raw === quantityToken));
    amount = (filtered.length ? filtered[filtered.length - 1] : all[all.length - 1])?.value ?? 0;
  }
  return { amount: Math.max(0, Number.isFinite(amount) ? amount : 0), quantity };
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
  const text = normalizeSpokenNumbers(input).trim().replace(/\s+/g, ' ');
  if (text.length < 2) return null;
  const lower = text.toLowerCase();
  const { amount, quantity } = findAmount(text);
  if (!amount) return null;

  const namedPayment = /^([a-z][a-z'-]{2,})\s+(?:has\s+)?(?:paid|payed|amelipa|alilipa)\b/i.test(text) && !/^(i|we|my|the shop)\b/i.test(text);
  const payment = /paid.*debt|paid.*back|alilipa.*deni|amelipa.*deni|deni yake|payment received|received.*payment|paid the balance|lipa deni/.test(lower) || namedPayment;
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
    paymentMethod: (type === 'sale' || type === 'payment') && /m[\s-]?pesa|paybill|till number/i.test(lower) ? 'mpesa' : undefined,
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
  const tx = data.transactions.filter(t => (t.tradingDay ?? t.date) >= from && (t.tradingDay ?? t.date) <= reportDate);
  const inTotal = cashIn(tx);
  const outTotal = cashOut(tx);
  const credit = creditGiven(tx);
  const cashReceivedTotal = cashReceived(tx);
  const mpesaReceivedTotal = mpesaReceived(tx);
  const due = data.reminders.filter(r => !r.done && r.dueDate >= from && r.dueDate <= addDays(reportDate, 3));
  const lowStock = data.stock.filter(s => s.quantity <= s.lowStockAt);
  const dailyClose = period === 'daily'
    ? [...(data.dailyCloses ?? [])].filter(close => close.date === reportDate).sort((a, b) => b.closedAt.localeCompare(a.closedAt))[0]
    : undefined;
  const label = period === 'daily' ? 'Daily' : period === 'weekly' ? 'Weekly' : 'Monthly';
  const lines = [
    `Hesabu yako · ${label} report`,
    new Date(`${reportDate}T12:00:00`).toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
    '',
    `Pesa iliyoingia: ${money(inTotal)}`,
    `Cash received: ${money(cashReceivedTotal)}`,
    `M-Pesa received: ${money(mpesaReceivedTotal)}`,
    `Matumizi: ${money(outTotal)}`,
    `Net cash: ${money(inTotal - outTotal)}`,
    ...(dailyClose ? [
      `Till expected: ${money(dailyClose.expectedCash)}`,
      `Till counted: ${money(dailyClose.countedCash)}`,
      `Till difference: ${dailyClose.difference >= 0 ? '+' : '−'}${money(Math.abs(dailyClose.difference))}`,
    ] : []),
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
  return { transactions: tx, cashIn: inTotal, cashOut: outTotal, net: inTotal - outTotal, cashReceived: cashReceivedTotal, mpesaReceived: mpesaReceivedTotal, credit, lowStock, due, dailyClose, text: lines.join('\n') };
}
