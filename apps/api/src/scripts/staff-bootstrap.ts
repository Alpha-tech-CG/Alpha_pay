/**
 * Crée un compte du personnel AlphaPay (typiquement le premier super-administrateur).
 * Le mot de passe, aléatoire, n'est affiché qu'une fois ; l'application
 * d'authentification (TOTP) est enrôlée à la première connexion au back-office.
 *
 *   pnpm --filter @paybrain/api staff:create agent@alphapay.cg SUPER_ADMIN "Prénom Nom"
 *
 * Rôles : SUPPORT (lecture), COMPLIANCE (KYB, suspension), SUPER_ADMIN (tout).
 */
import { prisma, StaffRole } from '@paybrain/database';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { loadSecrets } from '../secrets/secrets-loader';

async function main() {
  // Production : DATABASE_URL vient du fichier de secrets monté (SECRETS_FILE).
  await loadSecrets();
  const [email, roleArg = 'SUPER_ADMIN', ...name] = process.argv.slice(2);
  const role = roleArg.toUpperCase() as StaffRole;
  if (!email || !/^[^@\s]+@[^@\s]+$/.test(email) || !Object.values(StaffRole).includes(role)) {
    console.error('Usage : staff:create <email> [SUPPORT|COMPLIANCE|SUPER_ADMIN] [nom affiché]');
    process.exit(2);
  }
  const normalized = email.trim().toLowerCase();
  if (await prisma.staffUser.findUnique({ where: { email: normalized } })) {
    console.error(`Un agent ${normalized} existe déjà.`);
    process.exit(1);
  }
  const password = randomBytes(18).toString('base64url');
  await prisma.staffUser.create({
    data: { email: normalized, displayName: name.join(' ') || normalized, role, passwordHash: await bcrypt.hash(password, 12) },
  });
  console.log(`Agent créé : ${normalized} (${role})`);
  console.log(`Mot de passe provisoire, à transmettre de façon sûre puis à ne pas conserver : ${password}`);
  console.log('À la première connexion, le back-office demandera d’enrôler une application d’authentification.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
