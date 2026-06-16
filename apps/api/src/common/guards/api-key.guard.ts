import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaClient } from '@paybrain/database';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];

    if (!apiKey) throw new UnauthorizedException('X-API-Key manquant');

    const merchant = await this.prisma.merchant.findUnique({
      where: { apiKey, isActive: true },
      select: { id: true, name: true },
    });

    if (!merchant) throw new UnauthorizedException('Clé API invalide');

    request.merchant = merchant;
    return true;
  }
}
