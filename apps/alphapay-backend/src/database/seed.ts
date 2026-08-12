import 'reflect-metadata';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import dataSource from './data-source';
import { User } from '../modules/users/entities/user.entity';
import { ApiKey } from '../modules/developer/entities/developer.entities';
import { Market } from '../common/types/market.enum';
import { AccountType } from '../common/types/account-type.enum';
import { ApiEnvironment } from '../common/types/enums';

/**
 * Seed de démo — crée un utilisateur Congo déjà vérifié (KYC niveau 2, pour que
 * les paiements locaux ET internationaux passent) et une clé API sandbox.
 * Idempotent : ré-exécutable sans doublon d'utilisateur.
 *   npm run db:seed
 */
async function main() {
  await dataSource.initialize();
  const users = dataSource.getRepository(User);
  const keys = dataSource.getRepository(ApiKey);

  const phone = '+242060000001';
  let user = await users.findOne({ where: { phoneNumber: phone } });
  if (!user) {
    user = users.create({ phoneNumber: phone, market: Market.CONGO, accountType: AccountType.DEVELOPER });
  }
  user.kycLevel = 2;
  user.kycVerified = true;
  user.accountType = AccountType.DEVELOPER;
  user = await users.save(user);

  // Clé API sandbox (raffichée en clair une seule fois, ici).
  const raw = `alp_sk_test_${randomBytes(24).toString('hex')}`;
  await keys.save(
    keys.create({
      userId: user.id,
      name: 'Seed sandbox key',
      keyHash: await bcrypt.hash(raw, 10),
      keyPrefix: 'alp_sk_test',
      environment: ApiEnvironment.SANDBOX,
      scopes: ['payments:read', 'payments:write'],
    }),
  );

  console.log('── AlphaPay seed ──────────────────────────────');
  console.log(`  Utilisateur : ${phone}  (KYC niveau 2, ${user.id})`);
  console.log(`  OTP (dev)   : 123456`);
  console.log(`  Clé API     : ${raw}`);
  console.log('───────────────────────────────────────────────');
  await dataSource.destroy();
}

main().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
