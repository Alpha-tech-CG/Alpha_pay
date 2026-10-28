import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../api';
import { can } from '../rbac';
import { useStaff } from '../session';
import { Button, Card, Table, td } from '../ui';

const field = { width: 110, padding: '6px 8px', borderRadius: 6, border: '1px solid #2c3450', background: '#0f1320', color: '#e6e9f2', fontSize: 13 };

/** Paliers, prix et packs de crédits (§M11) : modifiables ici, sans déploiement (super-administrateur). */
export default function Billing() {
  const { role } = useStaff();
  const editable = can(role, 'billing.manage');
  const [plans, setPlans] = useState([]);
  const [packs, setPacks] = useState([]);
  const [draft, setDraft] = useState({});
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    const [p, k] = await Promise.all([api.get('/internal/billing/plans'), api.get('/internal/billing/packs')]);
    setPlans(p.data); setPacks(k.data); setDraft({});
  }, []);
  useEffect(() => { load().catch((err) => setMsg({ error: true, text: errorText(err) })); }, [load]);

  const set = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  const save = async (kind, code, body) => {
    setMsg(null);
    try {
      await api.patch(`/internal/billing/${kind}/${code}`, body);
      setMsg({ error: false, text: 'Enregistré : pris en compte immédiatement.' });
      await load();
    } catch (err) { setMsg({ error: true, text: errorText(err) }); }
  };

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Paliers et prix</h1>
      {msg && <div style={{ color: msg.error ? '#f87171' : '#4ade80', fontSize: 13, marginBottom: 12 }}>{msg.text}</div>}
      <Card title="Paliers (prix mensuel, XAF)">
        <Table columns={['Palier', 'Prix mensuel', 'Modules', 'Crédits inclus', 'Actif', '']} rows={plans} empty="Aucun palier"
          renderRow={(p) => (
            <tr key={p.code}>
              <td style={td}>{p.label} <span style={{ color: '#7b86a3' }}>({p.code})</span></td>
              <td style={td}>{editable
                ? <input style={field} inputMode="numeric" value={draft[`plan:${p.code}`] ?? p.price_monthly} onChange={(e) => set(`plan:${p.code}`, e.target.value.replace(/\D/g, ''))} />
                : p.price_monthly}</td>
              <td style={{ ...td, fontSize: 12 }}>{p.included_modules.join(', ')}</td>
              <td style={td}>{p.included_credits}</td>
              <td style={td}>{p.is_active ? 'oui' : 'non'}</td>
              <td style={td}>{editable && draft[`plan:${p.code}`] != null && (
                <Button onClick={() => save('plans', p.code, { price_monthly: Number(draft[`plan:${p.code}`]) })}>Enregistrer</Button>
              )}</td>
            </tr>
          )} />
      </Card>
      <Card title="Packs de crédits de messages">
        <Table columns={['Pack', 'Crédits', 'Prix (XAF)', 'Actif', '']} rows={packs} empty="Aucun pack"
          renderRow={(k) => (
            <tr key={k.code}>
              <td style={td}>{k.label} <span style={{ color: '#7b86a3' }}>({k.code})</span></td>
              <td style={td}>{k.credits}</td>
              <td style={td}>{editable
                ? <input style={field} inputMode="numeric" value={draft[`pack:${k.code}`] ?? k.price} onChange={(e) => set(`pack:${k.code}`, e.target.value.replace(/\D/g, ''))} />
                : k.price}</td>
              <td style={td}>{k.is_active ? 'oui' : 'non'}</td>
              <td style={td}>{editable && draft[`pack:${k.code}`] != null && (
                <Button onClick={() => save('packs', k.code, { price: Number(draft[`pack:${k.code}`]) })}>Enregistrer</Button>
              )}</td>
            </tr>
          )} />
      </Card>
      {!editable && <div style={{ color: '#7b86a3', fontSize: 12 }}>Lecture seule : seul le super-administrateur modifie les prix.</div>}
    </div>
  );
}
