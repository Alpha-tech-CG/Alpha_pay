import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@paybrain/database';
import { generateApiKey, hashApiKeySecret } from '../../common/security/api-key';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@Injectable()
export class ApiKeysService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  /** Liste les clés du marchand — jamais de secret, juste les métadonnées. */
  async list(merchantId: string) {
    const keys = await this.prisma.apiKey.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, mode: true, prefix: true, scopes: true,
        ipAllowlist: true, lastUsedAt: true, revokedAt: true, createdAt: true,
      },
    });
    return keys.map((k) => ({ ...k, revoked: k.revokedAt != null }));
  }

  /** Crée une clé et renvoie le secret EN CLAIR une seule fois. */
  async create(merchantId: string, dto: CreateApiKeyDto) {
    const mode = dto.mode ?? 'test';
    const { full, prefix, secret } = generateApiKey(mode);
    const record = await this.prisma.apiKey.create({
      data: {
        merchantId,
        name: dto.name,
        mode: mode === 'live' ? 'LIVE' : 'TEST',
        prefix,
        hashedSecret: hashApiKeySecret(secret),
        scopes: dto.scopes ?? [],
        ipAllowlist: dto.ipAllowlist ?? [],
      },
      select: { id: true, name: true, mode: true, prefix: true, scopes: true, ipAllowlist: true, createdAt: true },
    });
    // `key` n'est renvoyé qu'ici, jamais re-consultable.
    return { ...record, key: full };
  }

  async revoke(merchantId: string, id: string) {
    const key = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!key) throw new NotFoundException('Clé introuvable');
    if (key.merchantId !== merchantId) throw new ForbiddenException();
    if (key.revokedAt) return { id, revoked: true };
    await this.prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
    return { id, revoked: true };
  }

  /** Rotation : révoque l'ancienne, en crée une nouvelle (mêmes attributs). */
  async rotate(merchantId: string, id: string) {
    const old = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!old) throw new NotFoundException('Clé introuvable');
    if (old.merchantId !== merchantId) throw new ForbiddenException();

    await this.prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
    return this.create(merchantId, {
      name: `${old.name} (rotated)`,
      mode: old.mode === 'LIVE' ? 'live' : 'test',
      scopes: old.scopes,
      ipAllowlist: old.ipAllowlist,
    });
  }
}
