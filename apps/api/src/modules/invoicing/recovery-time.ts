/**
 * Heure de Brazzaville (§8.5) : Africa/Brazzaville = UTC+1 toute l'année (pas
 * d'heure d'été). Stockage en UTC, planification des relances en heure locale.
 */
export const BRAZZAVILLE_OFFSET_H = 1;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface SendWindow {
  fromHour: number; // incluse
  untilHour: number; // exclue
}

export const DEFAULT_WINDOW: SendWindow = { fromHour: 8, untilHour: 19 };

/** Date locale (AAAA-MM-JJ) à Brazzaville d'un instant UTC. */
export function localDate(at: Date): string {
  return new Date(at.getTime() + BRAZZAVILLE_OFFSET_H * HOUR).toISOString().slice(0, 10);
}

/** Instant UTC correspondant à `hour` h locale le jour `date` (AAAA-MM-JJ) décalé de `days`. */
export function localAt(date: string, hour: number, days = 0): Date {
  const midnightUtc = Date.parse(`${date}T00:00:00.000Z`);
  return new Date(midnightUtc + days * DAY + (hour - BRAZZAVILLE_OFFSET_H) * HOUR);
}

/** Heure locale (0-23) d'un instant UTC. */
export function localHour(at: Date): number {
  return new Date(at.getTime() + BRAZZAVILLE_OFFSET_H * HOUR).getUTCHours();
}

/** L'instant tombe-t-il dans la plage d'envoi ? */
export function inWindow(at: Date, w: SendWindow): boolean {
  const h = localHour(at);
  return h >= w.fromHour && h < w.untilHour;
}

/** Prochain instant d'envoi autorisé à partir de `at` (lui-même s'il est dans la plage). */
export function nextInWindow(at: Date, w: SendWindow): Date {
  if (inWindow(at, w)) return at;
  const day = localDate(at);
  return localHour(at) < w.fromHour ? localAt(day, w.fromHour) : localAt(day, w.fromHour, 1);
}

/**
 * Instant d'une relance J+offset par rapport à l'échéance `dueDate` : début de
 * la plage d'envoi ce jour-là. Si ce jour est aujourd'hui et que la plage est
 * entamée, l'envoi part dès maintenant ; un jour déjà passé ne donne rien.
 */
export function reminderTime(dueDate: Date, offsetDays: number, w: SendWindow, now = new Date()): Date | null {
  const due = dueDate.toISOString().slice(0, 10);
  const start = localAt(due, w.fromHour, offsetDays);
  const end = localAt(due, w.untilHour, offsetDays);
  if (end.getTime() <= now.getTime()) return null;
  return start.getTime() < now.getTime() ? now : start;
}
