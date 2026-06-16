import { Controller, Get, Inject, Req, UseGuards } from '@nestjs/common';
import { PrismaClient } from '@paybrain/database';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';

@Controller('outbox/dead-letter')
@UseGuards(ApiKeyGuard)
export class OutboxController {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  @Get()
  list(@Req() req: any) {
    return this.prisma.outboxEvent.findMany({
      where: { status: 'DEAD', transaction: { merchantId: req.merchant.id } },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
  }
}
