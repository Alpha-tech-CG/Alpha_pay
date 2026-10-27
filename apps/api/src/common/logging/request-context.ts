import { AsyncLocalStorage } from 'async_hooks';

/** Contexte propagé dans toute la chaîne d'une requête (ou d'une tâche de file). */
export interface RequestContext {
  requestId: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function currentRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}

/** Exécute `fn` avec un identifiant de corrélation (ex. id de tâche BullMQ). */
export function runWithRequestId<T>(requestId: string, fn: () => T): T {
  return requestContext.run({ requestId }, fn);
}
