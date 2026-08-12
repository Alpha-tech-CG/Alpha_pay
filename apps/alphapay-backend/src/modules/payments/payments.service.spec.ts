import { ForbiddenException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { Operator } from '../../common/types/operator.enum';
import { TransactionStatus } from '../../common/types/transaction-status.enum';

describe('PaymentsService.initiateLocalPayment', () => {
  const dto = { amount: 5000, currency: 'XAF', operator: Operator.MTN, phoneNumber: '+242060000999' };

  const build = (kycLevel: number) => {
    const saved = { id: 'tx1', status: TransactionStatus.PENDING };
    const repo = { create: jest.fn((x) => x), save: jest.fn().mockResolvedValue(saved) };
    const users = { findById: jest.fn().mockResolvedValue({ id: 'u1', kycLevel }) };
    const connector = { requestToPay: jest.fn().mockResolvedValue({ referenceId: 'ref1', status: 'SUCCESSFUL' }) };
    const momo = { getConnector: jest.fn().mockReturnValue(connector) };
    const queue = { add: jest.fn() };
    const notify = { sendSms: jest.fn().mockResolvedValue({ id: 'x' }), sendEmail: jest.fn().mockResolvedValue({ id: 'x' }) };
    const svc = new PaymentsService(repo as never, users as never, {} as never, momo as never, {} as never, {} as never, queue as never, notify as never);
    return { svc, repo, connector, momo };
  };

  it('rejects when KYC level < 1', async () => {
    const { svc, connector } = build(0);
    await expect(svc.initiateLocalPayment('u1', dto)).rejects.toThrow(ForbiddenException);
    expect(connector.requestToPay).not.toHaveBeenCalled();
  });

  it('charges a 0.5% + 100 XAF fee and calls the operator connector when KYC ok', async () => {
    const { svc, repo, momo } = build(1);
    await svc.initiateLocalPayment('u1', dto);
    expect(momo.getConnector).toHaveBeenCalledWith(Operator.MTN);
    // fee = 5000*0.005 + 100 = 125
    const created = repo.create.mock.calls[0][0];
    expect(created.fee).toBe('125');
  });
});
