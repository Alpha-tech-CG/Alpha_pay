import { HttpStatus } from '@nestjs/common';
import { ApiError } from '../errors/api-error';

/**
 * Pagination par curseur (§7) : ordre (created_at desc, id desc), stable même
 * si de nouvelles lignes arrivent pendant le parcours. Le curseur est opaque.
 */
export interface Cursor {
  createdAt: Date;
  id: string;
}

export function encodeCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`).toString('base64url');
}

export function decodeCursor(value?: string): Cursor | undefined {
  if (!value) return undefined;
  const [iso, id] = Buffer.from(value, 'base64url').toString('utf8').split('|');
  const createdAt = new Date(iso);
  if (!id || Number.isNaN(createdAt.getTime())) {
    throw new ApiError(HttpStatus.BAD_REQUEST, 'curseur_invalide', 'Curseur de pagination invalide', 'starting_after');
  }
  return { createdAt, id };
}

/** Filtre Prisma « strictement après le curseur » dans l'ordre (created_at desc, id desc). */
export function afterCursor(cursor?: Cursor) {
  if (!cursor) return {};
  return {
    OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }],
  };
}

export function parseLimit(value: unknown, fallback = 20, max = 100): number {
  const n = Number(value ?? fallback);
  if (!Number.isInteger(n) || n < 1 || n > max) {
    throw new ApiError(HttpStatus.BAD_REQUEST, 'validation_echouee', `limit : entier entre 1 et ${max}`, 'limit');
  }
  return n;
}

/** Page de résultats : on lit `limit + 1` lignes pour savoir s'il en reste. */
export function page<T extends { createdAt: Date; id: string }, R>(rows: T[], limit: number, map: (row: T) => R) {
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  return {
    object: 'list' as const,
    data: items.map(map),
    has_more: hasMore,
    next_cursor: hasMore ? encodeCursor(items[items.length - 1]) : null,
  };
}
