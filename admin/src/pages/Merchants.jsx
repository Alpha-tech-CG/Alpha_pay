import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../api';
import { can } from '../rbac';
import { useStaff } from '../session';
import { Badge, Button, Card, Table, td } from '../ui';

const field = { padding: '8px 10px', borderRadius: 8, border: '1px solid #2c3450', background: '#0f1320', color: '#e6e9f2', fontSize: 13 };

/** Marchands (§M12) : recherche, fiche (palier, statut, volumes, crédits, opérateurs), suspension motivée. */
export default function Merchants() {
  const { role } = useStaff();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [sheet, setSheet] = useState(null);
  const [plans, setPlans] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try { setRows((await api.get('/internal/merchants', { params: { q: q || undefined } })).data); } catch (err) { setError(errorText(err)); }
  }, [q]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get('/internal/billing/plans').then((r) => setPlans(r.data)).catch(() => {}); }, []);

  const run = async (fn) => {
    setBusy(true); setError(null);
    try { await fn(); } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  };
  const open = (id) => run(async () => setSheet((await api.get(`/internal/merchants/${id}`)).data));
  const refresh = async () => { setSheet((await api.get(`/internal/merchants/${sheet.id}`)).data); load(); };

  const toggle = () => {
    const reason = window.prompt(sheet.active ? 'Motif de la suspension (obligatoire) :' : 'Motif de la réactivation (obligatoire) :');
    if (!reason) return;
    run(async () => { await api.post(`/internal/merchants/${sheet.id}/${sheet.active ? 'suspend' : 'reactivate'}`, { reason }); await refresh(); });
  };
  const changePlan = (plan_code) => {
    const reason = window.prompt(`Motif du passage au palier « ${plan_code} » :`);
    if (!reason) return;
    run(async () => { await api.patch(`/internal/merchants/${sheet.id}/subscription`, { plan_code, reason }); await refresh(); });
  };
  const adjust = () => {
    const delta = parseInt(window.prompt('Crédits à ajouter (négatif pour retirer) :') ?? '', 10);
    if (!delta) return;
    const reason = window.prompt('Motif (obligatoire) :');
    if (!reason) return;
    run(async () => { await api.post(`/internal/merchants/${sheet.id}/credits/adjust`, { delta, reason }); await refresh(); });
  };

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Marchands</h1>
      <Card>
        <form onSubmit={(e) => { e.preventDefault(); load(); }} style={{ display: 'flex', gap: 10 }}>
          <input style={{ ...field, flex: 1 }} placeholder="Nom du marchand" value={q} onChange={(e) => setQ(e.target.value)} />
          <Button>Rechercher</Button>
        </form>
      </Card>
      <Card>
        <Table columns={['Marchand', 'KYB', 'Statut', 'Créé le', '']} rows={rows} empty="Aucun marchand"
          renderRow={(m) => (
            <tr key={m.id}>
              <td style={td}>{m.name}</td>
              <td style={td}><Badge value={m.onboardingStatus} /></td>
              <td style={td}>{m.isActive ? 'actif' : <span style={{ color: '#f87171' }}>suspendu</span>}</td>
              <td style={{ ...td, color: '#7b86a3', fontSize: 12 }}>{new Date(m.createdAt).toLocaleDateString('fr-FR')}</td>
              <td style={td}><Button variant="ghost" onClick={() => open(m.id)}>Fiche</Button></td>
            </tr>
          )} />
      </Card>

      {sheet && (
        <Card title={`${sheet.name}${sheet.active ? '' : ' — SUSPENDU'}`}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, fontSize: 13, marginBottom: 14 }}>
            <div><span style={{ color: '#7b86a3' }}>KYB :</span> {sheet.kyb?.status ?? '—'}</div>
            <div><span style={{ color: '#7b86a3' }}>Palier :</span> {sheet.subscription ? `${sheet.subscription.label} (${sheet.subscription.status})` : 'aucun'}</div>
            <div><span style={{ color: '#7b86a3' }}>Crédits :</span> {sheet.credit_balance}</div>
            <div><span style={{ color: '#7b86a3' }}>Encaissé (live) :</span> {sheet.live_volume.display} ({sheet.live_volume.count} paiements)</div>
            <div><span style={{ color: '#7b86a3' }}>Opérateurs :</span> {sheet.operators.map((o) => `${o.operator} ${o.livemode ? 'live' : 'test'} ${o.status}`).join(', ') || '—'}</div>
            <div><span style={{ color: '#7b86a3' }}>Membres :</span> {sheet.members.length}</div>
            {!sheet.active && <div style={{ color: '#f87171' }}>Motif : {sheet.suspension_reason}</div>}
          </div>
          {error && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 10 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {can(role, 'merchants.suspend') && (
              <Button variant={sheet.active ? 'danger' : 'primary'} onClick={toggle} disabled={busy}>{sheet.active ? 'Suspendre' : 'Réactiver'}</Button>
            )}
            {can(role, 'merchants.billing') && (
              <>
                <select style={field} value="" onChange={(e) => e.target.value && changePlan(e.target.value)} disabled={busy}>
                  <option value="">Changer de palier…</option>
                  {plans.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
                </select>
                <Button variant="ghost" onClick={adjust} disabled={busy}>Ajuster les crédits</Button>
              </>
            )}
            {!can(role, 'merchants.suspend') && <span style={{ color: '#7b86a3', fontSize: 12 }}>Lecture seule (rôle Support).</span>}
            <Button variant="ghost" onClick={() => setSheet(null)}>Fermer</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
