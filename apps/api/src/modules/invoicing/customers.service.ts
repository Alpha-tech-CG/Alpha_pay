import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@paybrain/database';

export interface CreateCustomerDto {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class CustomersService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  create(merchantId: string, dto: CreateCustomerDto) {
    return this.prisma.customer.create({
      data: { merchantId, ...dto, metadata: (dto.metadata ?? {}) as any },
    });
  }

  list(merchantId: string, cursor?: string, limit = 25) {
    return this.prisma.customer.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }

  async get(merchantId: string, customerId: string) {
    const c = await this.prisma.customer.findFirst({ where: { id: customerId, merchantId } });
    if (!c) throw new NotFoundException('Client introuvable');
    return c;
  }

  async update(merchantId: string, customerId: string, dto: Partial<CreateCustomerDto>) {
    await this.get(merchantId, customerId);
    return this.prisma.customer.update({
      where: { id: customerId },
      data: dto as any,
    });
  }

  async remove(merchantId: string, customerId: string) {
    await this.get(merchantId, customerId);
    await this.prisma.customer.delete({ where: { id: customerId } });
  }
}
