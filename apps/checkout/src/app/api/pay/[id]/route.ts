import { NextRequest, NextResponse } from 'next/server';
import { INTERNAL_API_URL } from '@/lib/api';

/**
 * Proxy du paiement wallet vers l'API interne (jamais exposée au navigateur).
 * Transmet l'IP client pour que le rate limit par-IP de l'API reste pertinent.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ message: 'Requête invalide' }, { status: 400 });
  }

  const body = payload as { phone?: unknown; pin?: unknown; idempotencyKey?: unknown };
  if (typeof body.phone !== 'string' || typeof body.pin !== 'string') {
    return NextResponse.json({ message: 'Numéro et PIN requis' }, { status: 400 });
  }

  const clientIp =
    req.headers.get('x-forwarded-for') ??
    req.headers.get('x-real-ip') ??
    '';

  let res: Response;
  try {
    res = await fetch(`${INTERNAL_API_URL}/v1/checkout/paylinks/${encodeURIComponent(id)}/wallet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(clientIp ? { 'X-Forwarded-For': clientIp } : {}),
      },
      body: JSON.stringify({
        phone: body.phone,
        pin: body.pin,
        ...(typeof body.idempotencyKey === 'string' ? { idempotencyKey: body.idempotencyKey } : {}),
      }),
    });
  } catch {
    return NextResponse.json({ message: 'Service de paiement indisponible, réessayez.' }, { status: 502 });
  }

  const data = await res.json().catch(() => ({}));
  // On ne relaie que des messages destinés à l'utilisateur, jamais de détail interne.
  if (!res.ok) {
    const message = typeof data?.message === 'string' ? data.message : 'Paiement refusé.';
    return NextResponse.json({ message }, { status: res.status });
  }
  return NextResponse.json({ ok: true, ...data });
}
