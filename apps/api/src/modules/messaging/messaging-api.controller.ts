import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { MessageChannel } from '@paybrain/database';
import { ApiError } from '../../common/errors/api-error';
import { RequiredScopes } from '../../common/decorators/scopes.decorator';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { ScopesGuard } from '../../common/guards/scopes.guard';
import { IdempotencyInterceptor } from '../../common/idempotency/idempotency.interceptor';
import { CreditsService } from './credits.service';
import { PublicChannel, SendMessageDto, SendOtpDto, VerifyOtpDto } from './dto/messaging.dto';
import { MessagingService } from './messaging.service';
import { OtpService } from './otp.service';

const CHANNEL: Record<PublicChannel, MessageChannel> = { sms: 'SMS', whatsapp: 'WHATSAPP', email: 'EMAIL' };
const isPhoneChannel = (c: PublicChannel) => c !== 'email';

/**
 * API Messages revendue aux marchands (§M9, §7) : SMS, WhatsApp, email et OTP.
 * Chaque message live consomme des crédits ; sans crédits → 402
 * `credits_insuffisants` et rien ne part. Le mode (test/live) vient de la clé.
 */
@ApiTags('Messages et OTP')
@ApiSecurity('ApiKey')
@Controller('v1')
@UseGuards(ApiKeyGuard, ScopesGuard)
export class MessagingApiController {
  constructor(
    private readonly messaging: MessagingService,
    private readonly otp: OtpService,
    private readonly credits: CreditsService,
  ) {}

  @Post('messages')
  @ApiOperation({ summary: 'Envoyer un SMS, un WhatsApp ou un email' })
  @RequiredScopes('messages:write')
  @UseInterceptors(IdempotencyInterceptor)
  async send(@Body() dto: SendMessageDto, @Req() req: any) {
    const channels = [dto.channel, ...(dto.fallback ?? [])];
    // Un même destinataire : on ne bascule pas d'un numéro vers une adresse email.
    if (channels.some((c) => isPhoneChannel(c) !== isPhoneChannel(dto.channel))) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'bascule_invalide', 'La bascule doit rester sur le même type de destinataire', 'fallback');
    }
    const sent = await this.messaging.send({
      merchantId: req.merchant.id,
      livemode: req.livemode === true,
      channels: channels.map((c) => CHANNEL[c]),
      to: isPhoneChannel(dto.channel) ? { phone: dto.to } : { email: dto.to },
      templateKey: 'message.notification',
      variables: { text: dto.text, merchantName: req.merchant.name, subject: dto.subject ?? `Message de ${req.merchant.name}` },
      category: dto.category === 'marketing' ? 'MARKETING' : 'TRANSACTIONAL',
      chargeCredits: true,
    });
    return { id: sent.id, status: sent.status.toLowerCase(), channel: sent.channel.toLowerCase() };
  }

  @Get('messages/:id')
  @ApiOperation({ summary: 'Lire le statut d’un message' })
  @RequiredScopes('messages:read')
  async status(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const s = await this.messaging.status(id, req.merchant.id, req.livemode === true);
    return {
      ...s,
      status: s.status.toLowerCase(),
      channel: s.channel.toLowerCase(),
      attempts: s.attempts.map((a) => ({ ...a, status: a.status.toLowerCase(), channel: a.channel.toLowerCase() })),
    };
  }

  @Post('otp/send')
  @ApiOperation({ summary: 'Envoyer un code à usage unique (6 chiffres, valable 5 minutes)' })
  @RequiredScopes('otp:write')
  @UseInterceptors(IdempotencyInterceptor)
  async sendOtp(@Body() dto: SendOtpDto, @Req() req: any) {
    const fallback = dto.fallback ?? [];
    if (fallback.some((c) => isPhoneChannel(c) !== isPhoneChannel(dto.channel))) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'bascule_invalide', 'La bascule doit rester sur le même type de destinataire', 'fallback');
    }
    const sent = await this.otp.send({
      merchantId: req.merchant.id,
      livemode: req.livemode === true,
      destination: dto.to,
      channel: CHANNEL[dto.channel],
      fallback: fallback.map((c) => CHANNEL[c]),
      purpose: dto.purpose ?? 'verification',
      ip: req.ip,
      merchantName: req.merchant.name,
      chargeCredits: true,
    });
    return { id: sent.id, channel: sent.channel.toLowerCase(), expires_in: sent.expiresIn };
  }

  /** Pas d'idempotence ici : un code est à usage unique, chaque vérification compte comme un essai. */
  @Post('otp/verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'Vérifier un code à usage unique (5 essais, puis blocage 15 minutes)' })
  @RequiredScopes('otp:write')
  async verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: any) {
    return this.otp.verify({
      merchantId: req.merchant.id,
      livemode: req.livemode === true,
      destination: dto.to,
      channel: CHANNEL[dto.channel],
      purpose: dto.purpose ?? 'verification',
      code: dto.code,
      ip: req.ip,
    });
  }

  @Get('credits')
  @ApiOperation({ summary: 'Solde de crédits de messages' })
  @RequiredScopes('credits:read')
  async balance(@Req() req: any) {
    const livemode = req.livemode === true;
    return { balance: await this.credits.balance(req.merchant.id, livemode), livemode };
  }
}
