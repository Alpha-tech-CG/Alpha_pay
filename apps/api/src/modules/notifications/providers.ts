import { Logger } from '@nestjs/common';
import { RenderedTemplate } from './templates';

export interface SendResult {
  ok: boolean;
  error?: string;
  stubbed?: boolean;
}

const TIMEOUT_MS = 10_000;
const logger = new Logger('NotificationProviders');

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** SMS via Africa's Talking (gated AT_API_KEY + AT_USERNAME). */
export async function sendSms(to: string, rendered: RenderedTemplate): Promise<SendResult> {
  const apiKey = process.env.AT_API_KEY;
  const username = process.env.AT_USERNAME;
  if (!apiKey || !username) {
    logger.debug(`SMS (stub) -> ${to}: ${rendered.body}`);
    return { ok: true, stubbed: true };
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch('https://api.africastalking.com/version1/messaging', {
      method: 'POST',
      headers: { apiKey, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username, to, message: rendered.body }).toString(),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) return { ok: false, error: `Africa's Talking HTTP ${res.status}` };
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.name === 'AbortError' ? 'timeout' : (err?.message ?? 'erreur SMS') };
  }
}

/** Email via Postmark (gated POSTMARK_TOKEN + POSTMARK_FROM). */
export async function sendEmail(to: string, rendered: RenderedTemplate): Promise<SendResult> {
  const token = process.env.POSTMARK_TOKEN;
  const from = process.env.POSTMARK_FROM;
  if (!token || !from) {
    logger.debug(`EMAIL (stub) -> ${to}: [${rendered.subject}] ${rendered.body}`);
    return { ok: true, stubbed: true };
  }
  try {
    const res = await postJson(
      'https://api.postmarkapp.com/email',
      { 'X-Postmark-Server-Token': token, Accept: 'application/json', 'Content-Type': 'application/json' },
      { From: from, To: to, Subject: rendered.subject, TextBody: rendered.body },
    );
    if (!res.ok) return { ok: false, error: `Postmark HTTP ${res.status}` };
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.name === 'AbortError' ? 'timeout' : (err?.message ?? 'erreur email') };
  }
}
