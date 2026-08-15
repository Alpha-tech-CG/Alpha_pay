// Miroir CLIENT (UI only, jamais autoritatif) de
// apps/api/src/modules/team/permissions/permissions.ts. Sert uniquement à
// masquer/désactiver des actions dans l'interface — le backend revérifie
// tout côté serveur (RequireActionGuard + canActOn dans les services).
// Garder synchronisé si la matrice backend évolue.

export const ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'MEMBER', 'VIEWER']

const RANK = { VIEWER: 0, MEMBER: 1, MANAGER: 2, ADMIN: 3, OWNER: 4 }

const MATRIX = {
  'team:view': ROLES,
  'team:invite': ['OWNER', 'ADMIN', 'MANAGER'],
  'team:invite_admin': ['OWNER', 'ADMIN'],
  'team:change_role': ['OWNER', 'ADMIN'],
  'team:suspend': ['OWNER', 'ADMIN'],
  'team:remove': ['OWNER', 'ADMIN'],
  'team:audit': ['OWNER', 'ADMIN'],
  'ownership:transfer': ['OWNER'],
}

export function rank(role) {
  return RANK[role] ?? -1
}

export function can(role, action) {
  return MATRIX[action]?.includes(role) ?? false
}

// Anti-escalade : un acteur n'agit que sur un rôle strictement inférieur au sien.
export function canActOn(actorRole, targetRole) {
  return rank(actorRole) > rank(targetRole)
}

// Jamais >= au rang de l'acteur, jamais OWNER (réservé au transfert de propriété).
export function canAssignRole(actorRole, newRole) {
  if (newRole === 'OWNER') return false
  return rank(newRole) < rank(actorRole)
}

export function assignableRoles(actorRole) {
  return ROLES.filter((r) => canAssignRole(actorRole, r))
}

// Rôles invitables : règle DIFFÉRENTE de assignableRoles/canAssignRole.
// InvitationsService.create() n'exige que team:invite_admin pour ADMIN et
// team:invite pour le reste (donc un MANAGER peut inviter un autre MANAGER —
// pas de règle de rang strict comme pour le changement de rôle).
export function invitableRoles(actorRole) {
  const roles = []
  if (can(actorRole, 'team:invite_admin')) roles.push('ADMIN')
  if (can(actorRole, 'team:invite')) roles.push('MANAGER', 'MEMBER', 'VIEWER')
  return roles
}
