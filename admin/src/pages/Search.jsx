import { useState } from 'react';
import { api } from '../api';
import { Card, Button, Badge, Table, td } from '../ui';

// Recherche marchand : agrège le dossier KYC et les batchs settlement à partir
// des endpoints internes existants (filtrage par merchantId).
export default function Search() {
  const [q, setQ] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const search = async (e) => {
    e?.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    try {
      const [kyc, settlements] = await Promise.all([
        api.get('/internal/kyc/cases').then((r) => r.data.filter((c) => c.merchantId === q.trim())),
        api.get('/internal/settlements').then((r) => r.data.filter((b) => b.merchantId === q.trim())),
      ]);
      setResult({ kyc, settlements });
    } finally { setBusy(false); }
  };

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Recherche marchand</h1>
      <Card>
        <form onSubmit={search} style={{ display: 'flex', gap: 10 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="merchantId (UUID)"
            style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid #2c3450', background: '#0f1320', color: '#e6e9f2', fontSize: 13 }} />
          <Button onClick={search} disabled={busy}>{busy ? '…' : 'Rechercher'}</Button>
        </form>
      </Card>

      {result && (
        <>
          <Card title="Dossier KYC">
            {result.kyc.length === 0 ? <div style={{ color: '#7b86a3', fontSize: 13 }}>Aucun dossier KYC</div> :
              result.kyc.map((c) => (
                <div key={c.id} style={{ fontSize: 13 }}>Statut <Badge value={c.status} /> · score {c.smileScore ?? '—'} · screening {c.screeningHit ? 'HIT' : 'clean'}</div>
              ))}
          </Card>
          <Card title="Settlements">
            <Table columns={['Batch', 'Net (centimes)', 'Statut']} rows={result.settlements} empty="Aucun batch"
              renderRow={(b) => (
                <tr key={b.id}>
                  <td style={{ ...td, fontFamily: 'monospace', fontSize: 11 }}>{b.batchNumber}</td>
                  <td style={td}>{(Number(b.netCents) / 100).toLocaleString('fr-FR')}</td>
                  <td style={td}><Badge value={b.status} /></td>
                </tr>
              )} />
          </Card>
        </>
      )}
    </div>
  );
}
