import { useEffect, useState, useCallback } from 'react';
import { t } from '../i18n';
import { useStaff } from '../session';
import { api } from '../api';
import { can } from '../rbac';
import { Card, Button, Badge, Table, td } from '../ui';

const FIELDS = ['legal_name', 'legal_form', 'rccm', 'niu', 'address', 'sector'];

/** Revue des dossiers KYB (§M2, §M12) : pièces, résultat KYC, décision motivée. */
export default function Kyc() {
  const { role } = useStaff();
  // L'agent est identifié par sa session (tracé dans l'historique et le journal d'audit).
  const staff = {};
  const mayDecide = can(role, 'kyc.decide');

  const [filter, setFilter] = useState('');
  const [rows, setRows] = useState([]);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try { setRows((await api.get('/internal/kyb', { params: { status: filter || undefined } })).data.data); } catch { /* ignore */ }
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn) => {
    setBusy(true); setError(null);
    try { return await fn(); } catch (err) { setError(err?.response?.data?.error?.message ?? t('common.error')); } finally { setBusy(false); }
  };
  const open = (id) => run(async () => setDetail((await api.get(`/internal/kyb/${id}`)).data));
  const viewDoc = (docId) => run(async () => {
    const { data } = await api.get(`/internal/kyb/${detail.id}/documents/${docId}/url`, staff);
    window.open(data.url, '_blank', 'noopener');
  });
  const review = () => run(async () => { setDetail((await api.post(`/internal/kyb/${detail.id}/review`, {}, staff)).data); load(); });

  const decide = (decision) => {
    let reason;
    let kycOverride = false;
    if (decision === 'approve') {
      if (detail.kyc?.status !== 'approuvé') {
        reason = window.prompt(t('kyc.overridePrompt'));
        if (!reason) return;
        kycOverride = true;
      } else if (!window.confirm(t('kyc.approveConfirm'))) return;
    } else {
      reason = window.prompt(decision === 'reject' ? t('kyc.rejectPrompt') : t('kyc.infoPrompt'));
      if (!reason) return;
    }
    return run(async () => {
      setDetail((await api.post(`/internal/kyb/${detail.id}/decision`, { decision, reason, kyc_override: kycOverride || undefined }, staff)).data);
      load();
    });
  };

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>{t('kyc.title')}</h1>
      <div style={{ marginBottom: 12 }}>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6 }}>
          <option value="">{t('kyc.filter.todo')}</option>
          <option value="INFO_REQUIRED">{t('kyc.filter.info')}</option>
          <option value="APPROVED">{t('kyc.filter.approved')}</option>
          <option value="REJECTED">{t('kyc.filter.rejected')}</option>
          <option value="DRAFT">{t('kyc.filter.draft')}</option>
        </select>
      </div>
      <Card>
        <Table columns={[t('kyc.col.merchant'), t('kyc.col.legalName'), t('kyc.col.status'), t('kyc.col.kyc'), t('kyc.col.submitted'), '']} rows={rows} empty={t('kyc.none')}
          renderRow={(r) => (
            <tr key={r.id}>
              <td style={td}>{r.merchant_name}</td>
              <td style={td}>{r.legal_name ?? '—'}</td>
              <td style={td}><Badge value={r.status} /></td>
              <td style={td}>{r.kyc ?? '—'}</td>
              <td style={{ ...td, color: '#7b86a3', fontSize: 12 }}>{r.submitted_at ? new Date(r.submitted_at).toLocaleString('fr-FR') : '—'}</td>
              <td style={td}><Button variant="ghost" onClick={() => open(r.id)}>{t('common.open')}</Button></td>
            </tr>
          )} />
      </Card>

      {detail && (
        <Card title={t('kyc.detailTitle', { merchant: detail.merchant_name, status: detail.status })}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, fontSize: 13, marginBottom: 14 }}>
            {FIELDS.map((k) => (
              <div key={k}><span style={{ color: '#7b86a3' }}>{t(`kyc.field.${k}`)} :</span> {detail.company[k] ?? '—'}</div>
            ))}
            <div><span style={{ color: '#7b86a3' }}>{t('kyc.director')} :</span> {[detail.director.first_name, detail.director.last_name].filter(Boolean).join(' ') || '—'}</div>
          </div>

          <div style={{ fontSize: 13, marginBottom: 14 }}>
            <b>{t('kyc.identity')}</b> : {detail.kyc ? `${detail.kyc.status} (${detail.kyc.provider})${detail.kyc.reasons?.length ? ` — ${detail.kyc.reasons.join(', ')}` : ''}` : t('kyc.notStarted')}
          </div>

          <div style={{ fontSize: 13, marginBottom: 14 }}>
            <b>{t('kyc.documents')}</b> {t('kyc.documentsHint')}
            {detail.documents.length === 0 && <div style={{ color: '#7b86a3' }}>{t('kyc.noDocument')}</div>}
            {detail.documents.map((d) => (
              <div key={d.id} style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 }}>
                <span>{t(`kyc.doc.${d.type}`)} — {d.filename} ({Math.round(d.size_bytes / 1024)} Ko)</span>
                <Button variant="ghost" onClick={() => viewDoc(d.id)} disabled={busy}>{t('kyc.view')}</Button>
              </div>
            ))}
            {detail.missing.length > 0 && <div style={{ color: '#d97706', marginTop: 6 }}>{t('kyc.missing', { list: detail.missing.join(', ') })}</div>}
          </div>

          <div style={{ fontSize: 12, color: '#7b86a3', marginBottom: 14 }}>
            <b>{t('kyc.history')}</b>
            {detail.history.map((h, i) => (
              <div key={i}>{new Date(h.at).toLocaleString('fr-FR')} · {h.from ?? '∅'} → {h.to} · {h.actor_type}{h.actor_id ? ` (${h.actor_id})` : ''}{h.reason ? ` — ${h.reason}` : ''}</div>
            ))}
          </div>

          {error && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 10 }}>{error}</div>}
          {mayDecide ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {detail.status === 'soumis' && <Button variant="ghost" onClick={review} disabled={busy}>{t('kyc.review')}</Button>}
              {['soumis', 'en_revue'].includes(detail.status) && (
                <>
                  <Button onClick={() => decide('approve')} disabled={busy}>{t('kyc.approve')}</Button>
                  <Button variant="ghost" onClick={() => decide('request_info')} disabled={busy}>{t('kyc.requestInfo')}</Button>
                  <Button variant="danger" onClick={() => decide('reject')} disabled={busy}>{t('kyc.reject')}</Button>
                </>
              )}
              <Button variant="ghost" onClick={() => setDetail(null)}>{t('common.close')}</Button>
            </div>
          ) : <div style={{ color: '#7b86a3', fontSize: 12 }}>{t('kyc.readonly')}</div>}
        </Card>
      )}
    </div>
  );
}
