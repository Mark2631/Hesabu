export type ModuleKey = 'overview' | 'sales' | 'payments' | 'inventory' | 'procurement' | 'accounts' | 'reports' | 'integrations' | 'settings' | 'more';
export type PaymentChannel = 'mpesa' | 'cash' | 'bank' | 'card' | 'credit';
export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'reversed';
export type InvoiceStatus = 'draft' | 'sent' | 'partial' | 'paid' | 'overdue';
export type PurchaseStatus = 'draft' | 'sent' | 'partially_received' | 'received' | 'cancelled';

export interface BusinessProfile {
  name: string; legalName: string; owner: string; email: string; phone: string;
  location: string; currency: 'KES'; taxPin: string; industry: string;
}
export interface Product {
  id: string; sku: string; name: string; category: string; unit: string;
  quantity: number; reorderLevel: number; costPrice: number; sellingPrice: number;
  supplierId?: string; updatedAt: string;
}
export interface InvoiceLine {
  productId: string; name: string; sku: string; quantity: number;
  unitPrice: number; unitCost: number; lineTotal: number;
}
export interface Invoice {
  id: string; number: string; customer: string; phone: string; date: string; dueDate: string;
  lines: InvoiceLine[]; subtotal: number; discount: number; total: number; paid: number;
  channel: PaymentChannel; status: InvoiceStatus; source: 'hesabu' | 'website' | 'pos' | 'manual';
}
export interface Payment {
  id: string; invoiceId: string; invoiceNumber: string; customer: string; phone: string;
  amount: number; channel: PaymentChannel; status: PaymentStatus; reference: string;
  createdAt: string; confirmedAt?: string; note?: string; rail?: string;
  appliedAmount?: number; unappliedAmount?: number;
  origin: 'manual' | 'daraja_demo' | 'integration' | 'reconciliation';
}
export type ReceiptRail = 'Till / PayBill' | 'Pochi la Biashara' | 'Send Money to business' | 'Bank transfer' | 'Manual M-Pesa receipt';
export interface UnmatchedReceipt {
  id: string; reference: string; payer: string; phone: string; amount: number;
  rail: ReceiptRail; receivedAt: string; source: 'manual' | 'statement' | 'callback';
}
export interface NewUnmatchedReceiptInput {
  reference: string; payer: string; phone: string; amount: number; rail: ReceiptRail;
}
export interface Expense {
  id: string; date: string; category: string; description: string; amount: number;
  channel: Exclude<PaymentChannel, 'credit'>; reference: string;
}
export interface Supplier {
  id: string; name: string; phone: string; email: string; terms: string; balance: number;
}
export interface PurchaseLine {
  productId: string; name: string; quantity: number; received: number; unitCost: number; lineTotal: number;
}
export interface PurchaseOrder {
  id: string; number: string; supplierId: string; supplierName: string;
  createdAt: string; expectedAt: string; lines: PurchaseLine[]; total: number; status: PurchaseStatus;
}
export interface JournalLine {
  id: string; journalId: string; date: string; account: string;
  debit: number; credit: number; description: string; reference: string;
}
export interface IntegrationEvent {
  id: string; time: string; type: string; source: string;
  status: 'delivered' | 'pending' | 'failed'; reference: string; detail: string;
}
export type TeamRole = 'Owner' | 'Manager' | 'Sales' | 'Inventory' | 'Finance';
export type TeamMemberStatus = 'active' | 'suspended';
export interface TeamMember {
  id: string; name: string; email: string; role: TeamRole; status: TeamMemberStatus;
}
export interface CashMovement {
  id: string;
  date: string;
  channel: 'cash' | 'mpesa' | 'bank' | 'card';
  direction: 'out';
  amount: number;
  description: string;
  reference: string;
  source: 'supplier_payment' | 'other';
}
export interface AppData {
  profile: BusinessProfile; products: Product[]; invoices: Invoice[]; payments: Payment[];
  unmatchedReceipts: UnmatchedReceipt[]; expenses: Expense[]; cashMovements: CashMovement[]; suppliers: Supplier[]; purchaseOrders: PurchaseOrder[]; teamMembers: TeamMember[];
  journal: JournalLine[]; events: IntegrationEvent[];
  openingBalances: { cash: number; mpesa: number; bank: number; inventory: number };
  nextInvoice: number; nextPurchaseOrder: number;
}
export interface NewInvoiceInput {
  customer: string; phone: string; dueDate: string; discount: number; channel: PaymentChannel;
  items: Array<{ productId: string; quantity: number }>; source: Invoice['source'];
}
export interface NewPaymentInput {
  invoiceId: string; phone: string; amount: number; channel: PaymentChannel; origin: Payment['origin'];
}
export interface NewPurchaseInput {
  supplierId: string; expectedAt: string;
  items: Array<{ productId: string; quantity: number; unitCost: number }>;
}
