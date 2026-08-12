'use client';
import { useState } from 'react';
import { Copy } from 'lucide-react';
import { docsSections } from '@/lib/mock-data';
import { cn } from '@/lib/utils';

const LANGS = ['Node.js', 'Python', 'cURL', 'PHP'];

const SNIPPETS: Record<string, string> = {
  'Node.js': `import AlphaPay from '@alphapay/sdk';
const client = new AlphaPay(process.env.ALPHAPAY_KEY);
await client.payments.request({ amount: 5000, currency: 'XAF', phone: '+242060000000' });`,
  Python: `import alphapay
client = alphapay.Client(api_key)
client.payments.request(amount=5000, currency="XAF", phone="+242060000000")`,
  cURL: `curl -X POST https://api.alphapay.co/v1/payments/request \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{"amount":5000,"currency":"XAF","phone":"+242060000000"}'`,
  PHP: `$client = new AlphaPay\\Client($apiKey);
$client->payments->request(['amount'=>5000,'currency'=>'XAF','phone'=>'+242060000000']);`,
};

const BODY: Record<string, { title: string; text: string }> = {
  Authentication: { title: 'Authentication', text: 'All API requests are authenticated with a Bearer token. Use your sandbox key (alp_sk_test_…) for testing and your production key (alp_sk_live_…) for live payments. Never expose secret keys in client-side code.' },
  Payments: { title: 'Payments', text: 'Create a payment request with POST /v1/payments/request. The customer receives a mobile-money prompt (MTN/Airtel) or a bank authorization (Libya). Poll GET /v1/payments/:id or subscribe to the payment.confirmed webhook.' },
  Cards: { title: 'Cards', text: 'Issue a virtual Visa card with POST /v1/cards/issue. Cards are funded from the linked mobile-money balance. The PAN and CVV are returned once and never stored.' },
  Webhooks: { title: 'Webhooks', text: 'Configure an endpoint to receive events: payment.confirmed, payment.failed, card.charged, refund.initiated. Each delivery is signed with your whsec_ secret — verify the signature before trusting the payload.' },
  Errors: { title: 'Errors', text: 'Errors use standard HTTP codes. 4xx indicates a client error (invalid phone, insufficient funds); 5xx indicates an upstream/operator issue. Every error includes an "error" code and a human-readable "message".' },
  Changelog: { title: 'Changelog', text: '2026-07 — Libya bank rails (LYD) added. 2026-06 — USDC corridors (Congo ↔ Libya ↔ Europe). 2026-05 — Virtual cards GA. 2026-04 — Webhooks v2 with signed payloads.' },
};

export default function DevDocs() {
  const [section, setSection] = useState(docsSections[0]);
  const [lang, setLang] = useState('Node.js');
  const doc = BODY[section];

  return (
    <div className="mx-auto flex max-w-6xl gap-6">
      <aside className="hidden w-48 shrink-0 md:block">
        <nav className="sticky top-5 space-y-1">
          {docsSections.map((s) => (
            <button key={s} onClick={() => setSection(s)} className={cn('block w-full rounded-lg px-3 py-2 text-left text-sm', section === s ? 'bg-primary/10 font-semibold text-primary' : 'text-muted-foreground hover:bg-accent')}>{s}</button>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        <h1 className="mb-2 font-heading text-2xl font-bold">{doc.title}</h1>
        <p className="mb-6 leading-relaxed text-muted-foreground">{doc.text}</p>

        <div className="mb-2 flex gap-1 border-b border-border">
          {LANGS.map((l) => (
            <button key={l} onClick={() => setLang(l)} className={cn('px-3 py-2 text-sm font-medium', lang === l ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground')}>{l}</button>
          ))}
        </div>
        <div className="relative">
          <button onClick={() => navigator.clipboard?.writeText(SNIPPETS[lang])} className="absolute right-3 top-3 flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1 text-xs hover:bg-accent"><Copy size={13} /> Copy</button>
          <pre className="overflow-auto rounded-xl bg-[#0c0c16] p-4 pt-12 font-mono text-xs leading-relaxed text-foreground/90">{SNIPPETS[lang]}</pre>
        </div>
      </div>
    </div>
  );
}
