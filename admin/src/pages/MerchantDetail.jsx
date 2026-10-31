import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, errorText } from '../api';
import { t } from '../i18n';
import { can } from '../rbac';
import { useStaff } from '../session';
import { Badge, Button, Card, field, InfoGrid, muted, Notice, Table, Tabs, td, when } from '../ui';
import PaymentDetail from './PaymentDetail';

const ask = (key, vars) => window.prompt(t(key, vars));

/**
 * Fiche marchand (§M12) : tout ce qu'il faut pour aider le client, sur un seul
 * écran. Aperçu (palier, statut, crédits), paiements, service développeur
 * (clés, webhooks, journal d'API), messages, équipe et journal d'assistance.
 */
export default function MerchantDetail() {
  const { id } = useParams();
  const { role } = useStaff();
  const [tab, setTab] = useState('overview');
  const [sheet, setSheet] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadSheet = useCallback(async () => {
    try { setSheet((await api.get(`/internal/merchants/${id}`)).data); } catch (err) { setMsg({ error: true, text: errorText(err) }); }
  }, [id]);
  useEffect(() => { loadSheet(); }, [loadSheet]);

  /** Exécute un geste, affiche son résultat puis recharge l'onglet. */
  const run = async (fn, ok, reload) => {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ error: false, text: ok }); await (reload ?? loadSheet)(); } catch (err) { setMsg({ error: true, text: errorText(err, err?.message || undefined) }); } finally { setBusy(false); }
  };
  const ctx = { id, role, run, busy };

  if (!sheet) return <div><Link to="/" style={{ color: '#00B4D8', fontSize: 13 }}>← {t('nav.merchants')}</Link><Notice msg={msg} />{!msg && <div style={muted}>{t('common.loading')}</div>}</div>;
  return (
    <div>
      <Link to="/" style={{ color: '#00B4D8', fontSize: 13 }}>← {t('nav.merchants')}</Link>
      <h1 style={{ fontSize: 20, fontWeight: 800, margin: '8px 0 16px' }}>
        {sheet.name} {!sheet.active && <span style={{ color: '#f87171', fontSize: 14 }}>{t('merchants.suspendedTag')}</span>}
      </h1>
      <Tabs value={tab} onChange={(k) => { setTab(k); setMsg(null); }} tabs={[
        { key: 'overview', label: t('md.tab.overview') },
        { key: 'payments', label: t('md.tab.payments') },
        { key: 'developers', label: t('md.tab.developers') },
        { key: 'messages', label: t('md.tab.messages') },
        { key: 'team', label: t('md.tab.team') },
        { key: 'journal', label: t('md.tab.journal') },
      ]} />
      <Notice msg={msg} />
      {tab === 'overview' && <Overview sheet={sheet} {...ctx} />}
      {tab === 'payments' && <Payments {...ctx} />}
      {tab === 'developers' && <Developers {...ctx} />}
      {tab === 'messages' && <Messages {...ctx} />}
      {tab === 'team' && <Team {...ctx} />}
      {tab === 'journal' && <Journal {...ctx} />}
    </div>
  );
}

/** Charge une ressource de la fiche ; `reload` sert après un geste. */
function useResource(path) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const reload = useCallback(async () => {
    try { setData((await api.get(path)).data); setError(null); } catch (err) { setError(errorText(err)); }
  }, [path]);
  useEffect(() => { reload(); }, [reload]);
  return { data, error, reload };
}

function Loading({ error }) {
  return error ? <div style={{ color: '#f87171' }}>{error}</div> : <div style={muted}>{t('common.loading')}</div>;
}

