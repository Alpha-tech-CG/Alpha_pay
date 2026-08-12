import {
  Body, CanActivate, Controller, ExecutionContext, ForbiddenException, Get, Injectable, Module,
  Param, Post, Req, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { IsArray, IsEnum, IsString } from 'class-validator';
import { ApiKey, ApiLog } from './entities/developer.entities';
import { ApiEnvironment } from '../../common/types/enums';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaymentsService } from '../payments/payments.service';
import { PaymentsModule } from '../payments/payments.module';
import { InitiatePaymentDto } from '../payments/dto/payments.dto';

class CreateKeyDto {
  @IsString() name: string;
  @IsEnum(ApiEnvironment) environment: ApiEnvironment;
  @IsArray() scopes: string[];
}

@Injectable()
class ApiKeysService {
  constructor(@InjectRepository(ApiKey) private readonly repo: Repository<ApiKey>) {}

  /** Returns the raw key exactly once; only its bcrypt hash is stored. */
  async create(userId: string, dto: CreateKeyDto) {
    const env = dto.environment === ApiEnvironment.PRODUCTION ? 'live' : 'test';
    const raw = `alp_sk_${env}_${randomBytes(24).toString('hex')}`;
    const keyHash = await bcrypt.hash(raw, 10);
    const entity = await this.repo.save(
      this.repo.create({ userId, name: dto.name, keyHash, keyPrefix: `alp_sk_${env}`, environment: dto.environment, scopes: dto.scopes }),
    );
    return { id: entity.id, name: entity.name, environment: entity.environment, scopes: entity.scopes, key: raw };
  }

  list(userId: string) {
    return this.repo.find({ where: { userId }, select: ['id', 'name', 'keyPrefix', 'environment', 'scopes', 'isActive', 'lastUsedAt', 'createdAt'] });
  }

  async revoke(userId: string, id: string) {
    const key = await this.repo.findOne({ where: { id } });
    if (!key) throw new ForbiddenException('Key not found');
    if (key.userId !== userId) throw new ForbiddenException('Not your key');
    key.isActive = false;
    await this.repo.save(key);
    return { ok: true };
  }

  /** Verify a raw key against stored bcrypt hashes (active keys only). */
  async verify(raw: string): Promise<ApiKey | null> {
    const prefix = raw.split('_').slice(0, 3).join('_'); // alp_sk_live / alp_sk_test
    const candidates = await this.repo.find({ where: { keyPrefix: prefix, isActive: true } });
    for (const k of candidates) {
      if (await bcrypt.compare(raw, k.keyHash)) {
        k.lastUsedAt = new Date();
        await this.repo.save(k);
        return k;
      }
    }
    return null;
  }
}

@Injectable()
class ApiKeyGuard implements CanActivate {
  constructor(private readonly keys: ApiKeysService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    if (!header?.startsWith('Bearer alp_sk_')) throw new UnauthorizedException('Missing API key');
    const raw = header.slice('Bearer '.length);
    const key = await this.keys.verify(raw);
    if (!key) throw new UnauthorizedException('Invalid or revoked API key');
    req.apiKey = key;
    req.userId = key.userId;
    return true;
  }
}

@Injectable()
class LogsService {
  constructor(@InjectRepository(ApiLog) private readonly repo: Repository<ApiLog>) {}
  list(userId: string) {
    return this.repo.find({ where: { userId }, order: { createdAt: 'DESC' }, take: 100 });
  }
}

/** Developer dashboard routes (JWT-authenticated). */
@Controller('developer')
@UseGuards(JwtAuthGuard)
class DeveloperController {
  constructor(private readonly keys: ApiKeysService, private readonly logs: LogsService) {}
  @Post('keys') create(@CurrentUser('sub') u: string, @Body() dto: CreateKeyDto) { return this.keys.create(u, dto); }
  @Get('keys') list(@CurrentUser('sub') u: string) { return this.keys.list(u); }
  @Post('keys/:id/revoke') revoke(@CurrentUser('sub') u: string, @Param('id') id: string) { return this.keys.revoke(u, id); }
  @Get('logs') apiLogs(@CurrentUser('sub') u: string) { return this.logs.list(u); }
}

/** Public API surface — authenticated by API key, not JWT. */
@Controller('v1')
@UseGuards(ApiKeyGuard)
@Throttle({ default: { limit: 100, ttl: 60_000 } })
class V1Controller {
  constructor(private readonly payments: PaymentsService) {}
  @Post('payments/request') request(@Req() req: Request & { userId: string }, @Body() dto: InitiatePaymentDto) {
    // req.userId is attached by ApiKeyGuard; delegate to the same business logic as JWT routes
    return this.payments.initiateLocalPayment(req.userId, dto);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([ApiKey, ApiLog]), PaymentsModule],
  providers: [ApiKeysService, LogsService, ApiKeyGuard],
  controllers: [DeveloperController, V1Controller],
})
export class DeveloperModule {}
