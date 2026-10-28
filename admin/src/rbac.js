// Rôles internes (§M12), appliqués par l'API ; l'interface ne fait que masquer
// ce qu'un rôle ne peut pas faire. Support = lecture seule.
export const ROLE_LABEL = { SUPPORT: 'Support', COMPLIANCE: 'Conformité', SUPER_ADMIN: 'Super-administrateur' };

const MATRIX = {
  'merchants.view': ['SUPPORT', 'COMPLIANCE', 'SUPER_ADMIN'],
  'merchants.suspend': ['COMPLIANCE', 'SUPER_ADMIN'],
  'merchants.billing': ['SUPER_ADMIN'],
  'kyc.view': ['SUPPORT', 'COMPLIANCE', 'SUPER_ADMIN'],
  'kyc.decide': ['COMPLIANCE', 'SUPER_ADMIN'],
  'billing.view': ['SUPPORT', 'COMPLIANCE', 'SUPER_ADMIN'],
  'billing.manage': ['SUPER_ADMIN'],
  'supervision.view': ['SUPPORT', 'COMPLIANCE', 'SUPER_ADMIN'],
  'reconciliation.view': ['SUPPORT', 'COMPLIANCE', 'SUPER_ADMIN'],
};

export function can(role, capability) {
  return (MATRIX[capability] || []).includes(role);
}
