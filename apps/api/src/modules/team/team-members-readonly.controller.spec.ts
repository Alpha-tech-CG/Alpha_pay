import { TeamMembersReadonlyController } from './team-members-readonly.controller';
import { MembersService } from './services/members.service';

describe('TeamMembersReadonlyController (mobile, ApiKeyGuard)', () => {
  it('list() résout le marchand depuis req.merchant (posé par ApiKeyGuard), jamais un paramètre client', async () => {
    const members = { list: jest.fn().mockResolvedValue([]) };
    const controller = new TeamMembersReadonlyController(members as unknown as MembersService);
    const req = { merchant: { id: 'm1', name: 'Ma Boutique' } };

    await controller.list(req as any);

    expect(members.list).toHaveBeenCalledWith('m1');
  });
});
