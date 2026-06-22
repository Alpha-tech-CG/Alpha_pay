import { BadRequestException } from '@nestjs/common';
import { KycService } from './kyc.service';

function fakePrisma(opts: { caseRow?: any; merchantName?: string } = {}) {
  const state = { case: opts.caseRow ?? null as any, merchantActive: null as any };
  const prisma: any = {
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
    $transaction: jest.fn(async (operations: Promise<any>[]) => Promise.all(operations)),
  };
  return { prisma, state };
}

const FULL_DOCS = ['ID_FRONT', 'ID_BACK', 'RCCM', 'NIU', 'STATUTES', 'PROOF_OF_ADDRESS']
  .map((type) => ({ type, s3Key: `merchants/m1/cases/c1/${type}/doc.pdf` }));

function dependencies(screening = { hit: false, lists: [] as string[] }) {
  const providers = {
    screenSanctions: jest.fn().mockResolvedValue(screening),
    startSmileVerification: jest.fn().mockResolvedValue({ jobId: 'smile-1' }),
    // Résultat autoritatif ré-interrogé (le webhook n'est qu'un déclencheur).
    getJobStatus: jest.fn().mockResolvedValue({ jobId: 'smile-1', score: 95, documentVerified: true, biometricVerified: true }),
  };
  const storage = { verifyUploadedDocument: jest.fn().mockResolvedValue(undefined), createUploadUrl: jest.fn() };
  return { providers, storage };
}

describe('KycService (ALP-142)', () => {
  it('attend le webhook Smile puis auto-approuve un résultat fort et active le marchand', async () => {
    const { prisma, state } = fakePrisma({ caseRow: { id: 'c1', merchantId: 'm1', status: 'NOT_STARTED', screeningHit: false, documents: FULL_DOCS } });
    const { providers, storage } = dependencies();
    const svc = new KycService(prisma, providers as any, storage as any);
    const submitted = await svc.submit('m1');
    expect(submitted.status).toBe('IN_REVIEW');
    expect(state.case.smileJobId).toBe('smile-1');
    const approved = await svc.handleSmileCallback({ jobId: 'smile-1', score: 95, documentVerified: true, biometricVerified: true });
    expect(approved.status).toBe('APPROVED');
    expect(state.merchantActive).toBe(true);
    expect(approved.reKycDueAt).toBeTruthy();
  });

  it('refuse la soumission si un des six documents requis manque', async () => {
    const { prisma } = fakePrisma({ caseRow: { id: 'c1', merchantId: 'm1', status: 'NOT_STARTED', documents: [{ type: 'ID_FRONT' }] } });
    const { providers, storage } = dependencies();
    const svc = new KycService(prisma, providers as any, storage as any);
    await expect(svc.submit('m1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('route un hit sanctions en revue manuelle sans lancer Smile', async () => {
    const { prisma, state } = fakePrisma({ caseRow: { id: 'c1', merchantId: 'm1', status: 'NOT_STARTED', documents: FULL_DOCS } });
    const { providers, storage } = dependencies({ hit: true, lists: ['OFAC'] });
    const svc = new KycService(prisma, providers as any, storage as any);
    const result = await svc.submit('m1');
    expect(result.status).toBe('IN_REVIEW');
    expect(state.merchantActive).not.toBe(true);
    expect(providers.startSmileVerification).not.toHaveBeenCalled();
  });

  it('décision manuelle REJECTED désactive le marchand', async () => {
    const { prisma, state } = fakePrisma({ caseRow: { id: 'c1', merchantId: 'm1', status: 'IN_REVIEW' } });
    const { providers, storage } = dependencies();
    const svc = new KycService(prisma, providers as any, storage as any);
    const result = await svc.decide('c1', 'REJECTED', 'officer-1', 'doc illisible');
    expect(result.status).toBe('REJECTED');
    expect(state.merchantActive).toBe(false);
  });

  it('rejette une clé S3 qui ne correspond pas au dossier marchand', async () => {
    const { prisma } = fakePrisma({ caseRow: { id: 'c1', merchantId: 'm1', status: 'NOT_STARTED' } });
    const { providers, storage } = dependencies();
    storage.verifyUploadedDocument.mockRejectedValue(new Error('invalid'));
    const svc = new KycService(prisma, providers as any, storage as any);
    await expect(svc.addDocument('m1', 'ID_FRONT', 'merchants/other/doc.pdf')).rejects.toThrow('invalid');
  });
});
