import { NextResponse } from 'next/server';
import { prisma } from '@paybrain/database';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  try {
    const { email, locale, company } = await req.json();

    // Honeypot anti-spam : un bot remplit `company`, un humain ne le voit pas.
    if (company) return NextResponse.json({ ok: true });

    if (typeof email !== 'string' || !EMAIL_RE.test(email) || email.length > 200) {
      return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
    }

    await prisma.waitlistEntry.upsert({
      where: { email: email.toLowerCase() },
      update: {},
      create: { email: email.toLowerCase(), locale: locale === 'en' ? 'en' : 'fr' },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
