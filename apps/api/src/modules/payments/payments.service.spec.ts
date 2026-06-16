import { BadRequestException } from '@nestjs/common';
import { PaymentsService } from './payments.service';

jest.mock('@paybrain/connectors', () => ({
  createMtnConnector: jest.fn(),
  createAirtelConnector: jest.fn(),
}));

import { createMtnConnector, createAirtelConnector } from '@paybrain/connectors';

describe('PaymentsService', () => {
  let prisma: any;
  let mtnRequestToPay: jest.Mock;
  let airtelRequestToPay: jest.Mock;
  let service: PaymentsService;

  beforeEach(() => {
    prisma = { transaction: { create: jest.fn(), findFirst: jest.fn() } };
    mtnRequestToPay = jest.fn();
    airtelRequestToPay = jest.fn();
    (createMtnConnector as jest.Mock).mockReturnValue({ requestToPay: mtnRequestToPay });
    (createAirtelConnector as jest.Mock).mockReturnValue({ requestToPay: airtelRequestToPay });

    service = new PaymentsService(prisma);
  });

  it('routes an MTN sandbox number to the MTN connector and persists the operator', async () => {
    mtnRequestToPay.mockResolvedValue({ referenceId: 'ref-mtn', status: 'PENDING', operator: 'MTN' });
    prisma.transaction.create.mockResolvedValue({ id: 'tx-1' });

    const result = await service.initiatePayment(
      { amount: 100, currency: 'EUR', phone: '46733123450', externalId: 'ext-1' } as any,
      'merchant-1',
    );

    expect(mtnRequestToPay).toHaveBeenCalled();
    expect(airtelRequestToPay).not.toHaveBeenCalled();
    expect(prisma.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ operator: 'MTN', merchantId: 'merchant-1' }),
    });
    expect(result).toEqual({
      referenceId: 'ref-mtn',
      transactionId: 'tx-1',
      operator: 'MTN',
      status: 'PENDING',
    });
  });

  it('routes an Airtel-prefixed number to the Airtel connector', async () => {
    airtelRequestToPay.mockResolvedValue({ referenceId: 'ref-airtel', status: 'PENDING', operator: 'AIRTEL' });
    prisma.transaction.create.mockResolvedValue({ id: 'tx-2' });

    await service.initiatePayment(
      { amount: 50, currency: 'XAF', phone: '242055123456', externalId: 'ext-2' } as any,
      'merchant-1',
    );

    expect(airtelRequestToPay).toHaveBeenCalled();
    expect(mtnRequestToPay).not.toHaveBeenCalled();
    expect(prisma.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ operator: 'AIRTEL' }),
    });
  });

  it('rejects a phone number with no recognizable operator prefix', async () => {
    await expect(
      service.initiatePayment(
        { amount: 10, currency: 'EUR', phone: '242099999999', externalId: 'ext-3' } as any,
        'merchant-1',
      ),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });
});
