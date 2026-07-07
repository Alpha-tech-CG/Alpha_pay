import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const data = await req.formData();

    const fullName  = String(data.get('fullName')  ?? '').trim();
    const email     = String(data.get('email')      ?? '').trim();
    const phone     = String(data.get('phone')      ?? '').trim();
    const company   = String(data.get('company')    ?? '').trim();
    const website   = String(data.get('website')    ?? '').trim();
    const useCase   = String(data.get('useCase')    ?? '').trim();
    const idDocument = data.get('idDocument') as File | null;

    if (!fullName || !email || !phone || !company || !useCase) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (!idDocument) {
      return NextResponse.json({ error: 'ID document required' }, { status: 400 });
    }

    // Forward to internal API
    const internalApiUrl = process.env.INTERNAL_API_URL ?? 'http://localhost:3000';

    const payload = new FormData();
    payload.append('fullName', fullName);
    payload.append('email', email);
    payload.append('phone', phone);
    payload.append('company', company);
    payload.append('website', website);
    payload.append('useCase', useCase);
    payload.append('accountType', 'DEVELOPER');
    payload.append('idDocument', idDocument);

    const res = await fetch(`${internalApiUrl}/v1/onboarding/developer`, {
      method: 'POST',
      body: payload,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json(err, { status: res.status });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[onboarding/developer]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
