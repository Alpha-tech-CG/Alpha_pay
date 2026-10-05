import { spawnSync } from "node:child_process";
import { prisma } from "@paybrain/database";
import { loadSecrets } from "../secrets/secrets-loader";

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
  await loadSecrets();

  // Verrou consultatif : une seule migration PayBrain à la fois (plusieurs tâches
  // ECS peuvent démarrer en parallèle).
  const [{ locked }] = await prisma.$queryRawUnsafe<Array<{ locked: boolean }>>(
    "SELECT pg_try_advisory_lock(hashtext('paybrain-production-migration')) AS locked",
  );
  if (!locked)
    throw new Error("Une autre migration PayBrain est deja en cours");

  try {
    // Migrations versionnées (packages/database/prisma/migrations) :
    //   0_init               -> schéma complet
    //   1_ledger_immutability -> triggers append-only + vue account_balances
    // `migrate deploy` est idempotent et n'applique que les migrations manquantes.
    const prismaCli = require.resolve("prisma/build/index.js");
    runStep("Application des migrations Prisma (schema + triggers ledger)", process.execPath, [
      prismaCli,
      "migrate",
      "deploy",
      "--schema=packages/database/prisma/schema.prisma",
    ]);
    console.log("Migrations Prisma appliquees (schema + immutabilite ledger)");

    // NOTE — reprise d'une ANCIENNE base (pré-centimes / email en clair) :
    // exécuter manuellement, AVANT ce script, les conversions de données
    // packages/database/sql/migrate-ledger-to-cents.mjs puis migrate-merchant-email.mjs.
    // Inutile (et non exécuté) pour une base neuve.
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
