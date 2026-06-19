import { useEffect, useState, useCallback } from 'react';
import { api } from '../api';
import { Card, Badge, Table, td } from '../ui';

export default function Reconciliation() {
  const [runs, setRuns] = useState([]);
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => {
    try { setRuns((await api.get('/internal/reconciliation/runs')).data); } catch { /* ignore */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const open = async (id) => setDetail((await api.get(`/internal/reconciliation/runs/${id}`)).data);

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Réconciliation — écarts</h1>
      <Card>
        <Table columns={['Opérateur', 'Date', 'Lignes', 'Rapprochées', 'Écarts', 'Alerte', '']} rows={runs} empty="Aucun run"
          renderRow={(r) => (
            <tr key={r.id}>
              <td style={td}>{r.operator}</td>
              <td style={td}>{new Date(r.statementDate).toLocaleDateString('fr-FR')}</td>
              <td style={td}>{r.statementLines}</td>
              <td style={td}>{r.matchedCount}</td>
              <td style={{ ...td, fontWeight: 700, color: r.discrepancyCount ? '#d97706' : '#16a34a' }}>{r.discrepancyCount}</td>
              <td style={td}>{r.alert ? <span style={{ color: '#dc2626', fontWeight: 700 }}>P1</span> : '—'}</td>
              <td style={td}><a href="#" onClick={(e) => { e.preventDefault(); open(r.id); }} style={{ color: '#5b7cfa', fontSize: 12 }}>Détail</a></td>
            </tr>
          )} />
      </Card>

      {detail && (
        <Card title={`Run ${detail.operator} — ${detail.discrepancies?.length || 0} écart(s)`}>
          <Table columns={['Type', 'Référence', 'Ledger', 'Relevé', 'Détail']} rows={detail.discrepancies || []} empty="Aucun écart"
            renderRow={(d) => (
              <tr key={d.id}>
                <td style={td}><Badge value={d.type} /></td>
                <td style={{ ...td, fontFamily: 'monospace', fontSize: 11 }}>{d.reference}</td>
                <td style={td}>{d.ledgerAmount != null ? (Number(d.ledgerAmount) / 100).toLocaleString('fr-FR') : '—'}</td>
                <td style={td}>{d.statementAmount != null ? (Number(d.statementAmount) / 100).toLocaleString('fr-FR') : '—'}</td>
                <td style={{ ...td, color: '#7b86a3', fontSize: 12 }}>{d.details}</td>
              </tr>
            )} />
        </Card>
      )}
    </div>
  );
}
