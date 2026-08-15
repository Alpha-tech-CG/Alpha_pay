import { MemberEventsService } from './member-events.service';

type TxMock = { merchantMemberEvent: { create: jest.Mock } };
type PrismaMock = { merchantMemberEvent: { findMany: jest.Mock } };

function makeService() {
  const prisma: PrismaMock = { merchantMemberEvent: { findMany: jest.fn() } };
  const service = new MemberEventsService(prisma as never);
  return { service, prisma };
}

describe('MemberEventsService (journal audit append-only)', () => {
  it('record() écrit via le client de transaction fourni (jamais via this.prisma)', async () => {
    const { service } = makeService();
    const tx: TxMock = { merchantMemberEvent: { create: jest.fn().mockResolvedValue({ id: 'e1' }) } };

    await service.record(tx as never, {
      merchantId: 'm1',
      memberId: 'mem1',
      actorUserId: 'u1',
      eventType: 'ROLE_CHANGED',
      metadata: { from: 'MEMBER', to: 'MANAGER' },
    });

    expect(tx.merchantMemberEvent.create).toHaveBeenCalledWith({
      data: {
        merchantId: 'm1',
        memberId: 'mem1',
        actorUserId: 'u1',
        eventType: 'ROLE_CHANGED',
        metadata: { from: 'MEMBER', to: 'MANAGER' },
      },
    });
  });

  it('record() normalise memberId/actorUserId/metadata absents', async () => {
    const { service } = makeService();
    const tx: TxMock = { merchantMemberEvent: { create: jest.fn().mockResolvedValue({ id: 'e1' }) } };

    await service.record(tx as never, { merchantId: 'm1', eventType: 'INVITATION_SENT' });

    expect(tx.merchantMemberEvent.create).toHaveBeenCalledWith({
      data: { merchantId: 'm1', memberId: null, actorUserId: null, eventType: 'INVITATION_SENT', metadata: {} },
    });
  });

  it('list() délègue à prisma.merchantMemberEvent.findMany triés par date décroissante', async () => {
    const { service, prisma } = makeService();
    prisma.merchantMemberEvent.findMany.mockResolvedValue([{ id: 'e1' }]);

    const result = await service.list('m1');

    expect(prisma.merchantMemberEvent.findMany).toHaveBeenCalledWith({
      where: { merchantId: 'm1' },
      orderBy: { createdAt: 'desc' },
    });
    expect(result).toEqual([{ id: 'e1' }]);
  });
});
