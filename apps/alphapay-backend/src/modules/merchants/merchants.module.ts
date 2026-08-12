import { Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { IsOptional, IsString } from 'class-validator';
import { Merchant, Terminal } from './entities/merchant.entity';
import { MerchantStatus } from '../../common/types/enums';
import { UsersService } from '../users/users.service';
import { UsersModule } from '../users/users.module';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Market } from '../../common/types/market.enum';

class CreateMerchantDto {
  @IsString() businessName: string;
  @IsOptional() @IsString() businessSector?: string;
}
class AddTerminalDto {
  @IsString() name: string;
}

@Injectable()
class MerchantsService {
  constructor(
    @InjectRepository(Merchant) private readonly merchants: Repository<Merchant>,
    @InjectRepository(Terminal) private readonly terminals: Repository<Terminal>,
    private readonly users: UsersService,
  ) {}

  async create(userId: string, dto: CreateMerchantDto) {
    const user = await this.users.findById(userId);
    const existing = await this.merchants.findOne({ where: { userId } });
    if (existing) return existing;
    return this.merchants.save(
      this.merchants.create({ userId, businessName: dto.businessName, businessSector: dto.businessSector, market: user.market as Market, status: MerchantStatus.PENDING }),
    );
  }

  async mine(userId: string) {
    const m = await this.merchants.findOne({ where: { userId } });
    if (!m) throw new NotFoundException('No merchant profile');
    return m;
  }

  async listTerminals(userId: string) {
    const m = await this.mine(userId);
    return this.terminals.find({ where: { merchantId: m.id } });
  }

  async addTerminal(userId: string, dto: AddTerminalDto) {
    const m = await this.mine(userId);
    const qrCodeId = `ALP-T-${randomBytes(3).toString('hex').toUpperCase()}`;
    return this.terminals.save(this.terminals.create({ merchantId: m.id, name: dto.name, qrCodeId }));
  }
}

@Controller('merchants')
@UseGuards(JwtAuthGuard)
class MerchantsController {
  constructor(private readonly svc: MerchantsService) {}
  @Post() create(@CurrentUser('sub') u: string, @Body() dto: CreateMerchantDto) { return this.svc.create(u, dto); }
  @Get('me') me(@CurrentUser('sub') u: string) { return this.svc.mine(u); }
  @Get('terminals') terminals(@CurrentUser('sub') u: string) { return this.svc.listTerminals(u); }
  @Post('terminals') addTerminal(@CurrentUser('sub') u: string, @Body() dto: AddTerminalDto) { return this.svc.addTerminal(u, dto); }
}

@Module({
  imports: [TypeOrmModule.forFeature([Merchant, Terminal]), UsersModule],
  providers: [MerchantsService],
  controllers: [MerchantsController],
  exports: [MerchantsService],
})
export class MerchantsModule {}
