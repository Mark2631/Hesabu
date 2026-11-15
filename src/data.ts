import type { AppData, Expense, Invoice, JournalLine, Payment, Product, Supplier, TeamMember } from './types';

const localDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
};
const today = () => localDate(new Date());
const offset = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localDate(date);
};
const timeAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const products: Product[] = [
  { id: 'prd-001', sku: 'GRC-001', name: 'Pembe Maize Flour 2kg', category: 'Food staples', unit: 'packet', quantity: 56, reorderLevel: 20, costPrice: 128, sellingPrice: 160, supplierId: 'sup-001', updatedAt: offset(0) },
  { id: 'prd-002', sku: 'DRY-014', name: 'Cooking Oil 1L', category: 'Cooking essentials', unit: 'bottle', quantity: 23, reorderLevel: 18, costPrice: 248, sellingPrice: 295, supplierId: 'sup-002', updatedAt: offset(0) },
  { id: 'prd-003', sku: 'DRY-018', name: 'Sugar 1kg', category: 'Food staples', unit: 'packet', quantity: 11, reorderLevel: 16, costPrice: 142, sellingPrice: 175, supplierId: 'sup-001', updatedAt: offset(0) },
  { id: 'prd-004', sku: 'DAI-002', name: 'Fresh Milk 500ml', category: 'Dairy', unit: 'packet', quantity: 42, reorderLevel: 24, costPrice: 56, sellingPrice: 70, supplierId: 'sup-003', updatedAt: offset(0) },
  { id: 'prd-005', sku: 'HOM-011', name: 'Dishwashing Liquid 750ml', category: 'Home care', unit: 'bottle', quantity: 8, reorderLevel: 12, costPrice: 105, sellingPrice: 145, supplierId: 'sup-004', updatedAt: offset(-1) },
  { id: 'prd-006', sku: 'BAK-003', name: 'Sliced Bread 400g', category: 'Bakery', unit: 'loaf', quantity: 17, reorderLevel: 15, costPrice: 55, sellingPrice: 70, supplierId: 'sup-003', updatedAt: offset(0) },
  { id: 'prd-007', sku: 'BEV-022', name: 'Soda 500ml', category: 'Beverages', unit: 'bottle', quantity: 31, reorderLevel: 18, costPrice: 48, sellingPrice: 70, supplierId: 'sup-005', updatedAt: offset(-1) },
  { id: 'prd-008', sku: 'HOM-016', name: 'Bar Soap 800g', category: 'Home care', unit: 'bar', quantity: 4, reorderLevel: 10, costPrice: 118, sellingPrice: 150, supplierId: 'sup-004', updatedAt: offset(-2) },
  { id: 'prd-009', sku: 'GRC-008', name: 'Rice 2kg', category: 'Food staples', unit: 'packet', quantity: 29, reorderLevel: 12, costPrice: 285, sellingPrice: 340, supplierId: 'sup-001', updatedAt: offset(0) },
  { id: 'prd-010', sku: 'DAI-009', name: 'Yoghurt 500ml', category: 'Dairy', unit: 'cup', quantity: 18, reorderLevel: 10, costPrice: 78, sellingPrice: 105, supplierId: 'sup-003', updatedAt: offset(0) },
  { id: 'prd-011', sku: 'BEV-006', name: 'Mineral Water 1L', category: 'Beverages', unit: 'bottle', quantity: 3, reorderLevel: 12, costPrice: 42, sellingPrice: 60, supplierId: 'sup-005', updatedAt: offset(-1) },
  { id: 'prd-012', sku: 'HOM-020', name: 'Laundry Powder 1kg', category: 'Home care', unit: 'packet', quantity: 24, reorderLevel: 12, costPrice: 165, sellingPrice: 205, supplierId: 'sup-004', updatedAt: offset(-1) },
];

const makeInvoice = (
  id: string, number: string, customer: string, days: number,
  items: Array<[string, string, string, number, number, number]>, paid: number,
  channel: Invoice['channel'], source: Invoice['source'] = 'pos',
): Invoice => {
  const lines = items.map((item) => ({
    productId: item[0], name: item[1], sku: item[2], quantity: item[3],
    unitPrice: item[4], unitCost: item[5], lineTotal: item[3] * item[4],
  }));
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const date = offset(days);
  return {
    id, number, customer, phone: '', date, dueDate: offset(days + 7), lines,
    subtotal, discount: 0, total: subtotal, paid, channel,
    status: paid >= subtotal ? 'paid' : paid > 0 ? 'partial' : 'sent', source,
  };
};


