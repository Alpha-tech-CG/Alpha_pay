/**
 * Rôles marchand du cahier des charges (§M1). Le rôle est stocké sur
 * merchant_members.role ; toute l'autorisation passe par `can()`,
 * `canActOn()` et `canAssignRole()`, vérifiés CÔTÉ SERVEUR par les gardes.
 *
 * | Rôle           | Peut                                                              |
 * |----------------|-------------------------------------------------------------------|
 * | Propriétaire   | Tout, y compris facturation, connexion opérateurs, suppression   |
 * | Administrateur | Tout sauf facturation et suppression du compte                   |
 * | Comptable      | Lire transactions, rapprochement, exports, factures              |
 * | Caissier       | Encaisser, voir uniquement les paiements de sa caisse, Vérif     |
 * | Développeur    | Clés API, webhooks, journaux d'API                                |
 */

export type MemberRole = 'OWNER' | 'ADMIN' | 'ACCOUNTANT' | 'CASHIER' | 'DEVELOPER';

export const MEMBER_ROLES: readonly MemberRole[] = ['OWNER', 'ADMIN', 'ACCOUNTANT', 'CASHIER', 'DEVELOPER'];

export type MemberAction =
  | 'team:view'
  | 'team:invite'
  | 'team:change_role'
  | 'team:suspend'
  | 'team:remove'
  | 'team:audit'
  | 'ownership:transfer'
  | 'account:delete'
  | 'billing:manage'
  | 'providers:manage'
  | 'kyb:manage'
  | 'stores:manage'
  | 'payments:view' // tous les paiements du marchand
  | 'payments:view_own_till' // seulement ceux de ses caisses
  | 'payments:collect'
  | 'cash:declare'
  | 'paylinks:write'
  | 'reconciliation:view'
  | 'reconciliation:write'
  | 'exports:create'
  | 'invoices:view'
  | 'invoices:write'
  | 'school:manage'
  | 'verif:receive'
  | 'apikeys:write'
  | 'webhooks:write'
  | 'apilogs:view';

const OWNER_ADMIN: readonly MemberRole[] = ['OWNER', 'ADMIN'];

/** Matrice de capacités : rôles autorisés par action. */
const MATRIX: Record<MemberAction, readonly MemberRole[]> = {
  'team:view': OWNER_ADMIN,
  'team:invite': OWNER_ADMIN,
  'team:change_role': OWNER_ADMIN,
  'team:suspend': OWNER_ADMIN,
  'team:remove': OWNER_ADMIN,
  'team:audit': OWNER_ADMIN,
  'ownership:transfer': ['OWNER'],
  'account:delete': ['OWNER'],
  'billing:manage': ['OWNER'],
  'providers:manage': OWNER_ADMIN,
  'kyb:manage': OWNER_ADMIN,
  'stores:manage': OWNER_ADMIN,
  'payments:view': ['OWNER', 'ADMIN', 'ACCOUNTANT'],
  'payments:view_own_till': ['CASHIER'],
  'payments:collect': ['OWNER', 'ADMIN', 'CASHIER'],
  'cash:declare': ['OWNER', 'ADMIN', 'CASHIER'],
  'paylinks:write': OWNER_ADMIN,
  'reconciliation:view': ['OWNER', 'ADMIN', 'ACCOUNTANT'],
  'reconciliation:write': ['OWNER', 'ADMIN', 'ACCOUNTANT'],
  'exports:create': ['OWNER', 'ADMIN', 'ACCOUNTANT'],
  'invoices:view': ['OWNER', 'ADMIN', 'ACCOUNTANT'],
  'invoices:write': OWNER_ADMIN,
  'school:manage': OWNER_ADMIN,
  'verif:receive': ['OWNER', 'CASHIER'],
  'apikeys:write': ['OWNER', 'ADMIN', 'DEVELOPER'],
  'webhooks:write': ['OWNER', 'ADMIN', 'DEVELOPER'],
  'apilogs:view': ['OWNER', 'ADMIN', 'DEVELOPER'],
};

/** Rang pour l'anti-escalade : propriétaire > administrateur > rôles métier. */
const RANK: Record<MemberRole, number> = { OWNER: 3, ADMIN: 2, ACCOUNTANT: 1, CASHIER: 1, DEVELOPER: 1 };

export function rank(role: MemberRole): number {
  return RANK[role];
}

/** Le rôle a-t-il la capacité pour cette action ? */
export function can(role: MemberRole, action: MemberAction): boolean {
  return (MATRIX[action] ?? []).includes(role);
}

/**
 * L'acteur peut-il cibler un membre de rôle `targetRole` ?
 * Anti-escalade : seulement un rôle STRICTEMENT inférieur au sien
 * (un administrateur ne touche ni le propriétaire ni un autre administrateur).
 */
export function canActOn(actorRole: MemberRole, targetRole: MemberRole): boolean {
  return rank(actorRole) > rank(targetRole);
}

/**
 * L'acteur peut-il attribuer le rôle `newRole` ? Jamais un rôle >= au sien ;
 * le rôle de propriétaire ne s'obtient que par transfert de propriété.
 */
export function canAssignRole(actorRole: MemberRole, newRole: MemberRole): boolean {
  if (newRole === 'OWNER') return false;
  return rank(newRole) < rank(actorRole);
}
