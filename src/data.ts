import type { AppData, Customer, Reminder, StockItem, Transaction } from './types';

const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const offset = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return iso(date);
};
const timeAt = (hours: number, minutes: number) => `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
const daysAgo = (days: number) => offset(-days);

export function makeDemoData(): AppData {
  const stock: StockItem[] = [
    { id: 'stock-sugar', name: 'Sukari', quantity: 4, unit: 'kg', lowStockAt: 8, lastRestocked: daysAgo(3), costPerUnit: 145 },
    { id: 'stock-flour', name: 'Unga wa mahindi', quantity: 17, unit: 'packets', lowStockAt: 6, lastRestocked: daysAgo(1), costPerUnit: 125 },
    { id: 'stock-oil', name: 'Mafuta', quantity: 7, unit: 'litres', lowStockAt: 5, lastRestocked: offset(0), costPerUnit: 310 },
    { id: 'stock-bread', name: 'Mkate', quantity: 2, unit: 'loaves', lowStockAt: 5, lastRestocked: offset(0), costPerUnit: 55 },
    { id: 'stock-tea', name: 'Chai', quantity: 14, unit: 'packets', lowStockAt: 5, lastRestocked: daysAgo(5), costPerUnit: 85 },
    { id: 'stock-soap', name: 'Sabuni', quantity: 9, unit: 'bars', lowStockAt: 5, lastRestocked: daysAgo(2), costPerUnit: 60 },
    { id: 'stock-rice', name: 'Mchele', quantity: 22, unit: 'kg', lowStockAt: 7, lastRestocked: daysAgo(2), costPerUnit: 180 },
    { id: 'stock-salt', name: 'Chumvi', quantity: 12, unit: 'packets', lowStockAt: 4, lastRestocked: daysAgo(6), costPerUnit: 30 },
  ];

  const customers: Customer[] = [
    { id: 'customer-kamau', kind: 'customer', name: 'Kamau', phone: '0712 345 678', balance: 620, dueDate: offset(0), note: 'Usually settles on Fridays.' },
    { id: 'customer-njeri', kind: 'customer', name: 'Njeri', phone: '0722 410 665', balance: 385, dueDate: offset(5) },
    { id: 'customer-otieno', kind: 'customer', name: 'Otieno', phone: '0701 228 114', balance: 280, dueDate: offset(-3) },
    { id: 'customer-wanjiku', kind: 'customer', name: 'Wanjiku', phone: '0790 335 821', balance: 840, dueDate: offset(8) },
    { id: 'customer-hassan', kind: 'customer', name: 'Hassan', phone: '0110 640 290', balance: 450, dueDate: offset(-1) },
    { id: 'supplier-annette', kind: 'supplier', name: 'Madam Annette', phone: '0718 222 450', balance: -4800, dueDate: offset(2), note: 'Cooking oil and household goods supplier.' },
    { id: 'supplier-wholesale', kind: 'supplier', name: 'Meru Wholesalers', phone: '0700 000 444', balance: -3200, dueDate: offset(4) },
  ];

  const transactions: Transaction[] = [
    { id: 'tx-today-kamau', type: 'credit', description: 'Sukari, 1 kg', amount: 120, date: offset(0), time: timeAt(10, 23), customerId: 'customer-kamau', customerName: 'Kamau', dueDate: offset(5), stockItemId: 'stock-sugar', stockQuantityDelta: -1 },
    { id: 'tx-today-unga', type: 'sale', description: 'Unga wa mahindi', amount: 250, date: offset(0), time: timeAt(10, 10), stockItemId: 'stock-flour', stockQuantityDelta: -2 },
    { id: 'tx-today-njeri', type: 'payment', description: 'Payment for previous debt', amount: 300, date: offset(0), time: timeAt(9, 48), customerId: 'customer-njeri', customerName: 'Njeri' },
    { id: 'tx-today-supplier', type: 'expense', description: 'Supplier — mafuta and household goods', amount: 850, date: offset(0), time: timeAt(9, 15), category: 'Stock purchase', stockItemId: 'stock-oil', stockQuantityDelta: 4 },
    { id: 'tx-today-otieno', type: 'credit', description: 'Milk', amount: 80, date: offset(0), time: timeAt(8, 42), customerId: 'customer-otieno', customerName: 'Otieno', dueDate: offset(4) },
    { id: 'tx-today-general', type: 'sale', description: 'Mixed household goods', amount: 2800, date: offset(0), time: timeAt(8, 20) },
    { id: 'tx-today-tea', type: 'sale', description: 'Chai and bread', amount: 450, date: offset(0), time: timeAt(8, 11), stockItemId: 'stock-tea', stockQuantityDelta: -1 },
    { id: 'tx-today-transport', type: 'expense', description: 'Delivery transport', amount: 100, date: offset(0), time: timeAt(7, 55), category: 'Transport' },
    { id: 'tx-yesterday-rice', type: 'sale', description: 'Mchele, 2 kg', amount: 360, date: daysAgo(1), time: timeAt(16, 10), stockItemId: 'stock-rice', stockQuantityDelta: -2 },
    { id: 'tx-yesterday-wanjiku', type: 'credit', description: 'Sabuni and Chai', amount: 220, date: daysAgo(1), time: timeAt(14, 20), customerId: 'customer-wanjiku', customerName: 'Wanjiku', dueDate: offset(5) },
    { id: 'tx-yesterday-shop', type: 'expense', description: 'Shop supplies', amount: 240, date: daysAgo(1), time: timeAt(12, 0), category: 'Supplies' },
    { id: 'tx-yesterday-cash', type: 'sale', description: 'Cash sale — groceries', amount: 1250, date: daysAgo(1), time: timeAt(11, 25) },
    { id: 'tx-2day-flour', type: 'sale', description: 'Unga wa mahindi', amount: 500, date: daysAgo(2), time: timeAt(13, 10), stockItemId: 'stock-flour', stockQuantityDelta: -4 },
    { id: 'tx-2day-electricity', type: 'expense', description: 'Electricity tokens', amount: 500, date: daysAgo(2), time: timeAt(11, 0), category: 'Utilities' },
    { id: 'tx-2day-hassan', type: 'credit', description: 'Mchele and Sukari', amount: 300, date: daysAgo(2), time: timeAt(9, 40), customerId: 'customer-hassan', customerName: 'Hassan', dueDate: offset(2) },
  ];

  const reminders: Reminder[] = [
    { id: 'rem-electricity', title: 'Umeme bill', detail: 'Pay tokens before the supply runs low.', amount: 2400, dueDate: offset(1), kind: 'bill', done: false },
    { id: 'rem-rent', title: 'Shop rent', detail: 'Monthly rent payment.', amount: 8500, dueDate: offset(3), kind: 'bill', done: false },
    { id: 'rem-annette', title: 'Call Madam Annette', detail: 'Confirm the next delivery of cooking oil.', dueDate: offset(0), kind: 'supplier', done: false },
    { id: 'rem-kamau', title: 'Follow up with Kamau', detail: 'He said he would settle on Friday.', dueDate: offset(0), kind: 'customer', done: false },
  ];

  return {
    shopInfo: { name: 'Mama Grace General Shop', owner: 'Grace', phone: '0712 000 123', businessType: 'General shop', tradingDayStart: '06:00', tradingDayEnd: '21:00' },
    transactions,
    customers,
    stock,
    reminders,
  };
}

export const STORAGE_KEY = 'hesabu:v1:shop-data';

export const LAST_BACKUP_KEY = 'hesabu:v1:last-backup';

type UnknownRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is UnknownRecord => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const validDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const validTime = (value: unknown): value is string => typeof value === 'string' && /^\d{2}:\d{2}$/.test(value);
const finiteAmount = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function readLastBackupAt(): string | null {
  try {
    const value = localStorage.getItem(LAST_BACKUP_KEY);
    return value && Number.isFinite(Date.parse(value)) ? value : null;
  } catch { return null; }
}

export function markBackupAt(value = new Date().toISOString()): boolean {
  try { localStorage.setItem(LAST_BACKUP_KEY, value); return true; }
  catch { return false; }
}

export function createBackupEnvelope(data: AppData, exportedAt = new Date().toISOString()) {
  return { format: 'hesabu-backup' as const, version: 1 as const, exportedAt, data };
}

export function parseBackupPayload(value: unknown): AppData | null {
  const candidate = isRecord(value) && value.format === 'hesabu-backup' && value.version === 1 ? value.data : value;
  if (!isRecord(candidate) || !isRecord(candidate.shopInfo)) return null;
  const shop = candidate.shopInfo;
  if (typeof shop.name !== 'string' || !shop.name.trim()) return null;
  if (!Array.isArray(candidate.transactions) || !Array.isArray(candidate.customers) || !Array.isArray(candidate.stock)) return null;
  const transactions = candidate.transactions;
  const customers = candidate.customers;
  const stock = candidate.stock;
  const reminders = candidate.reminders === undefined ? [] : candidate.reminders;
  const dailyCloses = candidate.dailyCloses === undefined ? [] : candidate.dailyCloses;
  const shopGoal = candidate.shopGoal === undefined || candidate.shopGoal === null ? null : candidate.shopGoal;
  if (!Array.isArray(reminders) || !Array.isArray(dailyCloses)) return null;

  const validTransactions = transactions.every(row => isRecord(row)
    && typeof row.id === 'string'
    && ['sale', 'credit', 'expense', 'payment'].includes(String(row.type))
    && typeof row.description === 'string' && finiteAmount(row.amount)
    && validDate(row.date) && validTime(row.time)
    && (row.tradingDay === undefined || validDate(row.tradingDay))
    && (row.paymentMethod === undefined || row.paymentMethod === 'cash' || row.paymentMethod === 'mpesa'));
  const validCustomers = customers.every(row => isRecord(row)
    && typeof row.id === 'string' && typeof row.name === 'string' && typeof row.phone === 'string'
    && typeof row.balance === 'number' && Number.isFinite(row.balance)
    && (row.kind === undefined || row.kind === 'customer' || row.kind === 'supplier'));
  const validStock = stock.every(row => isRecord(row)
    && typeof row.id === 'string' && typeof row.name === 'string' && typeof row.unit === 'string'
    && finiteAmount(row.quantity) && finiteAmount(row.lowStockAt) && validDate(row.lastRestocked));
  const validReminders = reminders.every(row => isRecord(row)
    && typeof row.id === 'string' && typeof row.title === 'string'
    && validDate(row.dueDate) && typeof row.done === 'boolean'
    && ['bill', 'supplier', 'customer', 'other'].includes(String(row.kind))
    && (row.amount === undefined || finiteAmount(row.amount))
    && (row.customerId === undefined || typeof row.customerId === 'string')
    && (row.stockItemId === undefined || typeof row.stockItemId === 'string'));
  const validDailyCloses = dailyCloses.every(row => isRecord(row)
    && typeof row.id === 'string' && validDate(row.date)
    && finiteAmount(row.openingCash) && finiteAmount(row.expectedCash)
    && finiteAmount(row.countedCash) && typeof row.difference === 'number' && Number.isFinite(row.difference)
    && typeof row.closedAt === 'string' && Number.isFinite(Date.parse(row.closedAt)));
  const validShopGoal = shopGoal === null || (isRecord(shopGoal)
    && typeof shopGoal.title === 'string' && Boolean(shopGoal.title.trim())
    && finiteAmount(shopGoal.targetAmount) && shopGoal.targetAmount > 0
    && finiteAmount(shopGoal.progressAmount) && shopGoal.progressAmount <= shopGoal.targetAmount
    && typeof shopGoal.updatedAt === 'string' && Number.isFinite(Date.parse(shopGoal.updatedAt)));
  if (!validTransactions || !validCustomers || !validStock || !validReminders || !validDailyCloses || !validShopGoal) return null;

  const fallback = makeDemoData();
  return {
    shopGoal: shopGoal as AppData['shopGoal'] ?? null,
    shopInfo: {
      name: shop.name.trim(),
      owner: typeof shop.owner === 'string' ? shop.owner : '',
      phone: typeof shop.phone === 'string' ? shop.phone : '',
      businessType: typeof shop.businessType === 'string' ? shop.businessType : fallback.shopInfo.businessType,
      tradingDayStart: validTime(shop.tradingDayStart) ? shop.tradingDayStart : '06:00',
      tradingDayEnd: validTime(shop.tradingDayEnd) ? shop.tradingDayEnd : '21:00',
    },
    transactions: transactions as AppData['transactions'],
    customers: customers.map(row => {
      const customer = row as AppData['customers'][number];
      return { ...customer, kind: customer.kind ?? (customer.balance < 0 ? 'supplier' as const : 'customer' as const) };
    }),
    stock: stock as AppData['stock'],
    reminders: reminders as AppData['reminders'],
    dailyCloses: dailyCloses as AppData['dailyCloses'],
  };
}

export function hasSavedData(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<AppData>;
    return Boolean(parsed?.shopInfo && Array.isArray(parsed.transactions) && Array.isArray(parsed.customers) && Array.isArray(parsed.stock));
  } catch {
    return false;
  }
}

export function readSavedData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppData;
      if (parsed?.shopInfo && Array.isArray(parsed.transactions) && Array.isArray(parsed.customers) && Array.isArray(parsed.stock)) {
        const fallback = makeDemoData();
        const customers = parsed.customers.map(c => ({ ...c, kind: c.kind ?? (c.balance < 0 ? 'supplier' as const : 'customer' as const) }));
        const shopInfo = { ...fallback.shopInfo, ...parsed.shopInfo, tradingDayStart: validTime(parsed.shopInfo.tradingDayStart ?? '') ? parsed.shopInfo.tradingDayStart : '06:00', tradingDayEnd: validTime(parsed.shopInfo.tradingDayEnd ?? '') ? parsed.shopInfo.tradingDayEnd : '21:00' };
        return { ...fallback, ...parsed, shopInfo, shopGoal: parsed.shopGoal ?? null, customers, reminders: parsed.reminders ?? fallback.reminders, dailyCloses: parsed.dailyCloses ?? [] };
      }
    }
  } catch {
    // A corrupt or blocked local save should never prevent the ledger from opening.
  }
  return makeDemoData();
}

export function saveData(data: AppData): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    // The caller must show that changes may not survive a reload.
    return false;
  }
}
