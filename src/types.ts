export type TransactionType = 'sale' | 'credit' | 'expense' | 'payment';
export type PaymentMethod = 'cash' | 'mpesa';
export type Section = 'home' | 'ledger' | 'debts' | 'stock' | 'more';
export type DebtDirection = 'they-owe' | 'we-owe';

export interface ShopInfo {
  name: string;
  owner: string;
  phone: string;
  businessType: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  description: string;
  amount: number;
  date: string;
  time: string;
  paymentMethod?: PaymentMethod;
  customerId?: string;
  customerName?: string;
  dueDate?: string;
  stockItemId?: string;
  stockQuantityDelta?: number;
  category?: string;
  note?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  balance: number;
  kind?: 'customer' | 'supplier';
  dueDate?: string;
  note?: string;
}

export interface StockItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  lowStockAt: number;
  lastRestocked: string;
  costPerUnit?: number;
}

export interface Reminder {
  id: string;
  title: string;
  detail?: string;
  amount?: number;
  dueDate: string;
  kind: 'bill' | 'supplier' | 'customer' | 'other';
  customerId?: string;
  stockItemId?: string;
  done: boolean;
}

export interface AppData {
  shopInfo: ShopInfo;
  transactions: Transaction[];
  customers: Customer[];
  stock: StockItem[];
  reminders: Reminder[];
}

export interface TransactionDraft {
  type: TransactionType;
  description: string;
  amount: number;
  paymentMethod?: PaymentMethod;
  customerName?: string;
  dueDate?: string;
  stockItemName?: string;
  stockQuantityDelta?: number;
  category?: string;
  rawText?: string;
  summary: string;
}
