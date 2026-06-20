// Chiffre les emails Merchant existants puis supprime la colonne en clair.
import {
  deterministicHash,
  encryptField,
  normalizeEmail,
} from "@paybrain/shared";
import { prisma } from "../dist/index.js";

const columns = await prisma.$queryRawUnsafe(`
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = current_schema() AND table_name = 'merchants'
`);
const names = new Set(columns.map((row) => row.column_name));

if (names.has("email")) {
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(
        "ALTER TABLE merchants ADD COLUMN IF NOT EXISTS email_encrypted BYTEA",
      );
      await tx.$executeRawUnsafe(
        "ALTER TABLE merchants ADD COLUMN IF NOT EXISTS email_hash BYTEA",
      );

      const merchants = await tx.$queryRawUnsafe(`
      SELECT id, email, email_encrypted, email_hash FROM merchants ORDER BY id
    `);
      const seen = new Set();
      for (const merchant of merchants) {
        const email = normalizeEmail(merchant.email);
        const emailHash = deterministicHash(email);
        const hashKey = emailHash.toString("hex");
        if (seen.has(hashKey)) {
          throw new Error(
            `Emails marchands dupliques apres normalisation (merchant ${merchant.id})`,
          );
        }
        seen.add(hashKey);
        if (
          merchant.email_hash &&
          !Buffer.from(merchant.email_hash).equals(emailHash)
        ) {
          throw new Error(`Hash email incoherent pour merchant ${merchant.id}`);
        }
        if (merchant.email_encrypted && merchant.email_hash) continue;
        await tx.$executeRawUnsafe(
          "UPDATE merchants SET email_encrypted = $1, email_hash = $2 WHERE id = $3",
          encryptField(email),
          emailHash,
          merchant.id,
        );
      }

      const [{ missing }] = await tx.$queryRawUnsafe(`
      SELECT COUNT(*)::int AS missing FROM merchants
      WHERE email_encrypted IS NULL OR email_hash IS NULL
    `);
      if (missing !== 0)
        throw new Error(`${missing} email(s) marchand non migre(s)`);

      // Contract explicite apres verification : evite --accept-data-loss sur le
      // db push global. Cette etape doit tourner pendant l'arret des anciennes
      // tasks, dont le client Prisma attend encore la colonne email.
      await tx.$executeRawUnsafe(`
      ALTER TABLE merchants
        ALTER COLUMN email_encrypted SET NOT NULL,
        ALTER COLUMN email_hash SET NOT NULL,
        DROP COLUMN email
    `);
    },
    { timeout: 120_000 },
  );
}

console.log("Emails marchands chiffres (conversion appliquee ou deja a jour)");
await prisma.$disconnect();
