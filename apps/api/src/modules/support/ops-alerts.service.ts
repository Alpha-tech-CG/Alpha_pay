import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ANY_MODE, PrismaClient } from '@paybrain/database';
import { KvStore } from '../../common/kv/kv-store';
import { CronLockService } from '../../common/scheduling/cron-lock.service';
import { MessagingService } from '../messaging/messaging.service';
import { SupportService } from './support.service';

/** Une même alerte n'est renvoyée qu'après ce délai, tant que le problème dure. */
const REPEAT_SECONDS = 3600;
const HOUR_MS = 3_600_000;

export interface OpsAlert {
  key: string;
  text: string;
}

const num = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

/**
 * Alertes d'exploitation (§M12) : toutes les 5 minutes, les indicateurs de
 * l'écran Santé sont comparés à des seuils ; ce qui dépasse part par email à
 * l'équipe (`OPS_EMAIL`), une fois par heure au plus pour un même problème.
 * Personne n'a à regarder l'écran pour apprendre qu'un paiement est bloqué.
 */
@Injectable()
export class OpsAlertsService {
  private readonly logger = new Logger(OpsAlertsService.name);

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly support: SupportService,
    private readonly messaging: MessagingService,
    private readonly kv: KvStore,
    private readonly locks: CronLockService,
  ) {}

  @Cron('0 */5 * * * *')
  async tick(): Promise<void> {
    if (process.env.OPS_ALERTS_ENABLED === 'false') return;
    await this.locks.runExclusive('ops-alerts', () => this.run().then(() => undefined)).catch((err) =>
      this.logger.warn(`Alertes d'exploitation non évaluées : ${(err as Error).message}`),
    );
  }

  /** Évalue les seuils et envoie les nouvelles alertes ; renvoie celles qui ont été envoyées. */
  async run(now = new Date()): Promise<OpsAlert[]> {
    const alerts = await this.evaluate(now);
    const fresh: OpsAlert[] = [];
    for (const alert of alerts) {
      if (await this.kv.setIfAbsent(`ops-alert:${alert.key}`, '1', REPEAT_SECONDS)) fresh.push(alert);
    }
    if (fresh.length === 0) return fresh;
    await this.messaging
      .send({
        merchantId: null,
        livemode: true,
        channels: ['EMAIL'],
        to: { email: process.env.OPS_EMAIL ?? 'ops@alphapay.cg' },
        templateKey: 'message.libre',
        variables: {
          subject: `AlphaPay : ${fresh.length} alerte(s) d'exploitation`,
          text: `${fresh.map((a) => `- ${a.text}`).join('\n')}\n\nDétail : back-office, écran Santé plateforme.`,
        },
        category: 'TRANSACTIONAL',
      })
      .catch((err) => this.logger.warn(`Alerte d'exploitation non envoyée : ${(err as Error).message}`));
    return fresh;
  }

  async evaluate(now = new Date()): Promise<OpsAlert[]> {
    const alerts: OpsAlert[] = [];
    const s = await this.support.system();
    if (s.stuck_payments.length > 0) alerts.push({ key: 'stuck', text: `${s.stuck_payments.length} paiement(s) live en attente depuis plus de 15 minutes.` });
    const dead = s.outbox.DEAD ?? 0;
    if (dead > 0) alerts.push({ key: 'outbox-dead', text: `${dead} demande(s) opérateur en échec définitif.` });
    if (s.queues === null) alerts.push({ key: 'redis', text: 'Files de tâches injoignables : Redis ne répond pas.' });
    for (const q of s.queues ?? []) {
      if (q.failed > 0) alerts.push({ key: `queue-${q.queue}`, text: `File « ${q.queue} » : ${q.failed} tâche(s) en échec définitif.` });
    }
    if (s.webhooks.failed_24h >= num('OPS_ALERT_WEBHOOK_FAILURES', 20)) {
      alerts.push({ key: 'webhooks', text: `${s.webhooks.failed_24h} webhooks marchands en échec sur 24 h.` });
    }
    if (s.messages.failed_24h >= num('OPS_ALERT_MESSAGE_FAILURES', 20)) {
      alerts.push({ key: 'messages', text: `${s.messages.failed_24h} messages en échec sur 24 h.` });
    }

    // Taux d'échec des paiements live sur la dernière heure, par opérateur.
    const since = new Date(now.getTime() - HOUR_MS);
    const rows = await this.prisma.transaction.groupBy({
      by: ['operator', 'status'],
      where: { livemode: true, createdAt: { gte: since } },
      _count: { id: true },
    });
    const byOperator = new Map<string, { total: number; failed: number }>();
    for (const r of rows) {
      const o = byOperator.get(r.operator) ?? { total: 0, failed: 0 };
      o.total += r._count.id;
      if (r.status === 'FAILED') o.failed += r._count.id;
      byOperator.set(r.operator, o);
    }
    const minVolume = num('OPS_ALERT_MIN_PAYMENTS', 10);
    const maxRate = num('OPS_ALERT_FAILURE_RATE_PCT', 30);
    for (const [operator, o] of byOperator) {
      const rate = Math.round((o.failed / o.total) * 100);
      if (o.total >= minVolume && rate >= maxRate) alerts.push({ key: `failure-${operator}`, text: `${operator} : ${rate} % de paiements en échec sur la dernière heure (${o.failed}/${o.total}).` });
    }

    // Litiges carte sans réponse à moins de 48 h de l'échéance.
    const due = await this.prisma.dispute.count({ where: { livemode: ANY_MODE, status: 'OPEN', evidenceDueAt: { lte: new Date(now.getTime() + 48 * HOUR_MS) } } });
    if (due > 0) alerts.push({ key: 'disputes', text: `${due} litige(s) carte sans réponse du marchand à moins de 48 h de l'échéance.` });
    return alerts;
  }
}
