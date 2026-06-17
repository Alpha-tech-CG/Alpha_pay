import { NextResponse } from 'next/server';
import { prisma } from '@paybrain/database';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  try {
    const { name, email, message, company } = await req.json();

    if (company) return NextResponse.json({ ok: true }); // honeypot

    if (
      typeof name !== 'string' || name.trim().length === 0 || name.length > 120 ||
      typeof email !== 'string' || !EMAIL_RE.test(email) ||
      typeof message !== 'string' || message.trim().length === 0 || message.length > 4000
    ) {
      return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    }

    await prisma.contactMessage.create({
      data: { name: name.trim(), email: email.toLowerCase(), message: message.trim() },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
