import { t } from './i18n';

// Rôles internes (§M12), appliqués par l'API ; l'interface ne fait que masquer
// ce qu'un rôle ne peut pas faire. Support = lecture et gestes de dépannage
// (relance opérateur, renvoi de webhook, note) ; sécurité à la Conformité.
export const ROLE_LABEL = { SUPPORT: t('role.SUPPORT'), COMPLIANCE: t('role.COMPLIANCE'), SUPER_ADMIN: t('role.SUPER_ADMIN') };

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
  'staff.manage': ['SUPER_ADMIN'],
  'support.view': ['SUPPORT', 'COMPLIANCE', 'SUPER_ADMIN'],
  'support.act': ['SUPPORT', 'COMPLIANCE', 'SUPER_ADMIN'],
  'support.secure': ['COMPLIANCE', 'SUPER_ADMIN'],
  'system.view': ['SUPPORT', 'COMPLIANCE', 'SUPER_ADMIN'],
  'system.manage': ['SUPER_ADMIN'],
  'audit.view': ['SUPPORT', 'COMPLIANCE', 'SUPER_ADMIN'],
};

export function can(role, capability) {
  return (MATRIX[capability] || []).includes(role);
}
