import { MyMerchantsController } from './my-merchants.controller';
import { MembersService } from './services/members.service';

describe('MyMerchantsController', () => {
  it('list() résout depuis req.appUser.id (posé par ClerkSessionGuard), pas de merchantId requis', async () => {
    const members = { listForUser: jest.fn().mockResolvedValue([{ merchantId: 'm1', merchantName: 'Boutique', role: 'OWNER' }]) };
    const controller = new MyMerchantsController(members as unknown as MembersService);
    const req = { appUser: { id: 'u1' } };

    const result = await controller.list(req as any);

    expect(members.listForUser).toHaveBeenCalledWith('u1');
    expect(result).toEqual([{ merchantId: 'm1', merchantName: 'Boutique', role: 'OWNER' }]);
  });
});
