// RBAC back-office (ALP-144). Le rôle vient de Clerk (publicMetadata.role).
// Rôles : support, compliance, finance, engineering, admin.

export const ROLES = ['support', 'compliance', 'finance', 'engineering', 'admin'];

// Permissions par capacité -> rôles autorisés. `admin` a tout.
const MATRIX = {
  'search.view': ['support', 'compliance', 'finance', 'engineering', 'admin'],
  'kyc.view': ['compliance', 'admin'],
  'kyc.decide': ['compliance', 'admin'],
  'wallet.view': ['support', 'compliance', 'admin'],
  'wallet.block': ['compliance', 'admin'],
  'settlement.view': ['finance', 'admin'],
  'settlement.validate': ['finance', 'admin'],
  'reconciliation.view': ['finance', 'compliance', 'admin'],
  'audit.view': ['admin', 'engineering'],
};

export function roleOf(user) {
  return user?.publicMetadata?.role || 'support';
}

export function can(role, capability) {
  if (role === 'admin') return true;
  return (MATRIX[capability] || []).includes(role);
}
