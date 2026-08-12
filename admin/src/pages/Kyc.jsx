import { useEffect, useState, useCallback } from 'react';
import { useSessionUser as useUser } from '../session';
import { api } from '../api';
import { roleOf, can } from '../rbac';
import { Card, Button, Badge, Table, td } from '../ui';

export default function Kyc() {
  const { user } = useUser();
  const role = roleOf(user);
  const officer = user?.primaryEmailAddress?.emailAddress || 'officer';
  const mayDecide = can(role, 'kyc.decide');

  const [cases, setCases] = useState([]);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setCases((await api.get('/internal/kyc/cases', { params: { status: 'IN_REVIEW' } })).data); } catch { /* ignore */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const open = async (id) => setDetail((await api.get(`/internal/kyc/cases/${id}`)).data);

  const decide = async (id, decision) => {
    let reason;
    if (decision === 'REJECTED') {
      reason = window.prompt('Motif du rejet (action sensible) :');
      if (reason == null) return; // double-confirm : annulation
    } else if (!window.confirm(`Confirmer la décision ${decision} ?`)) return;
    setBusy(true);
    try {
      await api.post(`/internal/kyc/cases/${id}/decide`, { decision, officer, reason });
      setDetail(null); load();
    } finally { setBusy(false); }
  };

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>KYC — file de revue manuelle</h1>
      <Card>
        <Table columns={['Marchand', 'Statut', 'Score', 'Screening', 'MAJ', '']} rows={cases} empty="Aucun dossier en revue"
          renderRow={(c) => (
            <tr key={c.id}>
              <td style={{ ...td, fontFamily: 'monospace', fontSize: 11 }}>{c.merchantId}</td>
              <td style={td}><Badge value={c.status} /></td>
              <td style={td}>{c.smileScore ?? '—'}</td>
              <td style={td}>{c.screeningHit ? <span style={{ color: '#dc2626' }}>HIT</span> : 'clean'}</td>
              <td style={{ ...td, color: '#7b86a3', fontSize: 12 }}>{new Date(c.updatedAt).toLocaleString('fr-FR')}</td>
              <td style={td}><Button variant="ghost" onClick={() => open(c.id)}>Ouvrir</Button></td>
            </tr>
          )} />
      </Card>

      {detail && (
        <Card title={`Dossier ${detail.merchantId}`}>
          <div style={{ fontSize: 13, marginBottom: 10 }}>Statut : <Badge value={detail.status} /> · Score Smile : {detail.smileScore ?? '—'} · Screening : {detail.screeningHit ? 'HIT' : 'clean'}</div>
          <div style={{ fontSize: 12, color: '#7b86a3', marginBottom: 6 }}>Documents : {(detail.documents || []).map((d) => d.type).join(', ') || '—'}</div>
          <div style={{ fontSize: 12, color: '#7b86a3', marginBottom: 14 }}>Historique : {(detail.events || []).map((e) => e.action).join(' → ')}</div>
          {mayDecide ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={() => decide(detail.id, 'APPROVED')} disabled={busy}>Approuver</Button>
              <Button variant="danger" onClick={() => decide(detail.id, 'REJECTED')} disabled={busy}>Rejeter</Button>
              <Button variant="ghost" onClick={() => decide(detail.id, 'NEEDS_MORE')} disabled={busy}>Compléments</Button>
              <Button variant="ghost" onClick={() => setDetail(null)}>Fermer</Button>
            </div>
          ) : <div style={{ color: '#7b86a3', fontSize: 12 }}>Lecture seule (rôle sans permission de décision).</div>}
        </Card>
      )}
    </div>
  );
}
