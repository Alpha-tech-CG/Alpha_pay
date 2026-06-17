import { BadRequestException } from '@nestjs/common';
import { KycService } from './kyc.service';

function fakePrisma(opts: { caseRow?: any; merchantName?: string } = {}) {
  const state = { case: opts.caseRow ?? null as any, merchantActive: null as any };
  const prisma = {
    kycCase: {
      findUnique: jest.fn(async () => state.case),
      create: jest.fn(async ({ data }: any) => {
        state.case = { id: 'c1', merchantId: data.merchantId, status: data.status, documents: [], events: [] };
        return state.case;
      }),
      update: jest.fn(async ({ data }: any) => {
        state.case = { ...state.case, ...data };
        return state.case;
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    kycDocument: { upsert: jest.fn().mockResolvedValue({}) },
    kycEvent: { create: jest.fn().mockResolvedValue({}) },
    merchant: {
      findUnique: jest.fn().mockResolvedValue({ name: opts.merchantName ?? 'Groupe Alpha' }),
      update: jest.fn(async ({ data }: any) => { state.merchantActive = data.isActive; return {}; }),
    },
  };
  return { prisma, state };
}

const FULL_DOCS = [{ type: 'ID_FRONT' }, { type: 'RCCM' }, { type: 'NIU' }];

describe('KycService (ALP-142)', () => {
  it('auto-approuve si score Smile élevé + screening clean, et active le marchand', async () => {
    const { prisma, state } = fakePrisma({ caseRow: { id: 'c1', merchantId: 'm1', status: 'SUBMITTED', documents: FULL_DOCS } });
    const svc = new KycService(prisma as any);
    const res = await svc.submit('m1');
    expect(res.status).toBe('APPROVED');
    expect(state.merchantActive).toBe(true);
    expect(res.reKycDueAt).toBeTruthy();
  });

  it('refuse la soumission si documents requis manquants', async () => {
    const { prisma } = fakePrisma({ caseRow: { id: 'c1', merchantId: 'm1', status: 'NOT_STARTED', documents: [{ type: 'ID_FRONT' }] } });
    const svc = new KycService(prisma as any);
    await expect(svc.submit('m1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('route en revue manuelle si hit sanctions (jamais auto-approuvé)', async () => {
    const { prisma, state } = fakePrisma({ caseRow: { id: 'c1', merchantId: 'm1', status: 'SUBMITTED', documents: FULL_DOCS }, merchantName: 'Viktor Bout' });
    const svc = new KycService(prisma as any);
    const res = await svc.submit('m1');
    expect(res.status).toBe('IN_REVIEW');
    expect(state.merchantActive).not.toBe(true);
  });

  it('décision manuelle REJECTED désactive le marchand', async () => {
    const { prisma, state } = fakePrisma({ caseRow: { id: 'c1', merchantId: 'm1', status: 'IN_REVIEW' } });
    const svc = new KycService(prisma as any);
    const res = await svc.decide('c1', 'REJECTED', 'officer-1', 'doc illisible');
    expect(res.status).toBe('REJECTED');
    expect(state.merchantActive).toBe(false);
  });

  it('décision manuelle APPROVED active le marchand', async () => {
    const { prisma, state } = fakePrisma({ caseRow: { id: 'c1', merchantId: 'm1', status: 'IN_REVIEW' } });
    const svc = new KycService(prisma as any);
    const res = await svc.decide('c1', 'APPROVED', 'officer-1');
    expect(res.status).toBe('APPROVED');
    expect(state.merchantActive).toBe(true);
  });
});
