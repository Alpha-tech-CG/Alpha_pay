import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PartnerStatus, PartnerType, PrismaClient } from '@paybrain/database';
import { encryptField } from '../../common/security/pii-crypto';
import { CreatePartnerDto, UpdatePartnerDto, UpsertCredentialDto } from './dto/partner.dto';

/**
 * Gestion des partenaires financiers (banques, opérateurs, réseaux carte).
 * Un partenaire = un adapter côté orchestration. Les credentials sont chiffrés
 * au repos et jamais renvoyés en clair.
 */
@Injectable()
export class PartnersService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  list(type?: PartnerType, status?: PartnerStatus) {
    return this.prisma.partner.findMany({
      where: { ...(type ? { type } : {}), ...(status ? { status } : {}) },
      orderBy: { code: 'asc' },
    });
  }

  async get(id: string) {
    const partner = await this.prisma.partner.findUnique({
      where: { id },
      include: {
        // Jamais la valeur déchiffrée : uniquement les métadonnées du credential.
        credentials: { select: { id: true, environment: true, keyName: true, createdAt: true }, orderBy: { keyName: 'asc' } },
        _count: { select: { routingRules: true } },
      },
    });
    if (!partner) throw new NotFoundException('Partenaire introuvable');
    return partner;
  }

  async create(dto: CreatePartnerDto) {
    try {
      return await this.prisma.partner.create({ data: dto });
    } catch (err: any) {
      if (err?.code === 'P2002') throw new ConflictException('Un partenaire avec ce code existe déjà');
      throw err;
    }
  }

  async update(id: string, dto: UpdatePartnerDto) {
    await this.assertExists(id);
    return this.prisma.partner.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.assertExists(id);
    // Refuse la suppression si des règles de routage pointent encore dessus.
    const rules = await this.prisma.routingRule.count({ where: { partnerId: id } });
    if (rules > 0) {
      throw new ConflictException(`Partenaire référencé par ${rules} règle(s) de routage — retirez-les d'abord`);
    }
    await this.prisma.partner.delete({ where: { id } });
    return { ok: true };
  }

  async setCredential(id: string, dto: UpsertCredentialDto) {
    await this.assertExists(id);
    const valueEncrypted = new Uint8Array(encryptField(dto.value));
    await this.prisma.partnerCredential.upsert({
      where: { partnerId_environment_keyName: { partnerId: id, environment: dto.environment, keyName: dto.keyName } },
      update: { valueEncrypted },
      create: { partnerId: id, environment: dto.environment, keyName: dto.keyName, valueEncrypted },
    });
    return { ok: true };
  }

  async removeCredential(id: string, credentialId: string) {
    const deleted = await this.prisma.partnerCredential.deleteMany({ where: { id: credentialId, partnerId: id } });
    if (deleted.count === 0) throw new NotFoundException('Credential introuvable');
    return { ok: true };
  }

  /**
   * Health check du partenaire. Le vrai ping réseau se fera via l'adapter dédié
   * (Phase B) ; pour l'instant on vérifie que l'environnement cible est bien
   * configuré (baseUrl + au moins un credential), ce qui suffit au back-office.
   */
  async health(id: string, environment = 'production') {
    const partner = await this.prisma.partner.findUnique({
      where: { id },
      include: { credentials: { where: { environment }, select: { keyName: true } } },
    });
    if (!partner) throw new NotFoundException('Partenaire introuvable');
    const baseUrl = environment === 'production' ? partner.prodBaseUrl : partner.sandboxBaseUrl;
    return {
      partnerId: partner.id,
      code: partner.code,
      status: partner.status,
      environment,
      baseUrlSet: Boolean(baseUrl),
      credentialKeys: partner.credentials.map((c) => c.keyName),
      configured: Boolean(baseUrl) && partner.credentials.length > 0,
      checkedAt: new Date().toISOString(),
    };
  }

  private async assertExists(id: string) {
    const partner = await this.prisma.partner.findUnique({ where: { id }, select: { id: true } });
    if (!partner) throw new NotFoundException('Partenaire introuvable');
  }
}
