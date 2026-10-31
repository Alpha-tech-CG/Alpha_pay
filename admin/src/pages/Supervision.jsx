import { useEffect, useState } from 'react';
import { t } from '../i18n';
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
  if (!data) return <div style={{ color: '#7b86a3' }}>{t('common.loading')}</div>;
  const d = data.dashboard;
  const tile = (label, value) => (
    <Card style={{ flex: '1 1 160px', marginBottom: 0 }}><div style={{ fontSize: 12, color: '#7b86a3' }}>{label}</div><div style={{ fontSize: 24, fontWeight: 800 }}>{value}</div></Card>
  );

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>{t('supervision.title')}</h1>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        {tile(t('supervision.activeMerchants'), d.active_merchants)}
        {tile(t('supervision.payments'), d.tx_24h)}
        {tile(t('supervision.failures'), `${d.tx_failed_24h} (${d.failure_rate_pct} %)`)}
        {tile(t('supervision.kybPending'), d.kyb_pending)}
      </div>
      <Card title={t('supervision.byOperator')}>
        <Table columns={[t('supervision.col.operator'), t('supervision.col.failures')]} rows={data.payments.failures_by_operator} empty={t('supervision.noFailure')}
          renderRow={(r) => <tr key={r.operator}><td style={td}>{r.operator}</td><td style={td}>{r.count}</td></tr>} />
      </Card>
      <Card title={t('supervision.messages')}>
        <Table columns={[t('supervision.col.provider'), t('supervision.col.status'), t('supervision.col.count')]} rows={data.messages.stats} empty={t('supervision.noMessage')}
          renderRow={(r) => <tr key={`${r.provider}-${r.status}`}><td style={td}>{r.provider ?? '—'}</td><td style={td}>{r.status}</td><td style={td}>{r._count.id}</td></tr>} />
      </Card>
      <Card title={t('supervision.webhooks')}>
        <Table columns={[t('supervision.col.event'), t('supervision.col.url'), t('supervision.col.error'), t('supervision.col.date')]} rows={data.webhooks} empty={t('common.none')}
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
