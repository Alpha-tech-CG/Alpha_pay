import {
  Body, CanActivate, Controller, ExecutionContext, Get, Injectable, Module, NotFoundException,
  Param, Post, Query, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { timingSafeEqual } from 'crypto';
import { User } from '../users/entities/user.entity';
import { Merchant } from '../merchants/entities/merchant.entity';
import { Transaction } from '../payments/entities/transaction.entity';
import { KycSubmission } from '../kyc/entities/kyc-submission.entity';
import { MerchantStatus, KycStatus } from '../../common/types/enums';
import { UsersService } from '../users/users.service';
import { UsersModule } from '../users/users.module';

/** Plan admin : header `x-admin-token` vs ADMIN_API_TOKEN. Comparaison à temps constant. */
@Injectable()
class AdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const provided = String(req.headers['x-admin-token'] ?? '');
    const expected = this.config.get<string>('adminToken') ?? '';
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Jeton admin invalide');
    }
    return true;
  }
}

@Injectable()
class AdminService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Merchant) private readonly merchants: Repository<Merchant>,
    @InjectRepository(Transaction) private readonly txs: Repository<Transaction>,
    @InjectRepository(KycSubmission) private readonly kyc: Repository<KycSubmission>,
    private readonly usersService: UsersService,
  ) {}

  async stats() {
    const [usersCount, merchantsPending, merchantsApproved] = await Promise.all([
      this.users.count(),
      this.merchants.count({ where: { status: MerchantStatus.PENDING } }),
      this.merchants.count({ where: { status: MerchantStatus.APPROVED } }),
    ]);
    const byStatus = await this.txs
      .createQueryBuilder('t')
      .select('t.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(t.amount),0)', 'volume')
      .groupBy('t.status')
      .getRawMany<{ status: string; count: string; volume: string }>();
    const successful = byStatus.find((r) => r.status === 'SUCCESSFUL');
    return {
      users: usersCount,
      merchants: { pending: merchantsPending, approved: merchantsApproved },
      transactions: {
        byStatus: byStatus.map((r) => ({ status: r.status, count: Number(r.count), volume: Number(r.volume) })),
        successfulVolume: Number(successful?.volume ?? 0),
      },
    };
  }

  listMerchants(status?: string) {
    return this.merchants.find({
      where: status ? { status: status as MerchantStatus } : {},
      order: { createdAt: 'DESC' },
    });
  }

  async setMerchantStatus(id: string, status: MerchantStatus) {
    const m = await this.merchants.findOne({ where: { id } });
    if (!m) throw new NotFoundException('Merchant introuvable');
    m.status = status;
    return this.merchants.save(m);
  }

  listTransactions(q: { status?: string; limit?: number; offset?: number }) {
    const qb = this.txs.createQueryBuilder('t');
    if (q.status) qb.where('t.status = :s', { s: q.status });
    return qb.orderBy('t.createdAt', 'DESC').take(q.limit ?? 50).skip(q.offset ?? 0).getMany();
  }

  listKyc(status?: string) {
    return this.kyc.find({
      where: status ? { status: status as KycStatus } : {},
      order: { submittedAt: 'DESC' },
    });
  }

  /** Revue manuelle KYC : approuve (promeut le niveau de l'user) ou rejette. */
  async reviewKyc(id: string, approve: boolean, reason?: string) {
    const sub = await this.kyc.findOne({ where: { id } });
    if (!sub) throw new NotFoundException('Soumission KYC introuvable');
    sub.status = approve ? KycStatus.APPROVED : KycStatus.REJECTED;
    sub.rejectionReason = approve ? null! : (reason ?? 'Rejeté par un administrateur');
    sub.reviewedAt = new Date();
    await this.kyc.save(sub);
    if (approve) {
      await this.usersService.setKyc(sub.userId, sub.level === 'LEVEL_2' ? 2 : 1);
    }
    return sub;
  }

  listUsers(limit = 100) {
    return this.users.find({
      select: ['id', 'phoneNumber', 'market', 'accountType', 'kycVerified', 'kycLevel', 'isActive', 'createdAt'],
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}

@Controller('admin')
@UseGuards(AdminGuard)
class AdminController {
  constructor(private readonly svc: AdminService) {}

  @Get('stats') stats() { return this.svc.stats(); }
  @Get('users') users() { return this.svc.listUsers(); }

  @Get('merchants') merchants(@Query('status') status?: string) { return this.svc.listMerchants(status); }
  @Post('merchants/:id/approve') approveMerchant(@Param('id') id: string) { return this.svc.setMerchantStatus(id, MerchantStatus.APPROVED); }
  @Post('merchants/:id/reject') rejectMerchant(@Param('id') id: string) { return this.svc.setMerchantStatus(id, MerchantStatus.REJECTED); }

  @Get('transactions') transactions(@Query() q: { status?: string; limit?: number; offset?: number }) { return this.svc.listTransactions(q); }

  @Get('kyc') kyc(@Query('status') status?: string) { return this.svc.listKyc(status); }
  @Post('kyc/:id/approve') approveKyc(@Param('id') id: string) { return this.svc.reviewKyc(id, true); }
  @Post('kyc/:id/reject') rejectKyc(@Param('id') id: string, @Body() b: { reason?: string }) { return this.svc.reviewKyc(id, false, b?.reason); }
}

@Module({
  imports: [TypeOrmModule.forFeature([User, Merchant, Transaction, KycSubmission]), UsersModule],
  providers: [AdminService, AdminGuard],
  controllers: [AdminController],
})
export class AdminModule {}
