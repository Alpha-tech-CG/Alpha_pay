import { Body, Controller, Get, Header, HttpCode, NotFoundException, Param, Post, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { mockPagesAllowed } from '../../common/config/deployment';
import { formatAmount } from '../../common/money';
import { CardAcquirerRegistry, cardPaymentsEnabled } from '../providers/card-acquirer.registry';
import { isValidCallbackToken } from '../providers/callback-token';
import { CardEventsService } from './card-events.service';

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function incoming(req: any) {
  return { headers: req.headers, body: req.body, rawBody: req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body ?? {}) };
}

/**
 * Webhooks de l'acquéreur carte (§M13). Acquéreur réel : URL secrète propre à
 * la connexion du marchand (comme D-041) en plus de la signature du
 * partenaire. Acquéreur factice : `/webhooks/card/mock`, hors production.
 */
@ApiExcludeController()
@Controller('webhooks/card')
export class CardWebhooksController {
  constructor(
    private readonly cards: CardAcquirerRegistry,
    private readonly events: CardEventsService,
  ) {}

  @Post('mock')
  @HttpCode(200)
  mock(@Req() req: any) {
    if (!mockPagesAllowed()) throw new NotFoundException();
    return this.events.handle(this.cards.mock, incoming(req));
  }

  @Post(':connectionId/:token')
  @HttpCode(200)
  async partner(@Param('connectionId') connectionId: string, @Param('token') token: string, @Req() req: any) {
    if (!cardPaymentsEnabled() || !isValidCallbackToken(connectionId, token)) throw new NotFoundException();
    const resolved = await this.cards.forConnection(connectionId);
    if (!resolved) throw new NotFoundException();
    return this.events.handle(resolved.acquirer, incoming(req), { merchantId: resolved.merchantId, livemode: resolved.livemode });
  }
}

/**
 * Page de l'acquéreur factice (test et préproduction seulement) : imite la
 * page hébergée d'un partenaire. Le numéro saisi choisit la marque et l'issue
 * (4000 0000 0000 0002 = refusée) ; il n'est jamais conservé.
 */
@ApiExcludeController()
@Controller('mock/card')
export class MockCardController {
  constructor(
    private readonly cards: CardAcquirerRegistry,
    private readonly events: CardEventsService,
  ) {}

  private assertMock() {
    if (!mockPagesAllowed() || !cardPaymentsEnabled()) throw new NotFoundException();
  }

  @Get(':sessionId')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async page(@Param('sessionId') sessionId: string) {
    this.assertMock();
    const s = await this.cards.mock.describe(sessionId).catch(() => null);
    if (!s) throw new NotFoundException();
    const sid = esc(sessionId);
    const amount = esc(formatAmount(BigInt(s.amount), s.currency));
    const done = s.status !== 'pending';
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Paiement par carte (test)</title>
<style>body{font:16px/1.45 system-ui,sans-serif;max-width:420px;margin:0 auto;padding:16px;color:#0B1E3D;background:#F4F7FA}
.card{background:#fff;border:1px solid #DCE3EA;border-radius:14px;padding:20px}.test{background:#FFF4CE;color:#6B4E00;font-size:13px;padding:8px 12px;border-radius:8px}
label{display:block;font-size:13px;font-weight:600;color:#5B6B7F;margin:14px 0 6px}input{width:100%;box-sizing:border-box;height:48px;border:1px solid #DCE3EA;border-radius:10px;padding:0 12px;font:inherit}
.row{display:flex;gap:10px}button{width:100%;height:50px;border:0;border-radius:12px;font:700 16px system-ui;margin-top:16px;cursor:pointer}
.pay{background:#00B4D8;color:#0B1E3D}.cancel{background:transparent;color:#0B1E3D;text-decoration:underline;height:auto}</style></head>
<body><div class="card"><div class="test">Acquéreur factice : aucun argent réel. Carte refusée : 4000 0000 0000 0002.</div>
<h1 style="font-size:20px">Paiement par carte</h1><p style="font:600 28px ui-monospace,monospace;margin:4px 0 8px">${amount}</p>
${done ? '<p>Cette session est terminée.</p>' : `<form method="post" action="/mock/card/${sid}/pay">
<label for="pan">Numéro de carte</label><input id="pan" name="pan" inputmode="numeric" autocomplete="cc-number" value="4242 4242 4242 4242">
<div class="row"><div style="flex:1"><label for="exp">Expiration</label><input id="exp" name="exp" value="12/30"></div><div style="flex:1"><label for="cvc">CVC</label><input id="cvc" name="cvc" value="123"></div></div>
<p style="font-size:13px;color:#5B6B7F">Validation 3-D Secure simulée.</p>
<button class="pay" name="outcome" value="succeeded">Payer</button>
<button class="cancel" name="outcome" value="canceled">Annuler et revenir au marchand</button></form>`}
</div></body></html>`;
  }

  @Post(':sessionId/pay')
  async pay(@Param('sessionId') sessionId: string, @Body() body: { pan?: string; outcome?: string }, @Res() res: any) {
    this.assertMock();
    const s = await this.cards.mock.describe(sessionId).catch(() => null);
    if (!s) throw new NotFoundException();
    const outcome = body.outcome === 'canceled' ? 'canceled' : 'succeeded';
    if (s.status === 'pending') {
      // Le « partenaire » prévient AlphaPay par webhook signé, comme le ferait un vrai acquéreur.
      const webhook = await this.cards.mock.complete(sessionId, outcome, body.pan ?? '');
      await this.events.handle(this.cards.mock, webhook);
    }
    res.redirect(303, outcome === 'canceled' ? s.cancelUrl : s.returnUrl);
  }

  /** Test : la banque du porteur ouvre un litige sur ce paiement. */
  @Post(':sessionId/dispute')
  @HttpCode(200)
  async dispute(@Param('sessionId') sessionId: string, @Body() body: { reason?: string }) {
    this.assertMock();
    return this.events.handle(this.cards.mock, await this.cards.mock.openDispute(sessionId, body?.reason));
  }

  /** Test : l'acquéreur tranche un litige. */
  @Post(':sessionId/dispute/:disputeRef/close')
  @HttpCode(200)
  async close(@Param('sessionId') sessionId: string, @Param('disputeRef') disputeRef: string, @Body() body: { won?: boolean }) {
    this.assertMock();
    return this.events.handle(this.cards.mock, await this.cards.mock.closeDispute(disputeRef, sessionId, body?.won === true));
  }
}
