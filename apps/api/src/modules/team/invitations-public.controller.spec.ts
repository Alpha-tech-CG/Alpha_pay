import { InvitationsPublicController } from './invitations-public.controller';
import { InvitationsService } from './services/invitations.service';

function makeController() {
  const invitations = {
    preview: jest.fn().mockResolvedValue({}),
    accept: jest.fn().mockResolvedValue({}),
  };
  const controller = new InvitationsPublicController(invitations as unknown as InvitationsService);
  return { controller, invitations };
}

describe('InvitationsPublicController (routes /invite — pas de RequireMemberGuard)', () => {
  it('preview() délègue au token, sans authentification', async () => {
    const { controller, invitations } = makeController();
    await controller.preview('tok123');
    expect(invitations.preview).toHaveBeenCalledWith('tok123');
  });

  it('accept() transmet le token du DTO et req.appUser (posé par ClerkSessionGuard)', async () => {
    const { controller, invitations } = makeController();
    const req = { appUser: { id: 'u1', clerkUserId: 'c1', email: 'jean@example.com' } };

    await controller.accept({ token: 'tok123' }, req as any);

    expect(invitations.accept).toHaveBeenCalledWith('tok123', req.appUser);
  });
});
