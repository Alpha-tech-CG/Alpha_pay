import { useEffect, useState, useCallback } from 'react';
import { useSessionUser as useUser } from '../session';
import { api } from '../api';
import { roleOf, can } from '../rbac';
import { Card, Button, Badge, Table, td } from '../ui';

const FILTERS = [
  { key: 'PENDING', label: 'En attente' },
  { key: 'APPROVED', label: 'Approuvées' },
  { key: 'REJECTED', label: 'Rejetées' },
];

const DOC_LABEL = {
  ID_FRONT: 'Pièce d’identité (recto)',
  ID_BACK: 'Pièce d’identité (verso)',
  SELFIE: 'Selfie',
};

const dt = (v) => (v ? new Date(v).toLocaleString('fr-FR') : '—');

export default function ClientKyc() {
  const { user } = useUser();
  const role = roleOf(user);
  const officer = user?.primaryEmailAddress?.emailAddress || 'officer';
  const mayDecide = can(role, 'kyc.decide');

  const [status, setStatus] = useState('PENDING');
  const [rows, setRows] = useState([]);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (statusArg) => {
    try {
      setRows((await api.get('/internal/wallets/kyc/documents', { params: { status: statusArg } })).data);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { load(status); }, [status, load]);

  const open = async (id) => {
    try { setDetail((await api.get(`/internal/wallets/kyc/documents/${id}`)).data); } catch { /* ignore */ }
  };

  const review = async (id, action) => {
    let reason;
    if (action === 'reject') {
      reason = window.prompt('Motif du rejet (obligatoire) :');
      if (!reason) return;
    } else if (!window.confirm('Approuver cette pièce ? Le client passera au niveau KYC N1.')) {
      return;
    }
    setBusy(true);
    try {
      await api.post(`/internal/wallets/kyc/documents/${id}/${action}`, { officer, reason });
      setDetail(null);
      load(status);
    } catch (e) {
      window.alert(e?.response?.data?.message || 'Action refusée');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Pièces d’identité clients</h1>

      <Card>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {FILTERS.map((f) => (
            <Button key={f.key} variant={status === f.key ? 'primary' : 'ghost'} onClick={() => setStatus(f.key)}>
              {f.label}
            </Button>
          ))}
        </div>

        <Table
          columns={['Client', 'Type', 'Statut', 'Reçu le', '']}
          rows={rows}
          empty="Aucune pièce"
          renderRow={(d) => (
            <tr key={d.id}>
              <td style={td}>
                <span style={{ fontFamily: 'monospace' }}>{d.wallet?.phone}</span>
                <span style={{ color: '#7b86a3' }}> · {d.wallet?.fullName || '—'}</span>
              </td>
              <td style={td}>{DOC_LABEL[d.type] || d.type}</td>
              <td style={td}><Badge value={d.status} /></td>
              <td style={{ ...td, color: '#7b86a3', fontSize: 12 }}>{dt(d.createdAt)}</td>
              <td style={td}><Button variant="ghost" onClick={() => open(d.id)}>Ouvrir</Button></td>
            </tr>
          )}
        />
      </Card>

      {detail && (
        <Card title={`${DOC_LABEL[detail.type] || detail.type} — ${detail.wallet?.phone}`}>
          <div style={{ fontSize: 13, marginBottom: 10 }}>
            Client : {detail.wallet?.fullName || '—'} · KYC actuel : {detail.wallet?.kycLevel} · Pièce : <Badge value={detail.status} />
          </div>

          <img
            src={detail.downloadUrl}
            alt={DOC_LABEL[detail.type] || detail.type}
            style={{ maxWidth: '100%', maxHeight: 420, borderRadius: 10, border: '1px solid #232a40', marginBottom: 14, display: 'block' }}
          />

          {detail.reviewedBy && (
            <div style={{ fontSize: 12, color: '#7b86a3', marginBottom: 12 }}>
              Décidé par {detail.reviewedBy} le {dt(detail.reviewedAt)}
              {detail.reviewReason ? ` · motif : ${detail.reviewReason}` : ''}
            </div>
          )}

          {mayDecide && detail.status === 'PENDING' ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={() => review(detail.id, 'approve')} disabled={busy}>Approuver (→ N1)</Button>
              <Button variant="danger" onClick={() => review(detail.id, 'reject')} disabled={busy}>Rejeter</Button>
              <Button variant="ghost" onClick={() => setDetail(null)}>Fermer</Button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              {!mayDecide && <span style={{ color: '#7b86a3', fontSize: 12, alignSelf: 'center' }}>Lecture seule (rôle sans permission de décision).</span>}
              <Button variant="ghost" onClick={() => setDetail(null)}>Fermer</Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