function buildSeedJournal(
  invoices: Invoice[],
  payments: Payment[],
  expenses: Expense[],
  openingBalances: AppData['openingBalances'],
  openingPayables: number,
): JournalLine[] {
  const journal: JournalLine[] = [];
  let sequence = 1;
  const post = (date: string, debitAccount: string, creditAccount: string, amount: number, description: string, reference: string) => {
    if (amount <= 0) return;
    const journalId = 'seed-' + String(sequence++).padStart(4, '0');
    journal.push(
      { id: journalId + '-dr', journalId, date, account: debitAccount, debit: amount, credit: 0, description, reference },
      { id: journalId + '-cr', journalId, date, account: creditAccount, debit: 0, credit: amount, description, reference },
    );
  };


  const earliestInvoiceDate = invoices.map(invoice => invoice.date).sort()[0] ?? today();
  const openingDateValue = new Date(earliestInvoiceDate + 'T12:00:00');
  openingDateValue.setDate(openingDateValue.getDate() - 1);
  const openingDate = localDate(openingDateValue);
  post(openingDate, 'Cash on hand', 'Opening balance equity', openingBalances.cash, 'Opening balance · Cash on hand', 'OPEN-CASH');
  post(openingDate, 'M-Pesa clearing', 'Opening balance equity', openingBalances.mpesa, 'Opening balance · M-Pesa clearing', 'OPEN-MPESA');
  post(openingDate, 'Bank account', 'Opening balance equity', openingBalances.bank, 'Opening balance · Bank account', 'OPEN-BANK');
  post(openingDate, 'Inventory', 'Opening balance equity', openingBalances.inventory, 'Opening balance · Inventory', 'OPEN-STOCK');
  post(openingDate, 'Opening balance equity', 'Accounts payable', openingPayables, 'Opening supplier liabilities', 'OPEN-AP');

  for (const invoice of invoices) {
    post(invoice.date, 'Accounts receivable', 'Sales revenue', invoice.total, 'Invoice issued · ' + invoice.number, invoice.number);
    const cost = invoice.lines.reduce((total, line) => total + line.quantity * line.unitCost, 0);
    post(invoice.date, 'Cost of goods sold', 'Inventory', cost, 'Cost of sale · ' + invoice.number, invoice.number);
  }

  for (const payment of payments) {
    const debitAccount = payment.channel === 'mpesa'
      ? 'M-Pesa clearing'
      : payment.channel === 'cash'
        ? 'Cash on hand'
        : payment.channel === 'bank'
          ? 'Bank account'
          : 'Card clearing';
    post(payment.createdAt.slice(0, 10), debitAccount, 'Accounts receivable', payment.amount, 'Customer payment · ' + payment.invoiceNumber, payment.reference);
  }

  for (const expense of expenses) {
    const debitAccount = expense.category === 'Rent'
      ? 'Rent expense'
      : expense.category === 'Utilities'
        ? 'Utilities expense'
        : expense.category === 'Staff costs'
          ? 'Staff expense'
          : expense.category === 'Transport'
            ? 'Transport expense'
            : 'Operating expenses';
    const creditAccount = expense.channel === 'cash'
      ? 'Cash on hand'
      : expense.channel === 'mpesa'
        ? 'M-Pesa clearing'
        : expense.channel === 'bank'
          ? 'Bank account'
          : 'Card clearing';
    post(expense.date, debitAccount, creditAccount, expense.amount, expense.description, expense.reference);
  }

  return journal;
}

