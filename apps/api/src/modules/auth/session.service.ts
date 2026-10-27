import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { PrismaClient, Session } from '@paybrain/database';
import { ApiError } from '../../common/errors/api-error';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_DAYS = 30;

export interface AccessTokenPayload {
  sub: string; // utilisateur
  sid: string; // session
  typ: 'access';
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function ipHash(ip?: string | null): Uint8Array<ArrayBuffer> | null {
  return ip ? new Uint8Array(createHash('sha256').update(ip).digest()) : null;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  session: Session;
}

/**
 * Sessions (§M1) : jeton d'accès court (JWT 15 min) + jeton de
 * rafraîchissement opaque (30 j), stocké haché et renouvelé à chaque usage.
 * Rejouer un ancien jeton de rafraîchissement révoque la session (vol présumé).
 * Toute requête authentifiée revérifie la session : une révocation est immédiate.
 */
@Injectable()
export class SessionService {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly jwt: JwtService,
  ) {}

  private signAccess(userId: string, sessionId: string): string {
    const payload: AccessTokenPayload = { sub: userId, sid: sessionId, typ: 'access' };
    return this.jwt.sign(payload, { expiresIn: ACCESS_TOKEN_TTL_SECONDS });
  }

  async create(userId: string, context: { userAgent?: string; ip?: string } = {}): Promise<IssuedTokens> {
    const refreshToken = randomBytes(32).toString('base64url');
    const session = await this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash: hashToken(refreshToken),
        userAgent: context.userAgent?.slice(0, 200) ?? null,
        ipHash: ipHash(context.ip),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 3600 * 1000),
      },
    });
    return { accessToken: this.signAccess(userId, session.id), refreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS, session };
  }

  /** Renouvelle les jetons ; un jeton déjà utilisé révoque la session. */
  async rotate(refreshToken: string): Promise<IssuedTokens> {
    const invalid = () => new ApiError(HttpStatus.UNAUTHORIZED, 'session_invalide', 'Session expirée : reconnectez-vous.');
    if (!refreshToken) throw invalid();
    const hash = hashToken(refreshToken);

    const reused = await this.prisma.session.findUnique({ where: { previousTokenHash: hash } });
    if (reused) {
      await this.revoke(reused.id, 'jeton_rejoue');
      throw invalid();
    }

    const session = await this.prisma.session.findUnique({ where: { refreshTokenHash: hash }, include: { user: true } });
    if (!session || session.revokedAt || session.expiresAt < new Date() || session.user.status !== 'ACTIVE') throw invalid();

    const next = randomBytes(32).toString('base64url');
    // Mise à jour conditionnelle : deux rafraîchissements simultanés ne gagnent pas tous les deux.
    const updated = await this.prisma.session.updateMany({
      where: { id: session.id, refreshTokenHash: hash, revokedAt: null },
      data: { refreshTokenHash: hashToken(next), previousTokenHash: hash, lastUsedAt: new Date() },
    });
    if (updated.count !== 1) throw invalid();
    const fresh = await this.prisma.session.findUniqueOrThrow({ where: { id: session.id } });
    return { accessToken: this.signAccess(session.userId, session.id), refreshToken: next, expiresIn: ACCESS_TOKEN_TTL_SECONDS, session: fresh };
  }

  async revoke(sessionId: string, reason: string): Promise<void> {
    await this.prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: reason } });
  }

  /** Révoque toutes les sessions d'un utilisateur (sauf `exceptId`) ; renvoie leur nombre. */
  async revokeAll(userId: string, reason: string, exceptId?: string): Promise<number> {
    const res = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return res.count;
  }

  /** Vérifie un jeton d'accès ET que sa session est toujours active. */
  async authenticate(accessToken: string): Promise<{ userId: string; sessionId: string }> {
    const unauthorized = () => new ApiError(HttpStatus.UNAUTHORIZED, 'non_authentifie', 'Authentification requise');
    let payload: AccessTokenPayload;
    try {
      payload = this.jwt.verify<AccessTokenPayload>(accessToken);
    } catch {
      throw unauthorized();
    }
    if (payload.typ !== 'access' || !payload.sid || !payload.sub) throw unauthorized();
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      select: { userId: true, revokedAt: true, expiresAt: true, user: { select: { status: true } } },
    });
    if (!session || session.userId !== payload.sub || session.revokedAt || session.expiresAt < new Date() || session.user.status !== 'ACTIVE') {
      throw unauthorized();
    }
    return { userId: payload.sub, sessionId: payload.sid };
  }

  async listActive(userId: string) {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      select: { id: true, userAgent: true, createdAt: true, lastUsedAt: true },
    });
  }
}
