import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorText } from '../api';
import { t } from '../i18n';
import { can } from '../rbac';
import { useStaff } from '../session';
import { Badge, Button, Card, InfoGrid, Notice, Table, td, when } from '../ui';

/**
 * Parcours complet d'un paiement pour l'assistance : statuts successifs,
 * demandes et callbacks opérateur, webhooks envoyés au marchand ; relance
 * auprès de l'opérateur et renvoi de webhook.
 */
export default function PaymentDetail({ id, onClose }) {
  const { role } = useStaff();
  const [p, setP] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const act = can(role, 'support.act');

  const load = useCallback(async () => {
    try { setP((await api.get(`/internal/support/payments/${id}`)).data); } catch (err) { setMsg({ error: true, text: errorText(err) }); }
  }, [id]);
  useEffect(() => { setP(null); setMsg(null); load(); }, [load]);

  const run = async (fn) => {
    setBusy(true); setMsg(null);
    try { setMsg({ error: false, text: await fn() }); await load(); } catch (err) { setMsg({ error: true, text: errorText(err) }); } finally { setBusy(false); }
  };
  const refresh = () => run(async () => {
    const r = (await api.post(`/internal/support/payments/${id}/refresh`)).data;
    return r.changed ? t('pay.refreshed', { status: r.status }) : t('pay.unchanged', { detail: r.detail ?? r.operator_status });
  });
  const resend = (d) => run(async () => {
    const r = (await api.post(`/internal/support/deliveries/${d.id}/resend`)).data;
    return t(r.ok ? 'pay.resentOk' : 'pay.resentKo', { status: r.status || '—' });
  });
  const requeue = (o) => {
    const reason = window.prompt(t('pay.requeueReason'));
    if (!reason) return;
    run(async () => { await api.post(`/internal/support/outbox/${o.id}/requeue`, { reason }); return t('pay.requeued'); });
  };

  if (!p) return <Card><Notice msg={msg} />{!msg && t('common.loading')}</Card>;
  return (
    <Card title={t('pay.title', { ref: p.reference })}>
      <InfoGrid items={[
        [t('pay.merchant'), <Link to={`/merchants/${p.merchant_id}`} style={{ color: '#00B4D8' }}>{p.merchant_name}</Link>],
        [t('pay.status'), <Badge value={p.status} />],
        [t('pay.amount'), p.display],
        [t('pay.operator'), p.operator],
        [t('pay.mode'), p.livemode ? 'live' : 'test'],
        [t('pay.payer'), p.payer_phone],
        [t('pay.providerRef'), <code style={{ fontSize: 12 }}>{p.provider_reference ?? '—'}</code>],
        [t('pay.id'), <code style={{ fontSize: 12 }}>{p.id}</code>],
        [t('pay.failure'), p.failure_reason],
        [t('pay.created'), when(p.created_at)],
        [t('pay.updated'), when(p.updated_at)],
      ]} />
      {p.stuck && <div style={{ color: '#fbbf24', fontSize: 13, marginBottom: 10 }}>{t('pay.stuck')}</div>}
      <Notice msg={msg} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {act && p.status === 'PENDING' && <Button onClick={refresh} disabled={busy}>{t('pay.refresh')}</Button>}
        {onClose && <Button variant="ghost" onClick={onClose}>{t('common.close')}</Button>}
      </div>

      <h3 style={{ fontSize: 13, margin: '0 0 6px' }}>{t('pay.history')}</h3>
      <Table columns={[t('pay.col.from'), t('pay.col.to'), t('pay.col.reason'), t('pay.col.date')]} rows={p.history} empty={t('pay.noHistory')}
        renderRow={(h, i) => (
          <tr key={i}><td style={td}>{h.from}</td><td style={td}><Badge value={h.to} /></td><td style={td}>{h.reason}</td><td style={{ ...td, fontSize: 12 }}>{when(h.at)}</td></tr>
        )} />

      <h3 style={{ fontSize: 13, margin: '16px 0 6px' }}>{t('pay.requests')}</h3>
      <Table columns={[t('pay.col.type'), t('pay.col.status'), t('pay.col.attempts'), t('pay.col.error'), '']} rows={p.operator_requests} empty={t('pay.noRequest')}
        renderRow={(o) => (
          <tr key={o.id}>
            <td style={td}>{o.type}</td><td style={td}><Badge value={o.status} /></td><td style={td}>{o.attempts}</td>
            <td style={{ ...td, fontSize: 12 }}>{o.last_error ?? '—'}</td>
            <td style={td}>{act && o.status === 'DEAD' && <Button variant="ghost" onClick={() => requeue(o)} disabled={busy}>{t('pay.requeue')}</Button>}</td>
          </tr>
        )} />

      <h3 style={{ fontSize: 13, margin: '16px 0 6px' }}>{t('pay.callbacks')}</h3>
      <Table columns={[t('pay.col.event'), t('pay.col.date')]} rows={p.operator_callbacks} empty={t('pay.noCallback')}
        renderRow={(c) => <tr key={c.id}><td style={td}>{c.event}</td><td style={{ ...td, fontSize: 12 }}>{when(c.at)}</td></tr>} />

      <h3 style={{ fontSize: 13, margin: '16px 0 6px' }}>{t('pay.webhooks')}</h3>
      <Table columns={[t('pay.col.event'), t('pay.col.url'), t('pay.col.status'), t('pay.col.response'), '']} rows={p.webhooks} empty={t('pay.noWebhook')}
        renderRow={(w) => (
          <tr key={w.id}>
            <td style={td}>{w.event}</td><td style={{ ...td, fontSize: 12 }}>{w.url}</td><td style={td}><Badge value={w.status} /></td>
            <td style={{ ...td, fontSize: 12 }}>{w.response_status ?? w.last_error ?? '—'} · {t('pay.attempts', { n: w.attempts })}</td>
            <td style={td}>{act && <Button variant="ghost" onClick={() => resend(w)} disabled={busy}>{t('pay.resend')}</Button>}</td>
          </tr>
        )} />
    </Card>
  );
}
