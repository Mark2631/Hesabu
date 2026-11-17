export type WorkspaceRole = 'owner' | 'manager' | 'sales' | 'inventory' | 'finance';

export interface WorkspaceReadPlan {
  sales: boolean;
  finance: boolean;
  inventory: boolean;
  purchasing: boolean;
  management: boolean;
}

const READ_PLANS: Record<WorkspaceRole, WorkspaceReadPlan> = {
  owner: { sales: true, finance: true, inventory: true, purchasing: true, management: true },
  manager: { sales: true, finance: true, inventory: true, purchasing: true, management: true },
  sales: { sales: true, finance: false, inventory: false, purchasing: false, management: false },
  inventory: { sales: false, finance: false, inventory: true, purchasing: true, management: false },
  finance: { sales: true, finance: true, inventory: false, purchasing: true, management: false },
};

/**
 * Return only the record families that a member's database role is allowed to read.
 * This mirrors the live RLS policies; it is a query planner, never an authorization check.
 * Postgres RLS and posting RPCs remain the security boundary.
 */
export function getWorkspaceReadPlan(role: string): WorkspaceReadPlan {
  const normalized = role.trim().toLowerCase() as WorkspaceRole;
  const plan = READ_PLANS[normalized];
  if (!plan) throw new Error('This Hesabu account does not have a valid business role.');
  return plan;
}
