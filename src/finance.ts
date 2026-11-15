import type { JournalLine } from './types';

export interface JournalEntryInput {
  journalId: string;
  date: string;
  debitAccount: string;
  creditAccount: string;
  amount: number;
  description: string;
  reference: string;
}

export function buildJournalPair(input: JournalEntryInput): JournalLine[] {
  const amount = Math.round(input.amount * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return [];
  return [
    {
      id: input.journalId + '-D', journalId: input.journalId, date: input.date,
      account: input.debitAccount, debit: amount, credit: 0,
      description: input.description, reference: input.reference,
    },
    {
      id: input.journalId + '-C', journalId: input.journalId, date: input.date,
      account: input.creditAccount, debit: 0, credit: amount,
      description: input.description, reference: input.reference,
    },
  ];
}

export function isJournalBalanced(lines: JournalLine[], tolerance = 0.01): boolean {
  const totals = new Map<string, { debit: number; credit: number }>();
  for (const line of lines) {
    const total = totals.get(line.journalId) ?? { debit: 0, credit: 0 };
    total.debit += line.debit;
    total.credit += line.credit;
    totals.set(line.journalId, total);
  }
  return [...totals.values()].every(total => Math.abs(total.debit - total.credit) < tolerance);
}

export function weightedAverageUnitCost(
  currentQuantity: number,
  currentUnitCost: number,
  incomingQuantity: number,
  incomingUnitCost: number,
): number {
  const onHand = Math.max(0, currentQuantity);
  const incoming = Math.max(0, incomingQuantity);
  const totalQuantity = onHand + incoming;
  if (totalQuantity === 0 || incoming === 0) return Math.max(0, currentUnitCost);
  const totalCost = onHand * Math.max(0, currentUnitCost) + incoming * Math.max(0, incomingUnitCost);
  return Math.round((totalCost / totalQuantity) * 100) / 100;
}

export function outstandingBalance(total: number, paid: number): number {
  return Math.max(0, Math.round((total - paid) * 100) / 100);
}

export function allocateIncomingPayment(invoiceTotal: number, invoicePaid: number, receivedAmount: number) {
  const received = Math.max(0, Math.round(receivedAmount * 100) / 100);
  const outstanding = outstandingBalance(invoiceTotal, invoicePaid);
  const appliedAmount = Math.min(outstanding, received);
  const unappliedAmount = Math.max(0, Math.round((received - appliedAmount) * 100) / 100);
  const newPaid = Math.min(invoiceTotal, invoicePaid + appliedAmount);
  return { appliedAmount, unappliedAmount, newPaid, outstandingAfter: outstandingBalance(invoiceTotal, newPaid) };
}

export interface CostedInvoiceLine {
  quantity: number;
  unitPrice: number;
  unitCost: number;
}

export function calculateGrossProfit(lines: CostedInvoiceLine[], discount = 0): number {
  const revenueAfterDiscount = lines.reduce((total, line) => total + line.quantity * line.unitPrice, 0) - Math.max(0, discount);
  const costOfGoodsSold = lines.reduce((total, line) => total + line.quantity * line.unitCost, 0);
  return Math.round((revenueAfterDiscount - costOfGoodsSold) * 100) / 100;
}


export interface PurchaseReceiptItem {
  productId: string;
  quantity: number;
}

export function planPurchaseReceipt<T extends {
  productId: string;
  quantity: number;
  received: number;
  unitCost: number;
}>(purchaseLines: T[], receiptItems: PurchaseReceiptItem[]) {
  if (!receiptItems.length) {
    return { valid: false as const, reason: 'Enter at least one received quantity.', totalValue: 0, lines: purchaseLines, status: 'partially_received' as const };
  }

  const quantities = new Map<string, number>();
  for (const item of receiptItems) {
    if (!Number.isFinite(item.quantity) || item.quantity < 0) {
      return { valid: false as const, reason: 'Received quantities must be zero or greater.', totalValue: 0, lines: purchaseLines, status: 'partially_received' as const };
    }
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
  }

  const knownProducts = new Set(purchaseLines.map(line => line.productId));
  if ([...quantities.keys()].some(productId => !knownProducts.has(productId))) {
    return { valid: false as const, reason: 'The receipt contains a product that is not on this purchase order.', totalValue: 0, lines: purchaseLines, status: 'partially_received' as const };
  }

  let totalValue = 0;
  const lines = purchaseLines.map(line => {
    const quantity = quantities.get(line.productId) ?? 0;
    const remaining = Math.max(0, line.quantity - line.received);
    if (quantity > remaining) {
      totalValue = -1;
      return line;
    }
    totalValue += quantity * line.unitCost;
    return { ...line, received: line.received + quantity };
  });

  if (totalValue < 0) {
    return { valid: false as const, reason: 'A received quantity exceeds the remaining quantity on the purchase order.', totalValue: 0, lines: purchaseLines, status: 'partially_received' as const };
  }
  if (totalValue === 0) {
    return { valid: false as const, reason: 'Enter a quantity greater than zero.', totalValue: 0, lines: purchaseLines, status: 'partially_received' as const };
  }

  const completed = lines.every(line => line.received >= line.quantity);
  return {
    valid: true as const,
    totalValue: Math.round(totalValue * 100) / 100,
    lines,
    status: completed ? 'received' as const : 'partially_received' as const,
  };
}


export interface TrialBalanceRow {
  account: string;
  debitBalance: number;
  creditBalance: number;
}

export function buildTrialBalance(lines: JournalLine[]): TrialBalanceRow[] {
  const balances = new Map<string, { debit: number; credit: number }>();
  for (const line of lines) {
    const current = balances.get(line.account) ?? { debit: 0, credit: 0 };
    current.debit += line.debit;
    current.credit += line.credit;
    balances.set(line.account, current);
  }
  return [...balances.entries()]
    .map(([account, totals]) => ({
      account,
      debitBalance: Math.max(0, Math.round((totals.debit - totals.credit) * 100) / 100),
      creditBalance: Math.max(0, Math.round((totals.credit - totals.debit) * 100) / 100),
    }))
    .filter(row => row.debitBalance > 0 || row.creditBalance > 0)
    .sort((a, b) => a.account.localeCompare(b.account));
}

export function isTrialBalanceBalanced(rows: TrialBalanceRow[], tolerance = 0.01): boolean {
  const debits = rows.reduce((total, row) => total + row.debitBalance, 0);
  const credits = rows.reduce((total, row) => total + row.creditBalance, 0);
  return Math.abs(debits - credits) < tolerance;
}


export interface ProductionMaterialInput {
  productId: string;
  quantityPerUnit: number;
}
export interface ProductionProductInput {
  id: string;
  name: string;
  quantity: number;
  costPrice: number;
}
export function planProductionRun(
  recipe: { outputProductId: string; ingredients: ProductionMaterialInput[] },
  products: ProductionProductInput[],
  outputQuantity: number,
) {
  if (!Number.isFinite(outputQuantity) || outputQuantity <= 0) {
    return { valid: false as const, reason: 'Enter a finished quantity greater than zero.' };
  }
  if (!recipe.ingredients.length) {
    return { valid: false as const, reason: 'Add at least one material to this recipe.' };
  }
  const outputProduct = products.find(product => product.id === recipe.outputProductId);
  if (!outputProduct) {
    return { valid: false as const, reason: 'The finished product no longer exists in the catalogue.' };
  }
  const ids = new Set<string>();
  const materials: Array<{ productId: string; name: string; quantity: number; unitCost: number; totalCost: number }> = [];
  for (const ingredient of recipe.ingredients) {
    if (!Number.isFinite(ingredient.quantityPerUnit) || ingredient.quantityPerUnit <= 0) {
      return { valid: false as const, reason: 'Recipe quantities must be greater than zero.' };
    }
    if (ingredient.productId === recipe.outputProductId || ids.has(ingredient.productId)) {
      return { valid: false as const, reason: 'A recipe must use different, non-duplicated material items.' };
    }
    ids.add(ingredient.productId);
    const product = products.find(candidate => candidate.id === ingredient.productId);
    if (!product) {
      return { valid: false as const, reason: 'A material in this recipe is no longer in the catalogue.' };
    }
    const quantity = Math.round(ingredient.quantityPerUnit * outputQuantity * 100) / 100;
    if (product.quantity + 0.000001 < quantity) {
      return { valid: false as const, reason: 'Not enough ' + product.name + '. Required: ' + quantity + ', available: ' + product.quantity + '.' };
    }
    const totalCost = Math.round(quantity * product.costPrice * 100) / 100;
    materials.push({ productId: product.id, name: product.name, quantity, unitCost: product.costPrice, totalCost });
  }
  const materialCost = Math.round(materials.reduce((total, item) => total + item.totalCost, 0) * 100) / 100;
  const unitCost = Math.round((materialCost / outputQuantity) * 100) / 100;
  return { valid: true as const, outputProduct, outputQuantity, materials, materialCost, unitCost };
}
