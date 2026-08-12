import { UsersService } from './users.service';
import { Market } from '../../common/types/market.enum';
import { AccountType } from '../../common/types/account-type.enum';

describe('UsersService.toProfile', () => {
  const encryption = { encrypt: jest.fn(), decrypt: jest.fn().mockReturnValue('Awa Kello') };
  const svc = new UsersService({} as never, encryption as never);

  it('decrypts the name and never exposes the national ID', () => {
    const profile = svc.toProfile({
      id: 'u1', phoneNumber: '+242060000123', market: Market.CONGO, accountType: AccountType.STANDARD,
      kycVerified: true, kycLevel: 2, encryptedFullName: 'cipher', encryptedNationalId: 'secret',
    } as never);
    expect(profile.fullName).toBe('Awa Kello');
    expect(JSON.stringify(profile)).not.toContain('secret');
    expect(JSON.stringify(profile)).not.toContain('encryptedNationalId');
  });

  it('returns null fullName when none stored', () => {
    const profile = svc.toProfile({ id: 'u1', phoneNumber: 'x', market: Market.LIBYA, accountType: AccountType.STANDARD, kycVerified: false, kycLevel: 0 } as never);
    expect(profile.fullName).toBeNull();
  });
});
