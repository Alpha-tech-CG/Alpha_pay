import { useEffect, useState, useCallback } from 'react';
import { useUser } from '@clerk/clerk-react';
import { api } from '../api';
import { roleOf, can } from '../rbac';
import { Card, Button, Badge, Table, td } from '../ui';

function fmt(cents) { return (Number(cents) / 100).toLocaleString('fr-FR'); }

export default function Settlements() {
  const { user } = useUser();
  const validatorId = user?.primaryEmailAddress?.emailAddress || 'validator';
  const mayValidate = can(roleOf(user), 'settlement.validate');

  const [batches, setBatches] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setBatches((await api.get('/internal/settlements')).data); } catch { /* ignore */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (id, path, confirmMsg) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(true);
    try { await api.post(`/internal/settlements/${id}/${path}`, path === 'validate' ? { validatorId } : {}); load(); }
    catch (e) { window.alert(e.response?.data?.message || 'Action impossible'); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Settlements — batchs de reversement</h1>
      <Card>
        <Table columns={['Batch', 'Marchand', 'Net', 'Statut', '4-eyes', 'Actions']} rows={batches} empty="Aucun batch"
          renderRow={(b) => (
            <tr key={b.id}>
              <td style={{ ...td, fontFamily: 'monospace', fontSize: 11 }}>{b.batchNumber}</td>
              <td style={{ ...td, fontFamily: 'monospace', fontSize: 11 }}>{b.merchantId?.slice(0, 8)}</td>
              <td style={{ ...td, fontWeight: 700 }}>{fmt(b.netCents)} <span style={{ color: '#7b86a3', fontSize: 11 }}>{b.currency}</span></td>
              <td style={td}><Badge value={b.status} /></td>
              <td style={{ ...td, fontSize: 12, color: '#7b86a3' }}>{b.requiresDoubleValidation ? `${(b.validatedBy || []).length}/2` : 'non requis'}</td>
              <td style={td}>
                {mayValidate ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    {b.status === 'PENDING_VALIDATION' && <Button onClick={() => act(b.id, 'validate')} disabled={busy}>Valider</Button>}
                    {b.status === 'INITIATED' && <Button onClick={() => act(b.id, 'send', 'Émettre l’ordre de paiement (action sensible) ?')} disabled={busy}>Envoyer</Button>}
                    {b.status === 'SENT' && <Button variant="ghost" onClick={() => act(b.id, 'confirm')} disabled={busy}>Confirmer</Button>}
                  </div>
                ) : <span style={{ color: '#7b86a3', fontSize: 12 }}>—</span>}
              </td>
            </tr>
          )} />
      </Card>
      <div style={{ fontSize: 12, color: '#7b86a3' }}>Double validation (4-eyes) : les batchs &gt; 500 000 FCFA exigent 2 validateurs distincts avant l’envoi.</div>
    </div>
  );
}
