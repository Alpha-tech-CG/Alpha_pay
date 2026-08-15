import { TeamController } from './team.controller';
import { MembersService } from './services/members.service';
import { MemberEventsService } from './services/member-events.service';

function makeController() {
  const members = {
    list: jest.fn().mockResolvedValue([]),
    changeRole: jest.fn().mockResolvedValue({}),
    suspend: jest.fn().mockResolvedValue({}),
    reactivate: jest.fn().mockResolvedValue({}),
    remove: jest.fn().mockResolvedValue({}),
  };
  const events = { list: jest.fn().mockResolvedValue([]) };
  const controller = new TeamController(members as unknown as MembersService, events as unknown as MemberEventsService);
  return { controller, members, events };
}

const REQ = { appUser: { id: 'u1' }, membership: { merchantId: 'm1', role: 'ADMIN' } };

describe('TeamController (mutations équipe, dashboard web)', () => {
  it('list() délègue à MembersService.list(merchantId)', async () => {
    const { controller, members } = makeController();
    await controller.list('m1');
    expect(members.list).toHaveBeenCalledWith('m1');
  });

  it('listEvents() délègue à MemberEventsService.list(merchantId)', async () => {
    const { controller, events } = makeController();
    await controller.listEvents('m1');
    expect(events.list).toHaveBeenCalledWith('m1');
  });

  it("changeRole() transmet l'acteur construit depuis req.appUser/req.membership", async () => {
    const { controller, members } = makeController();
    await controller.changeRole('m1', 'mem1', { role: 'MANAGER' }, REQ as any);
    expect(members.changeRole).toHaveBeenCalledWith('m1', 'mem1', 'MANAGER', { userId: 'u1', role: 'ADMIN' });
  });

  it('suspend()/reactivate()/remove() délèguent avec le bon acteur', async () => {
    const { controller, members } = makeController();
    await controller.suspend('m1', 'mem1', REQ as any);
    await controller.reactivate('m1', 'mem1', REQ as any);
    await controller.remove('m1', 'mem1', REQ as any);
    expect(members.suspend).toHaveBeenCalledWith('m1', 'mem1', { userId: 'u1', role: 'ADMIN' });
    expect(members.reactivate).toHaveBeenCalledWith('m1', 'mem1', { userId: 'u1', role: 'ADMIN' });
    expect(members.remove).toHaveBeenCalledWith('m1', 'mem1', { userId: 'u1', role: 'ADMIN' });
  });
});
