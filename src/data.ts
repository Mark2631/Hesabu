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
    shopInfo: { name: 'Mama Grace General Shop', owner: 'Grace', phone: '0712 000 123', businessType: 'General shop' },
    transactions,
    customers,
    stock,
    reminders,
    dailyCloses: [],
  };
}

export const STORAGE_KEY = 'hesabu:v1:shop-data';

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
        return { ...fallback, ...parsed, customers, reminders: parsed.reminders ?? fallback.reminders, dailyCloses: parsed.dailyCloses ?? [] };
      }
    }
  } catch {
    // A corrupt or blocked local save should never prevent the ledger from opening.
  }
  return makeDemoData();
}

export function saveData(data: AppData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // The in-memory ledger still works for this session if storage is unavailable.
  }
}
