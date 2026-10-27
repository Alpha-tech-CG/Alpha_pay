import { can, canActOn, canAssignRole, MEMBER_ROLES, MemberAction, MemberRole } from './permissions';

/** Matrice attendue, reprise mot pour mot du cahier des charges (§M1). */
describe('rôles marchand (§M1)', () => {
  const allowed = (action: MemberAction) => MEMBER_ROLES.filter((r) => can(r, action));

  it('Propriétaire : tout, y compris facturation, opérateurs et suppression', () => {
    for (const action of ['billing:manage', 'account:delete', 'providers:manage', 'ownership:transfer', 'team:invite', 'apikeys:write'] as MemberAction[]) {
      expect(can('OWNER', action)).toBe(true);
    }
  });

  it('Administrateur : tout sauf facturation et suppression du compte', () => {
    expect(can('ADMIN', 'billing:manage')).toBe(false);
    expect(can('ADMIN', 'account:delete')).toBe(false);
    expect(can('ADMIN', 'ownership:transfer')).toBe(false);
    for (const action of ['providers:manage', 'team:invite', 'payments:view', 'invoices:write', 'apikeys:write', 'kyb:manage'] as MemberAction[]) {
      expect(can('ADMIN', action)).toBe(true);
    }
  });

  it('Comptable : lecture des transactions, rapprochement, exports, factures — rien d’autre', () => {
    const own = ['payments:view', 'reconciliation:view', 'reconciliation:write', 'exports:create', 'invoices:view'];
    for (const action of own as MemberAction[]) expect(can('ACCOUNTANT', action)).toBe(true);
    for (const action of ['team:view', 'apikeys:write', 'payments:collect', 'invoices:write', 'providers:manage'] as MemberAction[]) {
      expect(can('ACCOUNTANT', action)).toBe(false);
    }
  });

  it('Caissier : encaisse, ne voit que sa caisse, reçoit Vérif', () => {
    expect(can('CASHIER', 'payments:collect')).toBe(true);
    expect(can('CASHIER', 'cash:declare')).toBe(true);
    expect(can('CASHIER', 'verif:receive')).toBe(true);
    expect(can('CASHIER', 'payments:view_own_till')).toBe(true);
    expect(can('CASHIER', 'payments:view')).toBe(false);
    expect(can('CASHIER', 'exports:create')).toBe(false);
    expect(can('CASHIER', 'team:view')).toBe(false);
  });

  it('Développeur : clés API, webhooks, journaux d’API — pas les paiements', () => {
    expect(allowed('apikeys:write')).toEqual(['OWNER', 'ADMIN', 'DEVELOPER']);
    expect(allowed('webhooks:write')).toEqual(['OWNER', 'ADMIN', 'DEVELOPER']);
    expect(allowed('apilogs:view')).toEqual(['OWNER', 'ADMIN', 'DEVELOPER']);
    expect(can('DEVELOPER', 'payments:view')).toBe(false);
    expect(can('DEVELOPER', 'team:invite')).toBe(false);
  });

  it('seuls propriétaire et administrateur gèrent l’équipe', () => {
    expect(allowed('team:invite')).toEqual(['OWNER', 'ADMIN']);
    expect(allowed('team:remove')).toEqual(['OWNER', 'ADMIN']);
  });
});

describe('anti-escalade', () => {
  it.each<[MemberRole, MemberRole, boolean]>([
    ['OWNER', 'ADMIN', true],
    ['ADMIN', 'CASHIER', true],
    ['ADMIN', 'ADMIN', false],
    ['ADMIN', 'OWNER', false],
    ['CASHIER', 'ACCOUNTANT', false],
  ])('%s agit sur %s : %s', (actor, target, expected) => {
    expect(canActOn(actor, target)).toBe(expected);
  });

  it.each<[MemberRole, MemberRole, boolean]>([
    ['OWNER', 'ADMIN', true],
    ['OWNER', 'OWNER', false],
    ['ADMIN', 'ADMIN', false],
    ['ADMIN', 'DEVELOPER', true],
    ['ADMIN', 'CASHIER', true],
  ])('%s attribue %s : %s', (actor, role, expected) => {
    expect(canAssignRole(actor, role)).toBe(expected);
  });
});
