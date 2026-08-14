import { can, canActOn, canAssignRole, rank, type MemberRole } from './permissions';

describe('RBAC équipe marchand', () => {
  it('hiérarchie des rangs OWNER > ADMIN > MANAGER > MEMBER > VIEWER', () => {
    expect(rank('OWNER')).toBeGreaterThan(rank('ADMIN'));
    expect(rank('ADMIN')).toBeGreaterThan(rank('MANAGER'));
    expect(rank('MANAGER')).toBeGreaterThan(rank('MEMBER'));
    expect(rank('MEMBER')).toBeGreaterThan(rank('VIEWER'));
  });

  it('tous les rôles peuvent voir l\'équipe et les paiements', () => {
    (['OWNER', 'ADMIN', 'MANAGER', 'MEMBER', 'VIEWER'] as MemberRole[]).forEach((r) => {
      expect(can(r, 'team:view')).toBe(true);
      expect(can(r, 'payments:view')).toBe(true);
    });
  });

  it('seuls OWNER/ADMIN gèrent les membres (change_role/suspend/remove)', () => {
    (['team:change_role', 'team:suspend', 'team:remove'] as const).forEach((a) => {
      expect(can('OWNER', a)).toBe(true);
      expect(can('ADMIN', a)).toBe(true);
      expect(can('MANAGER', a)).toBe(false);
      expect(can('MEMBER', a)).toBe(false);
      expect(can('VIEWER', a)).toBe(false);
    });
  });

  it('MANAGER peut inviter (<= manager) mais pas un ADMIN', () => {
    expect(can('MANAGER', 'team:invite')).toBe(true);
    expect(can('MANAGER', 'team:invite_admin')).toBe(false);
    expect(can('ADMIN', 'team:invite_admin')).toBe(true);
    expect(can('MEMBER', 'team:invite')).toBe(false);
  });

  it('seul OWNER transfère la propriété et demande un payout est OWNER/ADMIN', () => {
    expect(can('OWNER', 'ownership:transfer')).toBe(true);
    expect(can('ADMIN', 'ownership:transfer')).toBe(false);
    expect(can('OWNER', 'payouts:request')).toBe(true);
    expect(can('ADMIN', 'payouts:request')).toBe(true);
    expect(can('MANAGER', 'payouts:request')).toBe(false);
  });

  it('MANAGER peut créer paylinks/apikeys/webhooks, MEMBER non', () => {
    (['paylinks:write', 'apikeys:write', 'webhooks:write'] as const).forEach((a) => {
      expect(can('MANAGER', a)).toBe(true);
      expect(can('MEMBER', a)).toBe(false);
      expect(can('VIEWER', a)).toBe(false);
    });
  });

  it('anti-escalade : on n\'agit que sur un rôle strictement inférieur', () => {
    expect(canActOn('ADMIN', 'MANAGER')).toBe(true);
    expect(canActOn('ADMIN', 'ADMIN')).toBe(false); // pas sur un pair
    expect(canActOn('ADMIN', 'OWNER')).toBe(false); // pas au-dessus
    expect(canActOn('OWNER', 'ADMIN')).toBe(true);
    expect(canActOn('MANAGER', 'MEMBER')).toBe(true);
  });

  it('attribution de rôle : jamais >= au sien, jamais OWNER (réservé transfert)', () => {
    expect(canAssignRole('ADMIN', 'MANAGER')).toBe(true);
    expect(canAssignRole('ADMIN', 'ADMIN')).toBe(false);
    expect(canAssignRole('ADMIN', 'OWNER')).toBe(false);
    expect(canAssignRole('OWNER', 'ADMIN')).toBe(true);
    expect(canAssignRole('OWNER', 'OWNER')).toBe(false); // transfert dédié
    expect(canAssignRole('MANAGER', 'ADMIN')).toBe(false);
  });
});