const payments: Payment[] = [
      { id: 'pay-001', invoiceId: 'inv-1008', invoiceNumber: 'HS-1008', customer: 'Walk-in customer', phone: '0712 000 000', amount: 760, channel: 'mpesa', status: 'succeeded', reference: 'TJL8Q2M4P1', createdAt: timeAgo(18), confirmedAt: timeAgo(17), origin: 'manual' },
      { id: 'pay-002', invoiceId: 'inv-1007', invoiceNumber: 'HS-1007', customer: 'Njeri Wanjiku', phone: '0722 410 665', amount: 940, channel: 'cash', status: 'succeeded', reference: 'CASH-1007', createdAt: timeAgo(54), confirmedAt: timeAgo(54), origin: 'manual' },
      { id: 'pay-003', invoiceId: 'inv-1006', invoiceNumber: 'HS-1006', customer: 'Maua Café', phone: '0718 230 011', amount: 1_540, channel: 'mpesa', status: 'succeeded', reference: 'TJL7P9K2D6', createdAt: timeAgo(92), confirmedAt: timeAgo(91), origin: 'integration' },
      { id: 'pay-004', invoiceId: 'inv-1004', invoiceNumber: 'HS-1004', customer: 'Walk-in customer', phone: '0701 000 112', amount: 780, channel: 'mpesa', status: 'succeeded', reference: 'TJL4M8A0R3', createdAt: timeAgo(1_220), confirmedAt: timeAgo(1_219), origin: 'manual' },
      { id: 'pay-005', invoiceId: 'inv-1003', invoiceNumber: 'HS-1003', customer: 'Kamau Supplies', phone: '0703 250 980', amount: 500, channel: 'bank', status: 'succeeded', reference: 'BNK-48109', createdAt: timeAgo(1_660), confirmedAt: timeAgo(1_650), origin: 'manual' },
      { id: 'pay-006', invoiceId: 'inv-1002', invoiceNumber: 'HS-1002', customer: 'Wanjiku Stores', phone: '0790 335 821', amount: 2_220, channel: 'cash', status: 'succeeded', reference: 'CASH-1002', createdAt: timeAgo(2_340), confirmedAt: timeAgo(2_340), origin: 'manual' },
      { id: 'pay-007', invoiceId: 'inv-1001', invoiceNumber: 'HS-1001', customer: 'Walk-in customer', phone: '0712 000 000', amount: 1_860, channel: 'mpesa', status: 'succeeded', reference: 'TJL2B7M9Q4', createdAt: timeAgo(3_100), confirmedAt: timeAgo(3_098), origin: 'manual' },
];