function Overview({ sheet, id, role, run, busy }) {
  const [plans, setPlans] = useState([]);
  useEffect(() => { api.get('/internal/billing/plans').then((r) => setPlans(r.data)).catch(() => {}); }, []);

  const toggle = () => {
    const reason = ask(sheet.active ? 'merchants.suspendReason' : 'merchants.reactivateReason');
    if (reason) run(() => api.post(`/internal/merchants/${id}/${sheet.active ? 'suspend' : 'reactivate'}`, { reason }), sheet.active ? t('md.suspended') : t('md.reactivated'));
  };
  const changePlan = (plan_code) => {
    const reason = ask('merchants.planReason', { plan: plan_code });
    if (reason) run(() => api.patch(`/internal/merchants/${id}/subscription`, { plan_code, reason }), t('md.planChanged'));
  };
  const adjust = () => {
    const delta = parseInt(ask('merchants.adjustDelta') ?? '', 10);
    if (!delta) return;
    const reason = ask('merchants.adjustReason');
    if (reason) run(() => api.post(`/internal/merchants/${id}/credits/adjust`, { delta, reason }), t('md.creditsAdjusted'));
  };

  return (
    <Card>
      <InfoGrid items={[
        [t('merchants.kyb'), sheet.kyb?.status],
        [t('merchants.plan'), sheet.subscription ? `${sheet.subscription.label} (${sheet.subscription.status})` : t('merchants.noPlan')],
        [t('merchants.credits'), sheet.credit_balance],
        [t('merchants.volume'), `${sheet.live_volume.display} (${t('merchants.volumeCount', { n: sheet.live_volume.count })})`],
        [t('md.testPayments'), sheet.test_payments],
        [t('merchants.operators'), sheet.operators.map((o) => `${o.operator} ${o.livemode ? 'live' : 'test'} ${o.status}`).join(', ') || '—'],
        [t('merchants.members'), sheet.members.length],
        [t('md.company'), sheet.company_name],
        [t('md.created'), when(sheet.created_at)],
        [t('md.id'), <code style={{ fontSize: 12 }}>{sheet.id}</code>],
        !sheet.active && [t('merchants.reason'), <span style={{ color: '#f87171' }}>{sheet.suspension_reason}</span>],
      ]} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {can(role, 'merchants.suspend') && (
          <Button variant={sheet.active ? 'danger' : 'primary'} onClick={toggle} disabled={busy}>{sheet.active ? t('merchants.suspend') : t('merchants.reactivate')}</Button>
        )}
        {can(role, 'merchants.billing') && (
          <>
            <select style={field} value="" onChange={(e) => e.target.value && changePlan(e.target.value)} disabled={busy}>
              <option value="">{t('merchants.changePlan')}</option>
              {plans.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
            </select>
            <Button variant="ghost" onClick={adjust} disabled={busy}>{t('merchants.adjust')}</Button>
          </>
        )}
      </div>
    </Card>
  );
}

function Payments({ id }) {
  const [filter, setFilter] = useState({ status: '', mode: '' });
  const [open, setOpen] = useState(null);
  const params = new URLSearchParams(Object.entries(filter).filter(([, v]) => v)).toString();
  const { data, error } = useResource(`/internal/support/merchants/${id}/payments${params ? `?${params}` : ''}`);
  const set = (k) => (e) => setFilter((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <Card>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <select style={field} value={filter.status} onChange={set('status')}>
            <option value="">{t('md.allStatuses')}</option>
            {['PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELED'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select style={field} value={filter.mode} onChange={set('mode')}>
            <option value="">{t('md.allModes')}</option>
            <option value="live">live</option>
            <option value="test">test</option>
          </select>
        </div>
        {!data ? <Loading error={error} /> : (
          <Table columns={[t('pay.col.date'), t('pay.col.reference'), t('pay.amount'), t('pay.operator'), t('pay.payer'), t('pay.status'), '']} rows={data} empty={t('support.noPayment')}
            renderRow={(p) => (
              <tr key={p.id}>
                <td style={{ ...td, fontSize: 12 }}>{when(p.created_at)}</td>
                <td style={td}>{p.reference}{p.livemode ? '' : ' (test)'}</td>
                <td style={td}>{p.display}</td>
                <td style={td}>{p.operator}</td>
                <td style={{ ...td, fontSize: 12 }}>{p.payer_phone ?? '—'}</td>
                <td style={td}><Badge value={p.status} /></td>
                <td style={td}><Button variant="ghost" onClick={() => setOpen(p.id)}>{t('common.open')}</Button></td>
              </tr>
            )} />
        )}
      </Card>
      {open && <PaymentDetail id={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function Developers({ id, role, run, busy }) {
  const { data, error, reload } = useResource(`/internal/support/merchants/${id}/developers`);
  if (!data) return <Loading error={error} />;
  const act = can(role, 'support.act');
  const secure = can(role, 'support.secure');
  const base = `/internal/support/merchants/${id}`;

  const revoke = (k) => {
    const reason = ask('md.revokeReason', { name: k.name });
    if (reason) run(() => api.post(`${base}/api-keys/${k.id}/revoke`, { reason }), t('md.keyRevoked'), reload);
  };
  const toggleEndpoint = (e) => {
    const active = e.status !== 'ACTIVE';
    const reason = ask(active ? 'md.enableReason' : 'md.disableReason');
    if (reason) run(() => api.post(`${base}/webhook-endpoints/${e.id}/status`, { active, reason }), active ? t('md.endpointEnabled') : t('md.endpointDisabled'), reload);
  };
  const test = (e) => run(async () => {
    const r = (await api.post(`${base}/webhook-endpoints/${e.id}/test`)).data;
    if (!r.ok) throw new Error(t('pay.resentKo', { status: r.status || '—' }));
  }, t('md.testSent'), reload);
  const resend = (d) => run(async () => {
    const r = (await api.post(`/internal/support/deliveries/${d.id}/resend`)).data;
    if (!r.ok) throw new Error(t('pay.resentKo', { status: r.status || '—' }));
  }, t('pay.resentOk', { status: 200 }), reload);
  const urlOf = Object.fromEntries(data.webhook_endpoints.map((e) => [e.id, e.url]));

  return (
    <>
      <Card title={t('md.api24h')}>
        <InfoGrid items={[[t('md.calls'), data.api_24h.calls], [t('md.errors'), data.api_24h.errors], [t('md.errorRate'), `${data.api_24h.error_rate_pct} %`]]} />
      </Card>
      <Card title={t('md.keys')}>
        <Table columns={[t('md.col.name'), t('md.col.prefix'), t('pay.mode'), t('md.col.lastUsed'), t('pay.status'), '']} rows={data.api_keys} empty={t('md.noKey')}
          renderRow={(k) => (
            <tr key={k.id}>
              <td style={td}>{k.name}</td>
              <td style={td}><code style={{ fontSize: 12 }}>{k.prefix}</code></td>
              <td style={td}>{k.mode}</td>
              <td style={{ ...td, fontSize: 12 }}>{when(k.lastUsedAt)}</td>
              <td style={td}><Badge value={k.revokedAt ? 'REVOKED' : 'ACTIVE'} /></td>
              <td style={td}>{secure && !k.revokedAt && <Button variant="danger" onClick={() => revoke(k)} disabled={busy}>{t('md.revoke')}</Button>}</td>
            </tr>
          )} />
      </Card>
      <Card title={t('md.endpoints')}>
        <Table columns={[t('pay.col.url'), t('md.col.events'), t('pay.mode'), t('pay.status'), '']} rows={data.webhook_endpoints} empty={t('md.noEndpoint')}
          renderRow={(e) => (
            <tr key={e.id}>
              <td style={{ ...td, fontSize: 12 }}>{e.url}</td>
              <td style={{ ...td, fontSize: 12 }}>{e.events.join(', ') || t('md.allEvents')}</td>
              <td style={td}>{e.livemode ? 'live' : 'test'}</td>
              <td style={td}><Badge value={e.status} /></td>
              <td style={{ ...td, whiteSpace: 'nowrap' }}>
                {act && e.status === 'ACTIVE' && <Button variant="ghost" onClick={() => test(e)} disabled={busy}>{t('md.test')}</Button>}{' '}
                {secure && <Button variant={e.status === 'ACTIVE' ? 'danger' : 'primary'} onClick={() => toggleEndpoint(e)} disabled={busy}>{e.status === 'ACTIVE' ? t('md.disable') : t('md.enable')}</Button>}
              </td>
            </tr>
          )} />
      </Card>
      <Card title={t('md.deliveries')}>
        <Table columns={[t('pay.col.date'), t('pay.col.event'), t('pay.col.url'), t('pay.status'), t('pay.col.response'), '']} rows={data.deliveries} empty={t('pay.noWebhook')}
          renderRow={(d) => (
            <tr key={d.id}>
              <td style={{ ...td, fontSize: 12 }}>{when(d.createdAt)}</td>
              <td style={td}>{d.event}</td>
              <td style={{ ...td, fontSize: 12 }}>{urlOf[d.endpointId]}</td>
              <td style={td}><Badge value={d.status} /></td>
              <td style={{ ...td, fontSize: 12, maxWidth: 260 }} title={d.responseBody ?? ''}>{d.responseStatus ?? d.lastError ?? '—'} · {t('pay.attempts', { n: d.attempts })}</td>
              <td style={td}>{act && <Button variant="ghost" onClick={() => resend(d)} disabled={busy}>{t('pay.resend')}</Button>}</td>
            </tr>
          )} />
      </Card>
      <Card title={t('md.apiLogs')}>
        <Table columns={[t('pay.col.date'), t('md.col.request'), t('md.col.http'), t('md.col.duration'), t('md.col.code'), t('md.col.requestId')]} rows={data.api_logs} empty={t('md.noLog')}
          renderRow={(l) => (
            <tr key={l.id}>
              <td style={{ ...td, fontSize: 12 }}>{when(l.createdAt)}</td>
              <td style={{ ...td, fontSize: 12 }}>{l.method} {l.path} {l.livemode ? '' : '(test)'}</td>
              <td style={{ ...td, color: l.status >= 400 ? '#f87171' : undefined }}>{l.status}</td>
              <td style={td}>{l.durationMs} ms</td>
              <td style={{ ...td, fontSize: 12 }}>{l.errorCode ?? '—'}</td>
              <td style={{ ...td, fontSize: 11 }}><code>{l.requestId ?? '—'}</code></td>
            </tr>
          )} />
      </Card>
    </>
  );
}

function Messages({ id }) {
  const { data, error } = useResource(`/internal/support/merchants/${id}/messages`);
  if (!data) return <Loading error={error} />;
  return (
    <Card>
      <Table columns={[t('pay.col.date'), t('md.col.channel'), t('md.col.category'), t('md.col.to'), t('md.col.provider'), t('pay.status'), t('pay.col.error')]} rows={data} empty={t('md.noMessage')}
        renderRow={(m) => (
          <tr key={m.id}>
            <td style={{ ...td, fontSize: 12 }}>{when(m.createdAt)}</td>
            <td style={td}>{m.channel}{m.livemode ? '' : ' (test)'}</td>
            <td style={{ ...td, fontSize: 12 }}>{m.category}{m.templateKey ? ` · ${m.templateKey}` : ''}</td>
            <td style={{ ...td, fontSize: 12 }}>{m.destinationMasked}</td>
            <td style={td}>{m.provider ?? '—'}</td>
            <td style={td}><Badge value={m.status} /></td>
            <td style={{ ...td, fontSize: 12 }}>{m.lastError ?? '—'}</td>
          </tr>
        )} />
    </Card>
  );
}

function Team({ id, role, run, busy }) {
  const { data, error, reload } = useResource(`/internal/support/merchants/${id}/team`);
  if (!data) return <Loading error={error} />;
  const logout = (m) => {
    const reason = ask('md.logoutReason', { name: m.name ?? m.email });
    if (reason) run(() => api.post(`/internal/support/merchants/${id}/members/${m.id}/sessions/revoke`, { reason }), t('md.loggedOut'), reload);
  };
  return (
    <Card>
      <Table columns={[t('md.col.name'), t('md.col.email'), t('md.col.phone'), t('md.col.role'), t('pay.status'), t('md.col.lastLogin'), t('md.col.sessions'), '']} rows={data} empty={t('common.none')}
        renderRow={(m) => (
          <tr key={m.id}>
            <td style={td}>{m.name ?? '—'}</td>
            <td style={{ ...td, fontSize: 12 }}>{m.email}</td>
            <td style={{ ...td, fontSize: 12 }}>{m.phone ?? '—'}</td>
            <td style={td}>{m.role}</td>
            <td style={td}><Badge value={m.status} /></td>
            <td style={{ ...td, fontSize: 12 }}>{when(m.last_login_at)}</td>
            <td style={td}>{m.active_sessions}</td>
            <td style={td}>{can(role, 'support.secure') && m.active_sessions > 0 && <Button variant="danger" onClick={() => logout(m)} disabled={busy}>{t('md.logout')}</Button>}</td>
          </tr>
        )} />
    </Card>
  );
}

function Journal({ id, role, run, busy }) {
  const { data, error, reload } = useResource(`/internal/support/merchants/${id}/audit`);
  const [text, setText] = useState('');
  const note = (e) => {
    e.preventDefault();
    run(async () => { await api.post(`/internal/support/merchants/${id}/notes`, { text }); setText(''); }, t('md.noteSaved'), reload);
  };
  return (
    <>
      {can(role, 'support.act') && (
        <Card title={t('md.noteTitle')}>
          <form onSubmit={note} style={{ display: 'flex', gap: 8 }}>
            <input style={{ ...field, flex: 1 }} placeholder={t('md.notePlaceholder')} value={text} onChange={(e) => setText(e.target.value)} />
            <Button disabled={busy || text.trim().length < 3}>{t('common.save')}</Button>
          </form>
        </Card>
      )}
      <Card>{!data ? <Loading error={error} /> : <AuditTable rows={data} />}</Card>
    </>
  );
}

/** Lignes du journal d'audit (fiche marchand et journal global). */
export function AuditTable({ rows, showMerchant }) {
  return (
    <Table columns={[t('pay.col.date'), t('audit.col.actor'), ...(showMerchant ? [t('pay.merchant')] : []), t('audit.col.action'), t('audit.col.detail')]} rows={rows} empty={t('audit.none')}
      renderRow={(r) => (
        <tr key={r.id}>
          <td style={{ ...td, fontSize: 12, whiteSpace: 'nowrap' }}>{when(r.createdAt)}</td>
          <td style={{ ...td, fontSize: 12 }}>{r.actor_name ?? `${r.actorType}${r.actorId ? ` ${r.actorId.slice(0, 8)}` : ''}`}</td>
          {showMerchant && <td style={{ ...td, fontSize: 12 }}>{r.merchantId ? <Link to={`/merchants/${r.merchantId}`} style={{ color: '#00B4D8' }}>{r.merchantId.slice(0, 8)}</Link> : '—'}</td>}
          <td style={{ ...td, fontSize: 12, fontWeight: r.action === 'support.note' ? 700 : 400 }}>{r.action}</td>
          <td style={{ ...td, fontSize: 12, maxWidth: 420, overflowWrap: 'anywhere' }}>
            {r.action === 'support.note' ? r.metadata?.text : Object.keys(r.metadata ?? {}).length ? JSON.stringify(r.metadata) : '—'}
          </td>
        </tr>
      )} />
  );
}
