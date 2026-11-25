import { makeDemoData } from './data.ts';
import type { AppData } from './types';

function createCustomerLabeler() {
  const names = new Map<string, string>();
  let sequence = 0;
  return (name: string) => {
    if (!name || name.toLowerCase() === 'walk-in customer') return 'Walk-in customer';
    if (!names.has(name)) {
      sequence += 1;
      names.set(name, 'Sample customer ' + String.fromCharCode(64 + sequence));
    }
    return names.get(name)!;
  };
}

/**
 * Public, disposable data for the no-sign-up product tour.
 * No real customer, supplier, employee or contact information is included.
 */
export function makePublicDemoData(): AppData {
  const source = makeDemoData();
  const safeCustomer = createCustomerLabeler();
  const supplierLabels = new Map(source.suppliers.map((supplier, index) => [
    supplier.id,
    ['Sample wholesaler', 'Sample food supplier', 'Sample fresh-produce supplier', 'Sample homecare supplier', 'Sample beverages supplier'][index] ?? 'Sample supplier ' + (index + 1),
  ]));

  return {
    ...source,
    profile: {
      ...source.profile,
      name: 'Northstar Market · Sample',
      legalName: '',
      owner: 'Sample business owner',
      email: 'demo@example.invalid',
      phone: '',
      taxPin: '',
      location: 'Westlands, Nairobi',
    },
    invoices: source.invoices.map(invoice => ({
      ...invoice,
      customer: safeCustomer(invoice.customer),
      phone: '',
      lines: invoice.lines.map(line => ({ ...line })),
    })),
    payments: source.payments.map(payment => ({
      ...payment,
      customer: safeCustomer(payment.customer),
      phone: '',
      reference: 'DEMO-' + payment.id.toUpperCase(),
    })),
    unmatchedReceipts: source.unmatchedReceipts.map(receipt => ({
      ...receipt,
      payer: 'Sample customer',
      phone: '',
      reference: 'DEMO-' + receipt.id.toUpperCase(),
    })),
    suppliers: source.suppliers.map(supplier => ({
      ...supplier,
      name: supplierLabels.get(supplier.id) ?? 'Sample supplier',
      phone: '',
      email: '',
    })),
    purchaseOrders: source.purchaseOrders.map(order => ({
      ...order,
      supplierName: supplierLabels.get(order.supplierId) ?? 'Sample supplier',
      lines: order.lines.map(line => ({ ...line })),
    })),
    teamMembers: source.teamMembers.map(member => ({
      ...member,
      name: member.role === 'Owner' ? 'Sample owner' : 'Sample ' + member.role.toLowerCase() + ' teammate',
      email: member.role.toLowerCase() + '@demo.invalid',
    })),
    teamInvitations: [],
    events: source.events.map(event => ({ ...event })),
    expenses: source.expenses.map(expense => ({ ...expense })),
    cashMovements: (source.cashMovements ?? []).map(movement => ({ ...movement })),
    inventoryMovements: (source.inventoryMovements ?? []).map(movement => ({ ...movement })),
    journal: source.journal.map(line => ({ ...line })),
  };
}