export function makeDemoData(): AppData {
  const invoices: Invoice[] = [
    makeInvoice('inv-1008', 'HS-1008', 'Walk-in customer', 0, [
      ['prd-001', 'Pembe Maize Flour 2kg', 'GRC-001', 3, 160, 128],
      ['prd-004', 'Fresh Milk 500ml', 'DAI-002', 4, 70, 56],
    ], 760, 'mpesa'),
    makeInvoice('inv-1007', 'HS-1007', 'Njeri Wanjiku', 0, [
      ['prd-002', 'Cooking Oil 1L', 'DRY-014', 2, 295, 248],
      ['prd-003', 'Sugar 1kg', 'DRY-018', 2, 175, 142],
    ], 940, 'cash'),
    makeInvoice('inv-1006', 'HS-1006', 'Maua Café', 0, [
      ['prd-006', 'Sliced Bread 400g', 'BAK-003', 10, 70, 55],
      ['prd-007', 'Soda 500ml', 'BEV-022', 12, 70, 48],
    ], 1_540, 'mpesa', 'website'),
    makeInvoice('inv-1005', 'HS-1005', 'Otieno Retail', -1, [
      ['prd-009', 'Rice 2kg', 'GRC-008', 4, 340, 285],
      ['prd-001', 'Pembe Maize Flour 2kg', 'GRC-001', 6, 160, 128],
    ], 0, 'credit'),
    makeInvoice('inv-1004', 'HS-1004', 'Walk-in customer', -1, [
      ['prd-011', 'Mineral Water 1L', 'BEV-006', 6, 60, 42],
      ['prd-010', 'Yoghurt 500ml', 'DAI-009', 4, 105, 78],
    ], 780, 'mpesa'),
    makeInvoice('inv-1003', 'HS-1003', 'Kamau Supplies', -2, [
      ['prd-005', 'Dishwashing Liquid 750ml', 'HOM-011', 8, 145, 105],
      ['prd-008', 'Bar Soap 800g', 'HOM-016', 6, 150, 118],
    ], 500, 'bank', 'website'),
    makeInvoice('inv-1002', 'HS-1002', 'Wanjiku Stores', -3, [
      ['prd-012', 'Laundry Powder 1kg', 'HOM-020', 4, 205, 165],
      ['prd-003', 'Sugar 1kg', 'DRY-018', 8, 175, 142],
    ], 2_220, 'cash'),
    makeInvoice('inv-1001', 'HS-1001', 'Walk-in customer', -4, [
      ['prd-002', 'Cooking Oil 1L', 'DRY-014', 4, 295, 248],
      ['prd-009', 'Rice 2kg', 'GRC-008', 2, 340, 285],
    ], 1_860, 'mpesa'),
  ];

  const expenses: Expense[] = [
    { id: 'exp-01', date: today(), category: 'Transport', description: 'Supplier collection and delivery', amount: 1_200, channel: 'cash', reference: 'EXP-304' },
    { id: 'exp-02', date: offset(-1), category: 'Utilities', description: 'Electricity tokens', amount: 3_500, channel: 'mpesa', reference: 'EXP-303' },
    { id: 'exp-03', date: offset(-2), category: 'Rent', description: 'Monthly shop rent', amount: 18_000, channel: 'bank', reference: 'EXP-302' },
    { id: 'exp-04', date: offset(-3), category: 'Staff costs', description: 'Weekly wages', amount: 8_500, channel: 'bank', reference: 'EXP-301' },
  ];


  const suppliers: Supplier[] = [
      { id: 'sup-001', name: 'Meru Wholesale Distributors', phone: '+254 700 120 450', email: 'orders@meruwholesale.example', terms: '14 days', balance: 18_400 },
      { id: 'sup-002', name: 'Eastlands Oils & Foods', phone: '+254 711 445 201', email: 'sales@eastlandsoils.example', terms: '7 days', balance: 7_250 },
      { id: 'sup-003', name: 'Highland Fresh Limited', phone: '+254 722 560 840', email: 'dispatch@highlandfresh.example', terms: 'Cash on delivery', balance: 0 },
      { id: 'sup-004', name: 'Maua Homecare Supplies', phone: '+254 733 291 610', email: 'accounts@mauahomecare.example', terms: '30 days', balance: 12_600 },
      { id: 'sup-005', name: 'Ridgeway Beverages', phone: '+254 701 880 330', email: 'orders@ridgewaybev.example', terms: '7 days', balance: 3_600 },
    ];

  const currentInventoryValue = products.reduce((total, product) => total + product.quantity * product.costPrice, 0);
  const seededCostOfGoodsSold = invoices.reduce(
    (total, invoice) => total + invoice.lines.reduce((lineTotal, line) => lineTotal + line.quantity * line.unitCost, 0),
    0,
  );
  const openingBalances: AppData['openingBalances'] = {
    cash: 42_800,
    mpesa: 86_450,
    bank: 224_700,
    // Historical sales are already reflected in current quantities. Restore their cost
    // into the opening journal so the closing stock subledger ties to the general ledger.
    inventory: currentInventoryValue + seededCostOfGoodsSold,
  };
  const openingPayables = suppliers.reduce((total, supplier) => total + supplier.balance, 0);

  const teamMembers: TeamMember[] = [
    { id: 'team-001', name: 'Business owner', email: 'accounts@northstarmarket.example', role: 'Owner', status: 'active' },
    { id: 'team-002', name: 'Grace Njeri', email: 'grace@northstarmarket.example', role: 'Manager', status: 'active' },
    { id: 'team-003', name: 'Brian Mutua', email: 'brian@northstarmarket.example', role: 'Sales', status: 'active' },
    { id: 'team-004', name: 'Faith Wambui', email: 'faith@northstarmarket.example', role: 'Inventory', status: 'active' },
  ];

  return {
    profile: {
      name: 'Northstar Market', legalName: 'Northstar Retail Limited',
      owner: 'Business owner', email: 'accounts@northstarmarket.example',
      phone: '+254 712 000 123', location: 'Westlands, Nairobi',
      currency: 'KES', taxPin: 'P052XXXXXXA', industry: 'Retail · Mini mart',
    },
    products,
    invoices,
    payments,

    unmatchedReceipts: [
      { id: 'rcpt-001', reference: 'QAM3H8PL2', payer: 'Otieno Retail', phone: '0701 228 114', amount: 1_200, rail: 'Till / PayBill', receivedAt: timeAgo(35), source: 'statement' },
      { id: 'rcpt-002', reference: 'PCH-9841', payer: 'Unknown sender', phone: '0721 480 020', amount: 350, rail: 'Pochi la Biashara', receivedAt: timeAgo(72), source: 'manual' },
    ],
    expenses,
    cashMovements: [],
    suppliers,
    purchaseOrders: [
      {
        id: 'po-020', number: 'PO-020', supplierId: 'sup-001',
        supplierName: 'Meru Wholesale Distributors', createdAt: offset(-1),
        expectedAt: offset(1), status: 'sent', total: 48_000,
        lines: [
          { productId: 'prd-001', name: 'Pembe Maize Flour 2kg', quantity: 180, received: 0, unitCost: 128, lineTotal: 23_040 },
          { productId: 'prd-003', name: 'Sugar 1kg', quantity: 120, received: 0, unitCost: 142, lineTotal: 17_040 },
          { productId: 'prd-009', name: 'Rice 2kg', quantity: 24, received: 0, unitCost: 330, lineTotal: 7_920 },
        ],
      },
      {
        id: 'po-019', number: 'PO-019', supplierId: 'sup-004',
        supplierName: 'Maua Homecare Supplies', createdAt: offset(-4),
        expectedAt: offset(0), status: 'partially_received', total: 21_240,
        lines: [
          { productId: 'prd-005', name: 'Dishwashing Liquid 750ml', quantity: 48, received: 24, unitCost: 105, lineTotal: 5_040 },
          { productId: 'prd-008', name: 'Bar Soap 800g', quantity: 60, received: 0, unitCost: 118, lineTotal: 7_080 },
          { productId: 'prd-012', name: 'Laundry Powder 1kg', quantity: 48, received: 0, unitCost: 190, lineTotal: 9_120 },
        ],
      },
      {
        id: 'po-018', number: 'PO-018', supplierId: 'sup-003',
        supplierName: 'Highland Fresh Limited', createdAt: offset(-6),
        expectedAt: offset(-4), status: 'received', total: 13_440,
        lines: [
          { productId: 'prd-004', name: 'Fresh Milk 500ml', quantity: 120, received: 120, unitCost: 56, lineTotal: 6_720 },
          { productId: 'prd-006', name: 'Sliced Bread 400g', quantity: 120, received: 120, unitCost: 56, lineTotal: 6_720 },
        ],
      },
    ],
    journal: buildSeedJournal(invoices, payments, expenses, openingBalances, openingPayables),
    events: [
      { id: 'evt-01', time: timeAgo(17), type: 'payment.confirmed', source: 'M-Pesa collection', status: 'delivered', reference: 'TJL8Q2M4P1', detail: 'Payment matched to HS-1008' },
      { id: 'evt-02', time: timeAgo(34), type: 'invoice.paid', source: 'Hesabu checkout', status: 'delivered', reference: 'HS-1006', detail: 'Invoice status updated to paid' },
      { id: 'evt-03', time: timeAgo(58), type: 'inventory.low_stock', source: 'Inventory rules', status: 'pending', reference: 'HOM-011', detail: 'Dishwashing Liquid is below reorder level' },
      { id: 'evt-04', time: timeAgo(92), type: 'payment.confirmed', source: 'M-Pesa collection', status: 'delivered', reference: 'TJL7P9K2D6', detail: 'Payment matched to HS-1006' },
      { id: 'evt-05', time: timeAgo(160), type: 'purchase_order.sent', source: 'Procurement', status: 'delivered', reference: 'PO-020', detail: 'Purchase order sent to supplier' },
    ],
    openingBalances,
    teamMembers,
    nextInvoice: 1009,
    nextPurchaseOrder: 21,
  };
}

