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
