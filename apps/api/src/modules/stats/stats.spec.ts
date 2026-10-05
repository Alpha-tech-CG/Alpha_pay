import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { ScopesGuard } from '../../common/guards/scopes.guard';
import { SCOPES_KEY } from '../../common/decorators/scopes.decorator';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

describe('Stats (isolation multi-tenant)', () => {
  // Régression sécurité : /stats était public et renvoyait les volumes et les
  // dernières transactions de TOUS les marchands.
  it('exige une clé API et le scope payments:read sur GET /stats', () => {
    const handler = StatsController.prototype.getStats;
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([ApiKeyGuard, ScopesGuard]);
    expect(Reflect.getMetadata(SCOPES_KEY, handler)).toEqual(['payments:read']);
  });

  it('laisse /health public (healthcheck)', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, StatsController.prototype.health)).toBeUndefined();
    expect(Reflect.getMetadata(GUARDS_METADATA, StatsController)).toBeUndefined();
  });

  it('prend le marchand depuis la clé API authentifiée', async () => {
    const service = { getStats: jest.fn().mockResolvedValue('ok') };
    const controller = new StatsController(service as unknown as StatsService);
    await controller.getStats({ merchant: { id: 'm-1' } });
    expect(service.getStats).toHaveBeenCalledWith('m-1');
  });

  it('filtre chaque requête sur le marchand et ne fuit pas les champs chiffrés', async () => {
    const prisma = {
      transaction: {
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 't-1',
            status: 'SUCCESSFUL',
            amount: 10000n,
            payerPhoneEnc: 'enc',
            payerPhoneHash: 'hash',
            payerPhoneMask: '+242 06 *** **56',
            merchant: { name: 'Alpha-Educ' },
          },
        ]),
      },
    };
    const service = new StatsService(prisma as any);

    const stats = await service.getStats('m-1');

    for (const call of [...prisma.transaction.groupBy.mock.calls, ...prisma.transaction.findMany.mock.calls]) {
      expect(call[0].where).toMatchObject({ merchantId: 'm-1' });
    }
    expect(stats.recent[0]).not.toHaveProperty('payerPhoneEnc');
    expect(stats.recent[0]).not.toHaveProperty('payerPhoneHash');
    expect(stats.recent[0].payerPhone).toBe('+242 06 *** **56');
  });
});
