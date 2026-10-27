import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ANY_MODE, Message, MessageCategory, MessageChannel, MessageStatus, Prisma, PrismaClient } from '@paybrain/database';
import { DeliveryEvent, InboundMessage, ProviderError } from '@paybrain/providers';
import { toE164 } from '@paybrain/shared';
import { ApiError } from '../../common/errors/api-error';
import { JobContext, JobQueue, QUEUES } from '../../common/queue/job-queue';
import { decryptField, deterministicHash, encryptField, maskEmail, maskPhone, normalizeEmail } from '../../common/security/pii-crypto';
import { creditCost, CreditsService } from './credits.service';
import { MessagingProviders } from './messaging-providers';
import { MissingTemplateError, renderTemplate, TemplateService } from './template.service';

export interface SendMessageInput {
  /** null = message interne d'AlphaPay (OTP de connexion, alertes). */
  merchantId: string | null;
  livemode: boolean;
  /** Ordre d'essai ; les suivants servent de bascule (ex. WHATSAPP puis SMS). */
  channels: MessageChannel[];
  to: { phone?: string; email?: string };
  templateKey: string;
  variables: Record<string, string>;
  category: MessageCategory;
  /** Débiter les crédits du marchand (API Messages revendue, M11). */
  chargeCredits?: boolean;
  /** Tentatives par canal avant bascule (défaut 5 ; 2 pour les OTP). */
  maxAttempts?: number;
}

export interface MessageJob {
  messageId: string;
}

interface Contact {
  phone?: string;
  email?: string;
}

const PHONE_CHANNELS: MessageChannel[] = ['SMS', 'WHATSAPP'];
// Progression d'un statut de livraison : un accusé tardif ne fait jamais reculer.
const RANK: Record<MessageStatus, number> = { QUEUED: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: 4, SKIPPED: 4 };
const STOP_WORDS = new Set(['STOP', 'STOPALL', 'ARRET', 'ARRÊT', 'DESABONNER', 'DÉSABONNER', 'UNSUBSCRIBE']);

function destinationOf(channel: MessageChannel, contact: Contact): string | undefined {
  return PHONE_CHANNELS.includes(channel) ? contact.phone : contact.email;
}

function maskDestination(channel: MessageChannel, value: string): string {
  return PHONE_CHANNELS.includes(channel) ? maskPhone(value) : maskEmail(value);
}

/**
 * Service d'envoi (§M9) : modèles versionnés, envoi par la file de tâches avec
 * nouvelles tentatives (réseau, 5xx, 429), bascule de canal configurable,
 * journal masqué, statut de livraison, désabonnement STOP, crédits.
 */
