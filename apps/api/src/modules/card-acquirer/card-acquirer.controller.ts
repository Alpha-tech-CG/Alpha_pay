import { mockPagesAllowed } from '../../common/config/deployment';
import {
  Body, Controller, Get, Header, HttpCode, HttpStatus, NotFoundException,
  Param, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SessionGuard } from '../auth/session.guard';
import { RequireMemberGuard } from '../team/auth/require-member.guard';
import { can } from '../team/permissions/permissions';
import { CardAcquirerService, cardPaymentsEnabled } from './card-acquirer.service';

function assertEnabled() {
  if (!cardPaymentsEnabled()) throw new NotFoundException();
}

/**
 * Paiements carte (T-95) — derrière FEATURE_CARD_PAYMENTS=true.
 * Tous les endpoints lèvent 404 quand la feature est désactivée :
 * aucune trace d'existence dans les réponses de production.
 */
@Controller('v1/merchants/:merchantId/card')
@UseGuards(SessionGuard, RequireMemberGuard)
export class CardAcquirerController {
  constructor(private readonly acquirer: CardAcquirerService) {}

  @Post('sessions')
  @HttpCode(HttpStatus.CREATED)
  async createSession(
    @Req() req: any,
    @Param('merchantId') merchantId: string,
    @Body() body: { amount: number; currency: string; reference: string; return_url: string },
  ) {
    assertEnabled();
    if (!can(req.membership, 'payments:collect')) throw new NotFoundException();
    return this.acquirer.createSession({
      merchantId,
      amount: body.amount,
      currency: body.currency,
      reference: body.reference,
      returnUrl: body.return_url,
    });
  }
}

/**
 * Page mock acquéreur (développement uniquement).
 * Absente si CARD_ACQUIRER_MOCK != true ou si NODE_ENV = production.
 */
@ApiExcludeController()
@Controller('mock/card')
export class MockCardController {
  constructor(private readonly acquirer: CardAcquirerService) {}

  private assertMock() {
    if (!mockPagesAllowed() || !this.acquirer.isMock()) throw new NotFoundException();
  }

  @Get(':sessionId')
  @Header('Content-Type', 'text/html; charset=utf-8')
  page(
    @Param('sessionId') sessionId: string,
    @Query('amount') amount: string,
    @Query('currency') currency: string,
    @Query('ref') ref: string,
    @Query('return') returnUrl: string,
  ) {
    this.assertMock();
    const sid = sessionId.replace(/[^A-Za-z0-9]/g, '');
    const amt = (parseInt(amount) / 100).toFixed(2);
    return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Paiement carte (test)</title>
<body style="font-family:system-ui;max-width:420px;margin:40px auto;padding:0 16px;color:#0B1E3D">
<h1 style="font-size:20px">Paiement carte — mode test</h1>
<p>Session : <code>${sid}</code><br>Montant : <b>${amt} ${currency ?? 'XAF'}</b><br>Réf : ${ref}</p>
<form method="post" action="/mock/card/${sid}/pay">
  <input type="hidden" name="return_url" value="${encodeURIComponent(returnUrl ?? '')}">
  <p><label>N° carte (test) : <input name="card" value="4111111111111111" style="width:200px"></label></p>
  <button style="height:48px;width:100%;border:0;border-radius:10px;background:#00B4D8;font-weight:700;font-size:16px">Payer</button>
</form></body></html>`;
  }

  @Post(':sessionId/pay')
  @Header('Content-Type', 'text/html; charset=utf-8')
  pay(@Param('sessionId') sessionId: string, @Body() body: { return_url?: string }) {
    this.assertMock();
    const returnUrl = body.return_url ? decodeURIComponent(body.return_url) : '/';
    const sid = sessionId.replace(/[^A-Za-z0-9]/g, '');
    return `<!doctype html><meta charset="utf-8"><script>
window.location.href = ${JSON.stringify(returnUrl + (returnUrl.includes('?') ? '&' : '?') + 'card_session=' + sid + '&status=SUCCESS')};
</script><body>Redirection…</body>`;
  }
}
