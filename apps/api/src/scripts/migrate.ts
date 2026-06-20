import { spawnSync } from "node:child_process";
import { applyLedgerTriggers, prisma } from "@paybrain/database";
import { loadSecretsFromAws } from "../secrets/secrets-loader";

function runStep(label: string, command: string, args: string[]): void {
  console.log(`[migration] ${label}`);
  const result = spawnSync(command, args, {
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${label} a echoue avec le code ${result.status ?? "inconnu"}`,
    );
  }
}

async function migrate(): Promise<void> {
  await loadSecretsFromAws();

  const [{ locked }] = await prisma.$queryRawUnsafe<Array<{ locked: boolean }>>(
    "SELECT pg_try_advisory_lock(hashtext('paybrain-production-migration')) AS locked",
  );
  if (!locked)
    throw new Error("Une autre migration PayBrain est deja en cours");

  try {
    // Ces conversions sont idempotentes et doivent preceder db push : Prisma ne
    // peut ni chiffrer les emails existants, ni recalculer la chaine du ledger.
    runStep("Conversion du ledger en centimes", process.execPath, [
      "packages/database/sql/migrate-ledger-to-cents.mjs",
    ]);
    runStep("Chiffrement des emails marchands", process.execPath, [
      "packages/database/sql/migrate-merchant-email.mjs",
    ]);

    const prismaCli = require.resolve("prisma/build/index.js");
    runStep("Application du schema Prisma", process.execPath, [
      prismaCli,
      "db",
      "push",
      "--skip-generate",
      "--schema=packages/database/prisma/schema.prisma",
    ]);

    await applyLedgerTriggers(prisma);
    console.log("Schema Prisma et triggers ledger appliques");
  } finally {
    await prisma.$queryRawUnsafe(
      "SELECT pg_advisory_unlock(hashtext('paybrain-production-migration'))",
    );
    await prisma.$disconnect();
  }
}

migrate().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
