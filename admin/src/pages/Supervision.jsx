import { useEffect, useState } from 'react';
import { api, errorText } from '../api';
import { Card, Table, td } from '../ui';

/** Supervision (§M12) : paiements en échec par opérateur, messages par fournisseur, webhooks en échec (production). */
export default function Supervision() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get('/internal/supervision/dashboard'),
      api.get('/internal/supervision/payments/failures'),
      api.get('/internal/supervision/messages/stats'),
      api.get('/internal/supervision/webhooks/failures', { params: { limit: 20 } }),
    ])
      .then(([d, p, m, w]) => setData({ dashboard: d.data, payments: p.data, messages: m.data, webhooks: w.data }))
      .catch((err) => setError(errorText(err)));
  }, []);

  if (error) return <div style={{ color: '#f87171' }}>{error}</div>;
  if (!data) return <div style={{ color: '#7b86a3' }}>Chargement…</div>;
  const d = data.dashboard;
  const tile = (label, value) => (
    <Card style={{ flex: '1 1 160px', marginBottom: 0 }}><div style={{ fontSize: 12, color: '#7b86a3' }}>{label}</div><div style={{ fontSize: 24, fontWeight: 800 }}>{value}</div></Card>
  );

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Supervision (24 h, production)</h1>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        {tile('Marchands actifs', d.active_merchants)}
        {tile('Paiements', d.tx_24h)}
        {tile('Échecs', `${d.tx_failed_24h} (${d.failure_rate_pct} %)`)}
        {tile('Dossiers KYB à traiter', d.kyb_pending)}
      </div>
      <Card title="Paiements en échec par opérateur">
        <Table columns={['Opérateur', 'Échecs']} rows={data.payments.failures_by_operator} empty="Aucun échec"
          renderRow={(r) => <tr key={r.operator}><td style={td}>{r.operator}</td><td style={td}>{r.count}</td></tr>} />
      </Card>
      <Card title="Messages par fournisseur et statut">
        <Table columns={['Fournisseur', 'Statut', 'Nombre']} rows={data.messages.stats} empty="Aucun message"
          renderRow={(r) => <tr key={`${r.provider}-${r.status}`}><td style={td}>{r.provider ?? '—'}</td><td style={td}>{r.status}</td><td style={td}>{r._count.id}</td></tr>} />
      </Card>
      <Card title="Webhooks en échec définitif">
        <Table columns={['Événement', 'URL', 'Erreur', 'Date']} rows={data.webhooks} empty="Aucun"
          renderRow={(w) => (
            <tr key={w.id}>
              <td style={td}>{w.event}</td>
              <td style={{ ...td, fontSize: 12 }}>{w.endpoint?.url}</td>
              <td style={{ ...td, fontSize: 12 }}>{w.lastError ?? w.responseStatus}</td>
              <td style={{ ...td, fontSize: 12, color: '#7b86a3' }}>{new Date(w.createdAt).toLocaleString('fr-FR')}</td>
            </tr>
          )} />
      </Card>
    </div>
  );
}
