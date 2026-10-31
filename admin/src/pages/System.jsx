import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorText } from '../api';
import { t } from '../i18n';
import { can } from '../rbac';
import { useStaff } from '../session';
import { Badge, Button, Card, muted, Notice, Table, td, when } from '../ui';
import PaymentDetail from './PaymentDetail';

const REFRESH_MS = 30_000;

/**
 * Santé de la plateforme (§M12) : base, files de tâches, demandes opérateur
 * en échec, webhooks et messages en souffrance, paiements bloqués, connexions
 * opérateur, derniers rapprochements. Rafraîchi toutes les 30 s.
 */
export default function System() {
  const { role } = useStaff();
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState(null);
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setData((await api.get('/internal/support/system')).data); } catch (err) { setMsg({ error: true, text: errorText(err) }); }
  }, []);
  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const run = async (fn, ok) => {
    setBusy(true); setMsg(null);
    try { setMsg({ error: false, text: await fn() ?? ok }); await load(); } catch (err) { setMsg({ error: true, text: errorText(err) }); } finally { setBusy(false); }
  };
  const retry = (queue) => {
    const reason = window.prompt(t('system.retryReason', { queue }));
    if (reason) run(async () => t('system.retried', { n: (await api.post(`/internal/support/system/queues/${queue}/retry`, { reason })).data.retried }));
  };
  const requeue = (o) => {
    const reason = window.prompt(t('pay.requeueReason'));
    if (reason) run(() => api.post(`/internal/support/outbox/${o.id}/requeue`, { reason }).then(() => t('pay.requeued')));
  };

  if (!data) return <div><Notice msg={msg} />{!msg && <div style={muted}>{t('common.loading')}</div>}</div>;
  const tile = (label, value, alert) => (
    <Card style={{ flex: '1 1 160px', marginBottom: 0 }}>
      <div style={{ fontSize: 12, ...muted }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: alert ? '#f87171' : undefined }}>{value}</div>
    </Card>
  );

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>{t('system.title')}</h1>
      <Notice msg={msg} />
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        {tile(t('system.database'), <><Badge value={data.database.status} /> <span style={{ fontSize: 13 }}>{data.database.latency_ms} ms</span></>, data.database.status !== 'ok')}
        {tile(t('system.stuck'), data.stuck_payments.length, data.stuck_payments.length > 0)}
        {tile(t('system.deadOutbox'), data.outbox.DEAD ?? 0, (data.outbox.DEAD ?? 0) > 0)}
        {tile(t('system.webhooks'), t('system.pendingFailed', { p: data.webhooks.pending, f: data.webhooks.failed_24h }), data.webhooks.failed_24h > 0)}
        {tile(t('system.messages'), t('system.queuedFailed', { q: data.messages.queued, f: data.messages.failed_24h }), data.messages.failed_24h > 0)}
      </div>

      <Card title={t('system.queues')}>
        {!data.queues ? <div style={{ color: '#f87171', fontSize: 13 }}>{t('system.redisDown')}</div> : (
          <Table columns={[t('system.col.queue'), t('system.col.waiting'), t('system.col.active'), t('system.col.delayed'), t('system.col.failed'), '']} rows={data.queues}
            renderRow={(q) => (
              <tr key={q.queue}>
                <td style={td}>{q.queue}</td><td style={td}>{q.waiting}</td><td style={td}>{q.active}</td><td style={td}>{q.delayed}</td>
                <td style={{ ...td, color: q.failed ? '#f87171' : undefined }}>{q.failed}</td>
                <td style={td}>{can(role, 'system.manage') && q.failed > 0 && <Button variant="ghost" onClick={() => retry(q.queue)} disabled={busy}>{t('system.retry')}</Button>}</td>
              </tr>
            )} />
        )}
      </Card>

      <Card title={t('system.stuckTitle')}>
        <Table columns={[t('pay.col.date'), t('pay.merchant'), t('pay.col.reference'), t('pay.amount'), t('pay.operator'), '']} rows={data.stuck_payments} empty={t('system.noStuck')}
          renderRow={(p) => (
            <tr key={p.id}>
              <td style={{ ...td, fontSize: 12 }}>{when(p.created_at)}</td>
              <td style={td}><Link to={`/merchants/${p.merchant_id}`} style={{ color: '#00B4D8' }}>{p.merchant_name}</Link></td>
              <td style={td}>{p.reference}</td><td style={td}>{p.display}</td><td style={td}>{p.operator}</td>
              <td style={td}><Button variant="ghost" onClick={() => setOpen(p.id)}>{t('common.open')}</Button></td>
            </tr>
          )} />
      </Card>
      {open && <PaymentDetail id={open} onClose={() => setOpen(null)} />}

      <Card title={t('system.deadTitle')}>
        <Table columns={[t('pay.col.date'), t('pay.col.type'), t('pay.col.attempts'), t('pay.col.error'), '']} rows={data.dead_outbox} empty={t('common.none')}
          renderRow={(o) => (
            <tr key={o.id}>
              <td style={{ ...td, fontSize: 12 }}>{when(o.updatedAt)}</td><td style={td}>{o.type}</td><td style={td}>{o.attempts}</td>
              <td style={{ ...td, fontSize: 12 }}>{o.lastError ?? '—'}</td>
              <td style={{ ...td, whiteSpace: 'nowrap' }}>
                <Button variant="ghost" onClick={() => setOpen(o.transactionId)}>{t('system.payment')}</Button>{' '}
                {can(role, 'support.act') && <Button variant="ghost" onClick={() => requeue(o)} disabled={busy}>{t('pay.requeue')}</Button>}
              </td>
            </tr>
          )} />
      </Card>

      <Card title={t('system.connections')}>
        <Table columns={[t('pay.operator'), t('pay.mode'), t('pay.status'), t('supervision.col.count')]} rows={data.provider_connections} empty={t('common.none')}
          renderRow={(c) => (
            <tr key={`${c.operator}-${c.livemode}-${c.status}`}><td style={td}>{c.operator}</td><td style={td}>{c.livemode ? 'live' : 'test'}</td><td style={td}><Badge value={c.status} /></td><td style={td}>{c.count}</td></tr>
          )} />
      </Card>

      <Card title={t('system.recon')}>
        <Table columns={[t('pay.col.date'), t('pay.operator'), t('system.col.statement'), t('system.col.gaps'), '']} rows={data.reconciliation_runs} empty={t('common.none')}
          renderRow={(r) => (
            <tr key={r.id}>
              <td style={{ ...td, fontSize: 12 }}>{when(r.createdAt)}</td><td style={td}>{r.operator}</td>
              <td style={{ ...td, fontSize: 12 }}>{new Date(r.statementDate).toLocaleDateString('fr-FR')}</td>
              <td style={{ ...td, color: r.alert ? '#f87171' : undefined }}>{r.discrepancyCount}</td>
              <td style={td}><Link to="/reconciliation" style={{ color: '#00B4D8', fontSize: 12 }}>{t('common.open')}</Link></td>
            </tr>
          )} />
      </Card>
    </div>
  );
}