@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly templates: TemplateService,
    private readonly providers: MessagingProviders,
    private readonly credits: CreditsService,
    @Inject(JobQueue) private readonly queue: JobQueue,
  ) {}

  /** Appelé uniquement par le process worker. */
  register(): void {
    this.queue.process<MessageJob>(QUEUES.messages, (job, ctx) => this.process(job.messageId, ctx));
  }

  // ── Envoi ────────────────────────────────────────────────────────────────

  async send(input: SendMessageInput): Promise<{ id: string; status: MessageStatus; channel: MessageChannel }> {
    const contact = this.normalizeContact(input.to);
    let channels = input.channels.filter((c, i, all) => all.indexOf(c) === i && destinationOf(c, contact));
    if (channels.length === 0) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'destinataire_invalide', 'Aucun destinataire pour les canaux demandés', 'to');
    }

    const available = await this.templates.channelsFor(input.templateKey);
    channels = channels.filter((c) => available.includes(c));
    if (channels.length === 0) {
      throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'modele_inconnu', `Modèle « ${input.templateKey} » indisponible sur ces canaux`, 'template');
    }

    if (input.category === 'MARKETING') channels = await this.withoutOptedOut(input.merchantId, channels, contact);
    const groupId = randomUUID();
    if (channels.length === 0) {
      // Destinataire désabonné : rien ne part, mais l'envoi est journalisé.
      const first = input.channels[0];
      const dest = destinationOf(first, contact)!;
      await this.prisma.message.create({
        data: {
          id: groupId,
          groupId,
          merchantId: input.merchantId,
          livemode: input.livemode,
          channel: first,
          category: input.category,
          templateKey: input.templateKey,
          destinationHash: new Uint8Array(deterministicHash(dest)),
          destinationMasked: maskDestination(first, dest),
          status: 'SKIPPED',
          lastError: 'desabonne',
        },
      });
      return { id: groupId, status: 'SKIPPED', channel: first };
    }

    const message = await this.createAttempt({
      id: groupId,
      groupId,
      input,
      contact,
      channel: channels[0],
      fallbackChannels: channels.slice(1),
      fallbackOfId: null,
    });
    return { id: message.id, status: message.status, channel: message.channel };
  }

  private normalizeContact(to: Contact): Contact {
    const contact: Contact = {};
    if (to.phone) {
      try {
        contact.phone = toE164(to.phone);
      } catch (err: any) {
        throw new ApiError(HttpStatus.BAD_REQUEST, 'telephone_invalide', err.message, 'to.phone');
      }
    }
    if (to.email) contact.email = normalizeEmail(to.email);
    return contact;
  }

  private async withoutOptedOut(merchantId: string | null, channels: MessageChannel[], contact: Contact) {
    const kept: MessageChannel[] = [];
    for (const channel of channels) {
      const hash = new Uint8Array(deterministicHash(destinationOf(channel, contact)!));
      const optOut = await this.prisma.optOut.findFirst({
        where: { channel, destinationHash: hash, OR: [{ merchantId: null }, ...(merchantId ? [{ merchantId }] : [])] },
      });
      if (!optOut) kept.push(channel);
    }
    return kept;
  }

  /** Crée une tentative sur un canal (débit des crédits compris) puis la met en file. */
  private async createAttempt(a: {
    id?: string;
    groupId: string;
    input: Pick<SendMessageInput, 'merchantId' | 'livemode' | 'templateKey' | 'variables' | 'category' | 'chargeCredits' | 'maxAttempts'>;
    contact: Contact;
    channel: MessageChannel;
    fallbackChannels: MessageChannel[];
    fallbackOfId: string | null;
  }): Promise<Message> {
    const { input, contact, channel } = a;
    const destination = destinationOf(channel, contact)!;
    const id = a.id ?? randomUUID();
    // Les crédits ne s'appliquent qu'aux envois live d'un marchand via l'API (mode test gratuit).
    const cost = input.chargeCredits && input.merchantId && input.livemode ? creditCost(channel) : 0;

    const message = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (cost > 0) await this.credits.debit(input.merchantId!, input.livemode, cost, id, tx);
      return tx.message.create({
        data: {
          id,
          groupId: a.groupId,
          merchantId: input.merchantId,
          livemode: input.livemode,
          channel,
          category: input.category,
          templateKey: input.templateKey,
          destinationHash: new Uint8Array(deterministicHash(destination)),
          destinationMasked: maskDestination(channel, destination),
          contactEnc: new Uint8Array(encryptField(JSON.stringify(contact))),
          variablesEnc: new Uint8Array(encryptField(JSON.stringify(input.variables))),
          maxAttempts: input.maxAttempts ?? 5,
          creditsCharged: cost,
          fallbackChannels: a.fallbackChannels,
          fallbackOfId: a.fallbackOfId,
        },
      });
    });

    await this.queue.enqueue<MessageJob>(QUEUES.messages, 'send', { messageId: id }, { jobId: `msg-${id}`, attempts: message.maxAttempts });
    return message;
  }

  // ── Traitement par le worker ───────────────────────────────────────────────

  async process(messageId: string, ctx: Pick<JobContext, 'attemptsMade'>): Promise<void> {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.status !== 'QUEUED') return;
    if (!message.contactEnc || !message.variablesEnc || !message.templateKey) {
      await this.fail(message, 'contenu_absent', false);
      return;
    }

    const contact = JSON.parse(decryptField(message.contactEnc)) as Contact;
    const variables = JSON.parse(decryptField(message.variablesEnc)) as Record<string, string>;
    const destination = destinationOf(message.channel, contact)!;

    try {
      const template = await this.templates.get(message.templateKey, message.channel, message.templateVersion ?? undefined);
      const rendered = renderTemplate(template, variables);
      const result = await this.dispatch(message.channel, destination, rendered, message.category === 'OTP' ? variables.code : undefined);
      await this.prisma.message.update({
        where: { id: message.id },
        data: {
          status: 'SENT',
          provider: this.providerName(message.channel),
          providerMessageId: result.providerMessageId,
          templateVersion: template.version,
          subject: rendered.subject ?? null,
          attempts: { increment: 1 },
          sentAt: new Date(),
          lastError: null,
          ...(result.cost ? { costMinor: BigInt(result.cost.amount), costCurrency: result.cost.currency } : {}),
        },
      });
    } catch (err) {
      const reason = err instanceof ProviderError ? `${err.code}: ${err.message}` : (err as Error)?.message ?? 'erreur';
      const retryable = err instanceof ProviderError && err.retryable;
      const final = !retryable || ctx.attemptsMade + 1 >= message.maxAttempts;
      await this.prisma.message.update({ where: { id: message.id }, data: { attempts: { increment: 1 }, lastError: reason } });
      if (!final) throw err; // la file réessaie avec un délai croissant
      // Jamais accepté par le fournisseur : crédits rendus s'il n'y a pas de bascule.
      await this.fail(message, reason, true);
      if (err instanceof MissingTemplateError) this.logger.error(reason);
    }
  }

  private providerName(channel: MessageChannel): string {
    return channel === 'SMS' ? this.providers.sms.name : channel === 'WHATSAPP' ? this.providers.whatsapp.name : this.providers.email.name;
  }

  private dispatch(channel: MessageChannel, to: string, rendered: ReturnType<typeof renderTemplate>, otpCode?: string) {
    switch (channel) {
      case 'SMS':
        return this.providers.sms.send({ to, text: rendered.text });
      case 'WHATSAPP':
        if (!rendered.whatsapp) throw new ProviderError('invalid_request', 'Modèle WhatsApp non défini', { provider: 'whatsapp', retryable: false });
        return this.providers.whatsapp.sendTemplate({
          to,
          template: rendered.whatsapp.name,
          language: 'fr',
          variables: rendered.whatsapp.variables,
          ...(otpCode ? { authenticationCode: otpCode } : {}),
        });
      case 'EMAIL':
        return this.providers.email.send({ to, subject: rendered.subject ?? 'AlphaPay', text: rendered.text });
    }
  }

  /**
   * Échec définitif d'une tentative : bascule sur le canal suivant s'il en
   * reste, sinon échec du message (crédits rendus si jamais accepté).
   */
  private async fail(message: Message, reason: string, neverAccepted: boolean): Promise<void> {
    const updated = await this.prisma.message.updateMany({
      where: { id: message.id, status: { notIn: ['FAILED', 'SKIPPED'] } },
      data: { status: 'FAILED', failedAt: new Date(), lastError: reason },
    });
    if (updated.count === 0) return; // déjà traité (accusé rejoué)

    const [next, ...rest] = message.fallbackChannels;
    if (next && message.contactEnc && message.variablesEnc && message.templateKey) {
      const contact = JSON.parse(decryptField(message.contactEnc)) as Contact;
      try {
        await this.createAttempt({
          groupId: message.groupId,
          input: {
            merchantId: message.merchantId,
            livemode: message.livemode,
            templateKey: message.templateKey,
            variables: JSON.parse(decryptField(message.variablesEnc)),
            category: message.category,
            chargeCredits: message.creditsCharged > 0,
            maxAttempts: message.maxAttempts,
          },
          contact,
          channel: next,
          fallbackChannels: rest,
          fallbackOfId: message.id,
        });
        this.logger.log(`Message ${message.id} : bascule ${message.channel} → ${next}`);
      } catch (err) {
        this.logger.warn(`Bascule impossible pour ${message.id} : ${(err as Error).message}`);
      }
    }
    if (neverAccepted && message.merchantId && message.creditsCharged > 0) {
      await this.credits.refund(message.merchantId, message.livemode, message.creditsCharged, message.id);
    }
    await this.wipe(message.id);
  }

  /** Efface contact et variables chiffrés (un OTP ne reste pas en base). */
  private async wipe(id: string): Promise<void> {
    await this.prisma.message.update({ where: { id }, data: { contactEnc: null, variablesEnc: null } });
  }

  // ── Accusés de livraison et messages entrants ──────────────────────────────

  /** Applique des accusés fournisseur ; idempotent (un accusé rejoué ne change rien). */
  async applyDeliveryEvents(provider: string, events: DeliveryEvent[]): Promise<number> {
    let applied = 0;
    for (const e of events) {
      const message = await this.prisma.message.findFirst({
        // L'accusé ne dit pas le mode : la référence fournisseur suffit à identifier le message.
        where: { provider, providerMessageId: e.providerMessageId, livemode: ANY_MODE },
      });
      if (!message) continue;
      const cost = e.cost ? { costMinor: BigInt(e.cost.amount), costCurrency: e.cost.currency } : {};
      if (e.status === 'failed') {
        if (message.status === 'DELIVERED' || message.status === 'READ') continue;
        if (Object.keys(cost).length) await this.prisma.message.update({ where: { id: message.id }, data: cost });
        await this.fail(message, e.failureReason ?? 'non_livre', false);
        applied++;
        continue;
      }
      const target: MessageStatus = e.status === 'read' ? 'READ' : e.status === 'delivered' ? 'DELIVERED' : 'SENT';
      if (RANK[target] <= RANK[message.status] || message.status === 'FAILED') continue;
      await this.prisma.message.update({
        where: { id: message.id },
        data: {
          status: target,
          ...cost,
          ...(target === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
          ...(target === 'READ' ? { readAt: new Date(), deliveredAt: message.deliveredAt ?? new Date() } : {}),
          ...(target !== 'SENT' ? { contactEnc: null, variablesEnc: null } : {}),
        },
      });
      applied++;
    }
    return applied;
  }

  /** Réponse STOP : désabonnement des messages marketing sur ce canal (§M9). */
  async applyInbound(channel: MessageChannel, inbound: InboundMessage[]): Promise<number> {
    let optOuts = 0;
    for (const m of inbound) {
      const word = m.text.trim().toUpperCase().split(/\s+/)[0] ?? '';
      if (!STOP_WORDS.has(word)) continue;
      let phone: string;
      try {
        phone = toE164(m.from);
      } catch {
        continue;
      }
      const destinationHash = new Uint8Array(deterministicHash(phone));
      const existing = await this.prisma.optOut.findFirst({ where: { merchantId: null, channel, destinationHash } });
      if (!existing) {
        await this.prisma.optOut.create({ data: { merchantId: null, channel, destinationHash, source: 'STOP' } });
        optOuts++;
      }
    }
    return optOuts;
  }

  // ── Lecture ────────────────────────────────────────────────────────────────

  /** Statut d'un envoi (toutes les tentatives du groupe), pour un marchand et un mode. */
  async status(id: string, merchantId: string, livemode: boolean) {
    // Jamais de lecture sans marchand : `merchantId: null` désignerait les messages internes d'AlphaPay.
    if (!merchantId) throw new ApiError(HttpStatus.NOT_FOUND, 'introuvable', 'Message introuvable');
    const attempts = await this.prisma.message.findMany({
      where: { groupId: id, merchantId, livemode },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        channel: true,
        status: true,
        destinationMasked: true,
        provider: true,
        lastError: true,
        creditsCharged: true,
        sentAt: true,
        deliveredAt: true,
        readAt: true,
        failedAt: true,
        createdAt: true,
      },
    });
    if (attempts.length === 0) throw new ApiError(HttpStatus.NOT_FOUND, 'introuvable', 'Message introuvable');
    const last = attempts[attempts.length - 1];
    return { id, status: last.status, channel: last.channel, to: last.destinationMasked, attempts };
  }
}
