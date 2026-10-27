// Miroir CLIENT (affichage seulement, jamais autoritatif) de
// apps/api/src/modules/team/permissions/permissions.ts. Sert à masquer ou
// désactiver des actions dans l'interface ; le serveur revérifie tout.

export const ROLES = ['OWNER', 'ADMIN', 'ACCOUNTANT', 'CASHIER', 'DEVELOPER']

const RANK = { OWNER: 3, ADMIN: 2, ACCOUNTANT: 1, CASHIER: 1, DEVELOPER: 1 }

const MATRIX = {
  'team:view': ['OWNER', 'ADMIN'],
  'team:invite': ['OWNER', 'ADMIN'],
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

// Invitation : mêmes règles que l'attribution (le serveur applique canAssignRole).
export function invitableRoles(actorRole) {
  return can(actorRole, 'team:invite') ? assignableRoles(actorRole) : []
}
