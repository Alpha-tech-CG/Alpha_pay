import { Controller, Get, NotFoundException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { KvStore } from '../../common/kv/kv-store';
import { DEV_OUTBOX_KEY, devOutboxEnabled } from './messaging-providers';

/**
 * Boîte d'envoi de développement : ce que les fournisseurs FACTICES auraient
 * envoyé (y compris les codes OTP), pour tester en local sans compte externe.
 * Inexistante en production.
 */
@ApiExcludeController()
@Controller('dev/outbox')
export class DevOutboxController {
  constructor(private readonly kv: KvStore) {}

  @Get()
  async list() {
    if (!devOutboxEnabled()) throw new NotFoundException();
    const items = await this.kv.list(DEV_OUTBOX_KEY, 50);
    return { data: items.map((i) => JSON.parse(i)) };
  }
}
