import {
  ConcurrentModificationError,
  IllegalTransitionError,
  isTransitionAllowed,
  transitionStatus,
} from './transaction-state';

describe('isTransitionAllowed (ALP-167)', () => {
  it('autorise PENDING -> état terminal', () => {
    expect(isTransitionAllowed('PENDING', 'SUCCESSFUL')).toBe(true);
    expect(isTransitionAllowed('PENDING', 'FAILED')).toBe(true);
    expect(isTransitionAllowed('PENDING', 'REJECTED')).toBe(true);
  });
  it('refuse toute sortie d\'un état terminal (ex. SUCCESSFUL -> PENDING)', () => {
    expect(isTransitionAllowed('SUCCESSFUL', 'PENDING')).toBe(false);
    expect(isTransitionAllowed('FAILED', 'SUCCESSFUL')).toBe(false);
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
    const res = await transitionStatus(p as any, 'tx1', 'SUCCESSFUL', { reason: 'webhook MTN' });
    expect(res).toEqual({ changed: true, status: 'SUCCESSFUL' });
    expect(p.audit.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ fromStatus: 'PENDING', toStatus: 'SUCCESSFUL' }) }),
    );
  });

  it('no-op idempotent si déjà dans l\'état cible', async () => {
    const p = fakePrisma({ status: 'SUCCESSFUL', version: 1 });
    const res = await transitionStatus(p as any, 'tx1', 'SUCCESSFUL');
    expect(res).toEqual({ changed: false, status: 'SUCCESSFUL' });
    expect(p.txUpdate).not.toHaveBeenCalled();
  });

  it('rejette une transition illégale (SUCCESSFUL -> PENDING)', async () => {
    const p = fakePrisma({ status: 'SUCCESSFUL', version: 1 });
    await expect(transitionStatus(p as any, 'tx1', 'PENDING')).rejects.toBeInstanceOf(IllegalTransitionError);
    expect(p.txUpdate).not.toHaveBeenCalled();
  });

  it('lève ConcurrentModificationError si le CAS de version échoue', async () => {
    const p = fakePrisma({ status: 'PENDING', version: 0 }, 0); // updateMany count 0
    await expect(transitionStatus(p as any, 'tx1', 'SUCCESSFUL')).rejects.toBeInstanceOf(ConcurrentModificationError);
  });
});
