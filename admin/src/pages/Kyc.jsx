import { useEffect, useState, useCallback } from 'react';
import { useSessionUser as useUser } from '../session';
import { api } from '../api';
import { roleOf, can } from '../rbac';
import { Card, Button, Badge, Table, td } from '../ui';

const DOC_LABEL = { RCCM_EXTRACT: 'Extrait RCCM', NIU_CERTIFICATE: 'Attestation NIU', DIRECTOR_ID: "Pièce d'identité du dirigeant" };
const FIELD_LABEL = {
  legal_name: 'Raison sociale', legal_form: 'Forme juridique', rccm: 'RCCM', niu: 'NIU', address: 'Adresse', sector: 'Secteur',
};

/** Revue des dossiers KYB (§M2, §M12) : pièces, résultat KYC, décision motivée. */
export default function Kyc() {
  const { user } = useUser();
  const role = roleOf(user);
  // Identité de l'agent, tracée dans l'historique et le journal d'audit (X-Staff-Id).
  const staff = { headers: { 'X-Staff-Id': user?.primaryEmailAddress?.emailAddress || 'agent' } };
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
    try { return await fn(); } catch (err) { setError(err?.response?.data?.error?.message ?? 'Erreur'); } finally { setBusy(false); }
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
        reason = window.prompt("Identité du dirigeant non vérifiée par le fournisseur. Motif de la dérogation (vérification manuelle) :");
        if (!reason) return;
        kycOverride = true;
      } else if (!window.confirm('Approuver ce dossier ? Le mode live sera ouvert pour ce marchand.')) return;
    } else {
      reason = window.prompt(decision === 'reject' ? 'Motif du refus (montré au marchand) :' : 'Compléments demandés (montré au marchand) :');
      if (!reason) return;
    }
    return run(async () => {
      setDetail((await api.post(`/internal/kyb/${detail.id}/decision`, { decision, reason, kyc_override: kycOverride || undefined }, staff)).data);
      load();
    });
  };

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Dossiers KYB — revue</h1>
      <div style={{ marginBottom: 12 }}>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6 }}>
          <option value="">À traiter (soumis et en revue)</option>
          <option value="INFO_REQUIRED">Compléments demandés</option>
          <option value="APPROVED">Approuvés</option>
          <option value="REJECTED">Refusés</option>
          <option value="DRAFT">Brouillons</option>
        </select>
      </div>
      <Card>
        <Table columns={['Marchand', 'Raison sociale', 'Statut', 'KYC', 'Soumis le', '']} rows={rows} empty="Aucun dossier"
          renderRow={(r) => (
            <tr key={r.id}>
              <td style={td}>{r.merchant_name}</td>
              <td style={td}>{r.legal_name ?? '—'}</td>
              <td style={td}><Badge value={r.status} /></td>
              <td style={td}>{r.kyc ?? '—'}</td>
              <td style={{ ...td, color: '#7b86a3', fontSize: 12 }}>{r.submitted_at ? new Date(r.submitted_at).toLocaleString('fr-FR') : '—'}</td>
              <td style={td}><Button variant="ghost" onClick={() => open(r.id)}>Ouvrir</Button></td>
            </tr>
          )} />
      </Card>

      {detail && (
        <Card title={`${detail.merchant_name} — dossier ${detail.status}`}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, fontSize: 13, marginBottom: 14 }}>
            {Object.entries(FIELD_LABEL).map(([k, label]) => (
              <div key={k}><span style={{ color: '#7b86a3' }}>{label} :</span> {detail.company[k] ?? '—'}</div>
            ))}
            <div><span style={{ color: '#7b86a3' }}>Dirigeant :</span> {[detail.director.first_name, detail.director.last_name].filter(Boolean).join(' ') || '—'}</div>
          </div>

          <div style={{ fontSize: 13, marginBottom: 14 }}>
            <b>Identité du dirigeant (KYC)</b> : {detail.kyc ? `${detail.kyc.status} (${detail.kyc.provider})${detail.kyc.reasons?.length ? ` — ${detail.kyc.reasons.join(', ')}` : ''}` : 'non commencée'}
          </div>

          <div style={{ fontSize: 13, marginBottom: 14 }}>
            <b>Pièces</b> (lien temporaire, consultation tracée)
            {detail.documents.length === 0 && <div style={{ color: '#7b86a3' }}>Aucune pièce</div>}
            {detail.documents.map((d) => (
              <div key={d.id} style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 }}>
                <span>{DOC_LABEL[d.type] ?? d.type} — {d.filename} ({Math.round(d.size_bytes / 1024)} Ko)</span>
                <Button variant="ghost" onClick={() => viewDoc(d.id)} disabled={busy}>Voir</Button>
              </div>
            ))}
            {detail.missing.length > 0 && <div style={{ color: '#d97706', marginTop: 6 }}>Manquant : {detail.missing.join(', ')}</div>}
          </div>

          <div style={{ fontSize: 12, color: '#7b86a3', marginBottom: 14 }}>
            <b>Historique</b>
            {detail.history.map((h, i) => (
              <div key={i}>{new Date(h.at).toLocaleString('fr-FR')} · {h.from ?? '∅'} → {h.to} · {h.actor_type}{h.actor_id ? ` (${h.actor_id})` : ''}{h.reason ? ` — ${h.reason}` : ''}</div>
            ))}
          </div>

          {error && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 10 }}>{error}</div>}
          {mayDecide ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {detail.status === 'soumis' && <Button variant="ghost" onClick={review} disabled={busy}>Prendre en revue</Button>}
              {['soumis', 'en_revue'].includes(detail.status) && (
                <>
                  <Button onClick={() => decide('approve')} disabled={busy}>Approuver</Button>
                  <Button variant="ghost" onClick={() => decide('request_info')} disabled={busy}>Demander des compléments</Button>
                  <Button variant="danger" onClick={() => decide('reject')} disabled={busy}>Refuser</Button>
                </>
              )}
              <Button variant="ghost" onClick={() => setDetail(null)}>Fermer</Button>
            </div>
          ) : <div style={{ color: '#7b86a3', fontSize: 12 }}>Lecture seule (rôle sans permission de décision).</div>}
        </Card>
      )}
    </div>
  );
}
