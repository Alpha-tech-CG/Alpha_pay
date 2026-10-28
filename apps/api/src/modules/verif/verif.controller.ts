import { Body, Controller, Delete, Get, HttpCode, MessageEvent, Param, Post, Query, Req, Sse, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsString, IsUrl, MaxLength, ValidateNested } from 'class-validator';
import { Observable } from 'rxjs';
import { SessionGuard } from '../auth/session.guard';
import { RequireMemberGuard } from '../team/auth/require-member.guard';
import { LIMIT_NOTICE, StreamViewer, VerifService } from './verif.service';

class PushKeysDto {
  @IsString() @MaxLength(200) p256dh!: string;
  @IsString() @MaxLength(100) auth!: string;
}

/** Corps de `PushSubscription.toJSON()` côté navigateur. */
class PushSubscriptionDto {
  @ApiProperty()
  @IsUrl({ protocols: ['https'], require_tld: false }, { message: 'endpoint : URL https' })
  @MaxLength(1000)
  endpoint!: string;

  @ApiProperty({ type: PushKeysDto })
  @ValidateNested()
  @Type(() => PushKeysDto)
  keys!: PushKeysDto;
}

class DeletePushDto {
  @IsString() @MaxLength(1000) endpoint!: string;
}

const HEARTBEAT_MS = 25_000;

function viewer(req: any): StreamViewer {
  return { merchantId: req.membership.merchantId, memberId: req.membership.memberId, role: req.membership.role };
}

/** Vérif côté tableau de bord (T-55) : tout membre voit les confirmations de son périmètre. */
@ApiTags('Vérif')
@ApiSecurity('Bearer')
@Controller('v1/merchants/:merchantId/verif')
@UseGuards(SessionGuard, RequireMemberGuard)
export class VerifController {
  constructor(private readonly verif: VerifService) {}

  @Post('stream-ticket')
  @HttpCode(201)
  @ApiOperation({ summary: 'Ticket à usage unique pour ouvrir le flux temps réel (60 s)' })
  ticket(@Req() req: any) {
    return this.verif.createStreamTicket(viewer(req));
  }

  @Get('today')
  @ApiOperation({ summary: 'Écran Caisse : paiements réussis du jour' })
  today(@Req() req: any, @Query('mode') mode?: string, @Query('till_id') tillId?: string) {
    return this.verif.today(viewer(req), mode === 'live', tillId);
  }

  @Get('push/config')
  pushConfig() {
    return { public_key: this.verif.pushPublicKey, notice: LIMIT_NOTICE };
  }

  @Post('push-subscriptions')
  @HttpCode(201)
  subscribe(@Req() req: any, @Body() dto: PushSubscriptionDto) {
    return this.verif.savePushSubscription(req.membership.memberId, { endpoint: dto.endpoint, ...dto.keys }, req.headers['user-agent']);
  }

  @Delete('push-subscriptions')
  unsubscribe(@Req() req: any, @Body() dto: DeletePushDto) {
    return this.verif.deletePushSubscription(req.membership.memberId, dto.endpoint);
  }
}

/** Flux SSE : ouvert avec un ticket (EventSource n'envoie pas d'en-tête Authorization). */
@ApiTags('Vérif')
@Controller('v1/verif')
export class VerifStreamController {
  constructor(private readonly verif: VerifService) {}

  @Sse('stream')
  @ApiOperation({ summary: 'Confirmations en temps réel (text/event-stream)' })
  async stream(@Query('ticket') ticket: string | undefined): Promise<Observable<MessageEvent>> {
    const who = await this.verif.redeemStreamTicket(ticket);
    return new Observable<MessageEvent>((subscriber) => {
      let unsubscribe: (() => void) | undefined;
      let closed = false;
      this.verif
        .subscribe(who, (event) => subscriber.next({ type: 'payment', id: event.payment.id, data: { message: event.message, payment: event.payment } }))
        .then((off) => (closed ? off() : (unsubscribe = off)));
      subscriber.next({ type: 'ready', data: { ok: true } });
      // Battement régulier : garde la connexion ouverte à travers les proxys.
      const heartbeat = setInterval(() => subscriber.next({ type: 'ping', data: { t: Date.now() } }), HEARTBEAT_MS);
      return () => {
        closed = true;
        clearInterval(heartbeat);
        unsubscribe?.();
      };
    });
  }
}
