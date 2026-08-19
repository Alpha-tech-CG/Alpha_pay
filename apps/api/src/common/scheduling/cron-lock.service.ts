import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@paybrain/database';

/**
 * Verrou d'exclusion pour les tâches planifiées (@Cron).
 *
 * `@nestjs/schedule` exécute chaque cron sur CHAQUE instance. En production on
 * tourne plusieurs tâches ECS/pods → sans garde, un job quotidien (settlement,
 * réconciliation…) s'exécute N fois en parallèle. Pour le settlement c'est un
 * DOUBLE REVERSEMENT au marchand (batchNumber aléatoire, aucune contrainte
 * unique sur la période).
 *
 * On réutilise la primitive déjà employée pour le verrou de migration
 * (`pg_try_advisory_*lock(hashtext(...))`, cf. scripts/migrate.ts) : ici en
 * variante `xact` (portée transaction) pour que le verrou soit AUTOMATIQUEMENT
 * libéré à la fin de la transaction — y compris si l'instance crashe pendant le
 * job. Une seule instance obtient le verrou et exécute ; les autres passent.
 *
 * Note d'échelle : le job tourne pendant que la transaction porteuse reste
 * ouverte (connexion idle-in-transaction). Acceptable pour des jobs nocturnes
 * courts ; à volume élevé, migrer les crons vers un worker leader unique ou une
 * file (BullMQ) reste la cible.
 */
@Injectable()
export class CronLockService {
  private readonly logger = new Logger(CronLockService.name);

  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  /**
   * Exécute `job` seulement si cette instance obtient le verrou nommé.
   * @returns true si le job a tourné ici, false s'il était déjà tenu ailleurs.
   */
  async runExclusive(
    lockName: string,
    job: () => Promise<void>,
    opts?: { timeoutMs?: number },
  ): Promise<boolean> {
    const timeout = opts?.timeoutMs ?? 10 * 60_000; // 10 min : borne le job nocturne
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRawUnsafe<Array<{ locked: boolean }>>(
          'SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked',
          lockName,
        );
        if (!rows[0]?.locked) {
          this.logger.debug(`Cron « ${lockName} » déjà tenu par une autre instance — ignoré ici.`);
          return false;
        }
        await job();
        return true;
      },
      { timeout, maxWait: 5_000 },
    );
  }
}
