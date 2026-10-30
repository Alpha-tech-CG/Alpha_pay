import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Customer, PrismaClient, ReminderChannel } from '@paybrain/database';
import { toE164 } from '@paybrain/shared';
import { ApiError } from '../../common/errors/api-error';
import { afterCursor, decodeCursor, page } from '../../common/pagination/cursor';
import { CreateCustomerDto, PublicChannel, UpdateCustomerDto } from './invoicing.dto';

export function toChannels(channels?: PublicChannel[]): ReminderChannel[] | undefined {
  return channels?.map((c) => c.toUpperCase() as ReminderChannel);
}

export function presentCustomer(c: Customer) {
  return {
    id: c.id,
    object: 'customer',
    livemode: c.livemode,
    name: c.name,
    phone: c.phone,
    email: c.email,
    address: c.address,
    notes: c.notes,
    channels: c.preferredChannels.map((ch) => ch.toLowerCase()),
    created_at: c.createdAt,
  };
}

/** Clients du marchand (§M7) : destinataires des factures, relances et reçus. */
@Injectable()
export class CustomersService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  async create(merchantId: string, livemode: boolean, dto: CreateCustomerDto) {
    const c = await this.prisma.customer.create({
      data: {
        merchantId,
        livemode,
        name: dto.name.trim(),
        phone: dto.phone ? toE164(dto.phone) : null,
        email: dto.email?.trim().toLowerCase() ?? null,
        address: dto.address ?? null,
        notes: dto.notes ?? null,
        preferredChannels: toChannels(dto.channels) ?? (dto.phone ? ['SMS'] : dto.email ? ['EMAIL'] : ['SMS']),
      },
    });
    return presentCustomer(c);
  }

  async list(merchantId: string, livemode: boolean, limit: number, startingAfter?: string, q?: string) {
    const rows = await this.prisma.customer.findMany({
      where: {
        merchantId,
        livemode,
        ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }, { email: { contains: q, mode: 'insensitive' } }] } : {}),
        ...afterCursor(decodeCursor(startingAfter)),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    return page(rows, limit, presentCustomer);
  }

  async find(merchantId: string, livemode: boolean, id: string): Promise<Customer> {
    const c = await this.prisma.customer.findFirst({ where: { id, merchantId, livemode } });
    if (!c) throw new ApiError(HttpStatus.NOT_FOUND, 'client_introuvable', 'Client introuvable', 'customer_id');
    return c;
  }

  async get(merchantId: string, livemode: boolean, id: string) {
    return presentCustomer(await this.find(merchantId, livemode, id));
  }

  async update(merchantId: string, livemode: boolean, id: string, dto: UpdateCustomerDto) {
    await this.find(merchantId, livemode, id);
    const c = await this.prisma.customer.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone ? toE164(dto.phone) : null } : {}),
        ...(dto.email !== undefined ? { email: dto.email ? dto.email.trim().toLowerCase() : null } : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.channels ? { preferredChannels: toChannels(dto.channels) } : {}),
      },
    });
    return presentCustomer(c);
  }

  /** Un client qui a des factures ouvertes reste : on ne perd pas le destinataire des relances. */
  async remove(merchantId: string, livemode: boolean, id: string): Promise<void> {
    await this.find(merchantId, livemode, id);
    const open = await this.prisma.invoice.count({ where: { customerId: id, status: { in: ['SENT', 'PARTIAL', 'OVERDUE'] } } });
    if (open > 0) throw new ApiError(HttpStatus.CONFLICT, 'client_factures_ouvertes', 'Ce client a des factures en cours : annulez-les ou attendez leur paiement');
    await this.prisma.customer.delete({ where: { id } });
  }
}
