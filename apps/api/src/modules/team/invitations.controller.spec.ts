import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './services/invitations.service';

function makeController() {
  const invitations = {
    create: jest.fn().mockResolvedValue({}),
    list: jest.fn().mockResolvedValue([]),
    revoke: jest.fn().mockResolvedValue({}),
  };
  const controller = new InvitationsController(invitations as unknown as InvitationsService);
  return { controller, invitations };
}

const REQ = { appUser: { id: 'u1' }, membership: { merchantId: 'm1', role: 'MANAGER' } };

describe('InvitationsController (dashboard web)', () => {
  it("create() transmet l'acteur et le DTO au service", async () => {
    const { controller, invitations } = makeController();
    await controller.create('m1', { email: 'a@b.com', role: 'MEMBER' }, REQ as any);
    expect(invitations.create).toHaveBeenCalledWith(
      'm1',
      { email: 'a@b.com', role: 'MEMBER' },
      { userId: 'u1', role: 'MANAGER' },
    );
  });

  it('list() délègue à InvitationsService.list(merchantId)', async () => {
    const { controller, invitations } = makeController();
    await controller.list('m1');
    expect(invitations.list).toHaveBeenCalledWith('m1');
  });

  it("revoke() transmet l'acteur", async () => {
    const { controller, invitations } = makeController();
    await controller.revoke('m1', 'inv1', REQ as any);
    expect(invitations.revoke).toHaveBeenCalledWith('m1', 'inv1', { userId: 'u1', role: 'MANAGER' });
  });
});