export const STORAGE_KEY = 'hesabu:platform:v3';

export function readWorkspace(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppData>;
      if (parsed.profile && Array.isArray(parsed.products) && Array.isArray(parsed.invoices)) {
        const demo = makeDemoData();
        const savedProducts = (parsed.products ?? demo.products).filter(saved => !(saved.id === 'prd-013' && saved.sku === 'BEV-6PK'));
        const savedWorkspace = Object.fromEntries(Object.entries(parsed).filter(([key]) => !['productionRecipes', 'productionRuns', 'nextProductionRun'].includes(key))) as Partial<AppData>;
        const products = [
          ...savedProducts,
          ...demo.products.filter(seed => !savedProducts.some(saved => saved.id === seed.id)),
        ];
        return {
          ...demo,
          ...savedWorkspace,
          products,
          unmatchedReceipts: parsed.unmatchedReceipts ?? demo.unmatchedReceipts,
          cashMovements: parsed.cashMovements ?? demo.cashMovements,
          teamMembers: parsed.teamMembers ?? demo.teamMembers,
        };
      }
    }
  } catch {
    // Keep the demo usable when browser storage is unavailable or corrupted.
  }
  return makeDemoData();
}

export function saveWorkspace(data: AppData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // The current session remains usable when browser storage is unavailable.
  }
}
