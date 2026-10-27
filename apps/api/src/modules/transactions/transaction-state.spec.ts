import {
  ConcurrentModificationError,
  IllegalTransitionError,
  isTransitionAllowed,
  transitionStatus,
} from './transaction-state';

describe('isTransitionAllowed (ALP-167)', () => {
  it('autorise PENDING -> état terminal', () => {
    expect(isTransitionAllowed('PENDING', 'SUCCEEDED')).toBe(true);
    expect(isTransitionAllowed('PENDING', 'FAILED')).toBe(true);
    expect(isTransitionAllowed('PENDING', 'CANCELED')).toBe(true);
  });
  it('refuse toute sortie d\'un état terminal (ex. SUCCEEDED -> PENDING)', () => {
    expect(isTransitionAllowed('SUCCEEDED', 'PENDING')).toBe(false);
    expect(isTransitionAllowed('FAILED', 'SUCCEEDED')).toBe(false);
  });
  it('refuse une transition vers le même état', () => {
    expect(isTransitionAllowed('PENDING', 'PENDING')).toBe(false);
  });
});

function fakePrisma(row: { status: string; version: number } | null, updateCount = 1) {
  const audit = { create: jest.fn().mockResolvedValue({}) };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue(row ? [{ id: 'tx1', ...row }] : []),
    transaction: { updateMany: jest.fn().mockResolvedValue({ count: updateCount }) },
    transactionAudit: audit,
  };
  return {
    audit,
    txUpdate: tx.transaction.updateMany,
    $transaction: jest.fn(async (cb: any) => cb(tx)),
  };
}

describe('transitionStatus (ALP-167)', () => {
  it('applique une transition valide + écrit un audit', async () => {
    const p = fakePrisma({ status: 'PENDING', version: 0 });
    const res = await transitionStatus(p as any, 'tx1', 'SUCCEEDED', { reason: 'webhook MTN' });
    expect(res).toEqual({ changed: true, status: 'SUCCEEDED' });
    expect(p.audit.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ fromStatus: 'PENDING', toStatus: 'SUCCEEDED' }) }),
    );
  });

  it('no-op idempotent si déjà dans l\'état cible', async () => {
    const p = fakePrisma({ status: 'SUCCEEDED', version: 1 });
    const res = await transitionStatus(p as any, 'tx1', 'SUCCEEDED');
    expect(res).toEqual({ changed: false, status: 'SUCCEEDED' });
    expect(p.txUpdate).not.toHaveBeenCalled();
  });

  it('rejette une transition illégale (SUCCEEDED -> PENDING)', async () => {
    const p = fakePrisma({ status: 'SUCCEEDED', version: 1 });
    await expect(transitionStatus(p as any, 'tx1', 'PENDING')).rejects.toBeInstanceOf(IllegalTransitionError);
    expect(p.txUpdate).not.toHaveBeenCalled();
  });

  it('lève ConcurrentModificationError si le CAS de version échoue', async () => {
    const p = fakePrisma({ status: 'PENDING', version: 0 }, 0); // updateMany count 0
    await expect(transitionStatus(p as any, 'tx1', 'SUCCEEDED')).rejects.toBeInstanceOf(ConcurrentModificationError);
  });
});
