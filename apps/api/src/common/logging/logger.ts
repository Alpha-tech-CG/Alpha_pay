import { LoggerService } from '@nestjs/common';
import pino from 'pino';
import { maskPii, REDACTED_PATHS } from './mask';
import { currentRequestId } from './request-context';

/**
 * Journal structuré JSON (§8.4, D-011) : une ligne par événement, avec
 * `request_id` propagé automatiquement, champs sensibles retirés et données
 * personnelles masquées dans les messages.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  base: { service: process.env.SERVICE_NAME ?? 'alphapay-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
  messageKey: 'message',
  formatters: { level: (label) => ({ level: label }) },
  redact: { paths: REDACTED_PATHS, censor: '[masqué]' },
  mixin() {
    const requestId = currentRequestId();
    return requestId ? { request_id: requestId } : {};
  },
  hooks: {
    logMethod(args, method) {
      const masked = args.map((a) => (typeof a === 'string' ? maskPii(a) : a)) as Parameters<typeof method>;
      return method.apply(this, masked);
    },
  },
});

function format(message: unknown): string {
  if (typeof message === 'string') return message;
  if (message instanceof Error) return message.message;
  try {
    return JSON.stringify(message);
  } catch {
    return String(message);
  }
}

/** Adaptateur Nest : `new Logger(Contexte)` écrit dans le journal JSON. */
export class JsonNestLogger implements LoggerService {
  private write(level: 'info' | 'warn' | 'error' | 'debug' | 'trace', message: unknown, params: unknown[]) {
    const context = typeof params[params.length - 1] === 'string' ? (params.pop() as string) : undefined;
    const extra: Record<string, unknown> = {};
    if (context) extra.context = context;
    if (level === 'error' && typeof params[0] === 'string' && params[0].includes('\n')) extra.stack = params[0];
    if (message !== null && typeof message === 'object' && !(message instanceof Error)) {
      logger[level]({ ...extra, ...(message as object) });
      return;
    }
    logger[level](extra, format(message));
  }

  log(message: unknown, ...params: unknown[]) {
    this.write('info', message, params);
  }
  error(message: unknown, ...params: unknown[]) {
    this.write('error', message, params);
  }
  warn(message: unknown, ...params: unknown[]) {
    this.write('warn', message, params);
  }
  debug(message: unknown, ...params: unknown[]) {
    this.write('debug', message, params);
  }
  verbose(message: unknown, ...params: unknown[]) {
    this.write('trace', message, params);
  }
}
