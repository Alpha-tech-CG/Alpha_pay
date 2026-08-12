import { Body, Controller, Get, Injectable, Module, Post, UseGuards } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { KycSubmission } from './entities/kyc-submission.entity';
import { KycLevel, KycStatus } from '../../common/types/enums';
import { KycFactory } from '../../connectors/kyc/kyc.connector';
import { UsersService } from '../users/users.service';
import { UsersModule } from '../users/users.module';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Market } from '../../common/types/market.enum';

class SubmitKycDto {
  @IsEnum(KycLevel) level: KycLevel;
  @IsOptional() @IsString() documentType?: string;
  @IsOptional() @IsString() documentImageBase64?: string;
  @IsOptional() @IsString() selfieImageBase64?: string;
}

@Injectable()
class KycService {
  constructor(
    @InjectRepository(KycSubmission) private readonly repo: Repository<KycSubmission>,
    private readonly factory: KycFactory,
    private readonly users: UsersService,
  ) {}

  async submit(userId: string, dto: SubmitKycDto) {
    const user = await this.users.findById(userId);
    const connector = this.factory.getConnector(user.market as Market);
    const result = await connector.submit({ userId, ...dto });
    const submission = await this.repo.save(
      this.repo.create({
        userId,
        level: dto.level,
        status: result.status as KycStatus,
        provider: result.provider,
        providerSubmissionId: result.providerSubmissionId,
        documentType: dto.documentType,
      }),
    );
    // On approval, promote the user's KYC level so payment gates open.
    if (result.status === 'APPROVED') {
      await this.users.setKyc(userId, dto.level === KycLevel.LEVEL_2 ? 2 : 1);
    }
    return submission;
  }

  list(userId: string) {
    return this.repo.find({ where: { userId }, order: { submittedAt: 'DESC' } });
  }
}

@Controller('kyc')
@UseGuards(JwtAuthGuard)
class KycController {
  constructor(private readonly kyc: KycService) {}
  @Post('submit') submit(@CurrentUser('sub') userId: string, @Body() dto: SubmitKycDto) {
    return this.kyc.submit(userId, dto);
  }
  @Get() list(@CurrentUser('sub') userId: string) {
    return this.kyc.list(userId);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([KycSubmission]), UsersModule],
  providers: [KycService],
  controllers: [KycController],
})
export class KycModule {}
