import type { Prisma } from '@paybrain/database';

export type DocumentKind = 'invoice' | 'receipt';

const PREFIX: Record<DocumentKind, string> = { invoice: 'FAC', receipt: 'REC' };

/**
 * Numéro suivant, sans trou ni doublon (§M7) : une série par marchand, par type
 * de document et par mode. À appeler DANS la transaction qui crée le document :
 * l'upsert verrouille la ligne du compteur jusqu'à la validation, donc deux
 * créations concurrentes sont sérialisées, et un échec annule aussi
 * l'incrément (pas de numéro perdu).
 */
export async function nextDocumentNumber(
  db: Prisma.TransactionClient,
  merchantId: string,
  kind: DocumentKind,
  livemode: boolean,
): Promise<string> {
  const rows = await db.$queryRaw<{ last_seq: number }[]>`
    INSERT INTO document_counters (merchant_id, kind, livemode, last_seq)
    VALUES (${merchantId}, ${kind}, ${livemode}, 1)
    ON CONFLICT (merchant_id, kind, livemode) DO UPDATE SET last_seq = document_counters.last_seq + 1
    RETURNING last_seq`;
  return formatDocumentNumber(kind, livemode, rows[0].last_seq);
}

/** FAC-000042 en live, FAC-T-000042 en test (jamais confondus sur un document imprimé). */
export function formatDocumentNumber(kind: DocumentKind, livemode: boolean, seq: number): string {
  return `${PREFIX[kind]}-${livemode ? '' : 'T-'}${String(seq).padStart(6, '0')}`;
}
