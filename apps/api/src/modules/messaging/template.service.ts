import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessageChannel, MessageTemplate, PrismaClient } from '@paybrain/database';
import { TEMPLATE_CATALOG } from './templates.catalog';

export class MissingTemplateError extends Error {
  constructor(key: string, channel: MessageChannel) {
    super(`Modèle ${key} introuvable pour le canal ${channel}`);
    this.name = 'MissingTemplateError';
  }
}

export class MissingVariableError extends Error {
  constructor(name: string) {
    super(`Variable de modèle manquante : ${name}`);
    this.name = 'MissingVariableError';
  }
}

export interface RenderedMessage {
  subject?: string;
  text: string;
  whatsapp?: { name: string; variables: string[] };
}

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** Remplace les {{variables}} ; une variable absente est une erreur, jamais un trou silencieux. */
export function interpolate(text: string, variables: Record<string, string>): string {
  return text.replace(PLACEHOLDER, (_m, name: string) => {
    const v = variables[name];
    if (v === undefined || v === null) throw new MissingVariableError(name);
    return String(v);
  });
}

export function renderTemplate(template: Pick<MessageTemplate, 'subject' | 'body' | 'whatsappTemplateName' | 'variables'>, variables: Record<string, string>): RenderedMessage {
  return {
    ...(template.subject ? { subject: interpolate(template.subject, variables) } : {}),
    text: interpolate(template.body, variables),
    ...(template.whatsappTemplateName
      ? {
          whatsapp: {
            name: template.whatsappTemplateName,
            variables: template.variables.map((name) => {
              const v = variables[name];
              if (v === undefined) throw new MissingVariableError(name);
              return String(v);
            }),
          },
        }
      : {}),
  };
}

/** Modèles versionnés : la version active la plus récente fait foi. */
@Injectable()
export class TemplateService implements OnModuleInit {
  private readonly logger = new Logger(TemplateService.name);

  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  async onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    await this.syncCatalog().catch((err) => this.logger.warn(`Synchronisation des modèles impossible : ${err?.message}`));
  }

  /** Ajoute en base les modèles du catalogue absents (jamais de modification en place). */
  async syncCatalog(): Promise<number> {
    const res = await this.prisma.messageTemplate.createMany({
      data: TEMPLATE_CATALOG.map((t) => ({
        key: t.key,
        channel: t.channel,
        locale: 'fr',
        version: t.version,
        category: t.category,
        subject: t.subject ?? null,
        body: t.body,
        whatsappTemplateName: t.whatsappTemplateName ?? null,
        variables: t.variables ?? [],
      })),
      skipDuplicates: true,
    });
    return res.count;
  }

  async get(key: string, channel: MessageChannel, version?: number, locale = 'fr'): Promise<MessageTemplate> {
    const template = await this.prisma.messageTemplate.findFirst({
      where: { key, channel, locale, ...(version ? { version } : { active: true }) },
      orderBy: { version: 'desc' },
    });
    if (!template) throw new MissingTemplateError(key, channel);
    return template;
  }

  /** Canaux pour lesquels un modèle actif existe. */
  async channelsFor(key: string, locale = 'fr'): Promise<MessageChannel[]> {
    const rows = await this.prisma.messageTemplate.findMany({
      where: { key, locale, active: true },
      select: { channel: true },
      distinct: ['channel'],
    });
    return rows.map((r) => r.channel);
  }
}
