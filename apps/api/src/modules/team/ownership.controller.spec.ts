import { OwnershipController } from './ownership.controller';
import { OwnershipService } from './services/ownership.service';

describe('OwnershipController', () => {
  it('transfer() transmet toUserId et l\'acteur au service', async () => {
    const ownership = { transfer: jest.fn().mockResolvedValue({}) };
    const controller = new OwnershipController(ownership as unknown as OwnershipService);
    const req = { appUser: { id: 'u1' }, membership: { merchantId: 'm1', role: 'OWNER' } };

    await controller.transfer('m1', { toUserId: 'u2' }, req as any);

    expect(ownership.transfer).toHaveBeenCalledWith('m1', 'u2', { userId: 'u1', role: 'OWNER' });
  });
});
