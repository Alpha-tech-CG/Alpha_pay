import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsInt, IsString, Max, Min } from 'class-validator';
import { KycService } from './kyc.service';
import { SmileWebhookGuard } from './kyc-webhook.guard';

class SmileResultDto {
  @IsString() jobId!: string;
  @IsInt() @Min(0) @Max(100) score!: number;
  @IsBoolean() documentVerified!: boolean;
  @IsBoolean() biometricVerified!: boolean;
}

@Controller('webhooks/kyc')
export class KycWebhookController {
  constructor(private readonly kyc: KycService) {}
  @Post('smile')
  @UseGuards(SmileWebhookGuard)
  receiveSmile(@Body() body: SmileResultDto) { return this.kyc.handleSmileCallback(body); }
}
