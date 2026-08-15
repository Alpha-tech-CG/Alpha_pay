/**
 * RBAC équipe marchand — V1 « simple » : le rôle est stocké directement sur
 * merchant_members.role. Toute la logique d'autorisation passe par `can()` et
 * `canActOn()` ci-dessous. Pour migrer vers un RBAC table-driven (roles +
 * permissions en base), il suffira de remplacer l'implémentation de ces
 * fonctions SANS toucher les call sites (guards/services).
 */

export type MemberRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'MEMBER' | 'VIEWER';

export type MemberAction =
  | 'team:view'
  | 'team:invite'          // inviter un rôle <= MANAGER
  | 'team:invite_admin'    // inviter un ADMIN
  | 'team:change_role'
  | 'team:suspend'
  | 'team:remove'
  | 'team:audit'
  | 'ownership:transfer'
  | 'payments:view'
  | 'paylinks:write'
  | 'apikeys:write'
  | 'webhooks:write'
  | 'payouts:request';

/** Hiérarchie : un rôle de rang supérieur domine. */
const RANK: Record<MemberRole, number> = {
  VIEWER: 0,
  MEMBER: 1,
  MANAGER: 2,
  ADMIN: 3,
  OWNER: 4,
};

export function rank(role: MemberRole): number {
  return RANK[role];
}

/** Matrice de capacités : rôles autorisés par action (cf. design §9). */
const MATRIX: Record<MemberAction, readonly MemberRole[]> = {
  'team:view': ['OWNER', 'ADMIN', 'MANAGER', 'MEMBER', 'VIEWER'],
  'team:invite': ['OWNER', 'ADMIN', 'MANAGER'],
  'team:invite_admin': ['OWNER', 'ADMIN'],
  'team:change_role': ['OWNER', 'ADMIN'],
  'team:suspend': ['OWNER', 'ADMIN'],
  'team:remove': ['OWNER', 'ADMIN'],
  'team:audit': ['OWNER', 'ADMIN'],
  'ownership:transfer': ['OWNER'],
  'payments:view': ['OWNER', 'ADMIN', 'MANAGER', 'MEMBER', 'VIEWER'],
  'paylinks:write': ['OWNER', 'ADMIN', 'MANAGER'],
  'apikeys:write': ['OWNER', 'ADMIN', 'MANAGER'],
  'webhooks:write': ['OWNER', 'ADMIN', 'MANAGER'],
  'payouts:request': ['OWNER', 'ADMIN'],
};

/** Le rôle a-t-il la capacité pour cette action ? */
export function can(role: MemberRole, action: MemberAction): boolean {
  return MATRIX[action]?.includes(role) ?? false;
}

/**
 * L'acteur peut-il cibler un membre de rôle `targetRole` ?
 * Anti-escalade : on ne peut agir que sur un rôle STRICTEMENT inférieur au sien
 * (un ADMIN ne touche pas un OWNER ni un autre ADMIN).
 */
export function canActOn(actorRole: MemberRole, targetRole: MemberRole): boolean {
  return rank(actorRole) > rank(targetRole);
}

/**
 * L'acteur peut-il attribuer/assigner le rôle `newRole` ?
 * On ne peut pas attribuer un rôle >= au sien (pas d'auto-promotion ni d'escalade).
 * OWNER ne s'attribue pas via cette voie (passe par un transfert de propriété).
 */
export function canAssignRole(actorRole: MemberRole, newRole: MemberRole): boolean {
  if (newRole === 'OWNER') return false; // réservé au transfert de propriété
  return rank(newRole) < rank(actorRole);
}
