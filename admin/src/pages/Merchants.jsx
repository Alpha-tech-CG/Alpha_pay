import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { t } from '../i18n';
import { api, errorText } from '../api';
import { Badge, Button, Card, field, Table, td } from '../ui';

/** Marchands (§M12) : recherche ; la fiche complète s'ouvre sur son propre écran. */
export default function Merchants() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try { setRows((await api.get('/internal/merchants', { params: { q: q || undefined } })).data); } catch (err) { setError(errorText(err)); }
  }, [q]);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>{t('merchants.title')}</h1>
      <Card>
        <form onSubmit={(e) => { e.preventDefault(); load(); }} style={{ display: 'flex', gap: 10 }}>
          <input style={{ ...field, flex: 1 }} placeholder={t('merchants.search')} value={q} onChange={(e) => setQ(e.target.value)} />
          <Button>{t('merchants.searchBtn')}</Button>
        </form>
        {error && <div style={{ color: '#f87171', fontSize: 13, marginTop: 10 }}>{error}</div>}
      </Card>
      <Card>
        <Table columns={[t('merchants.col.name'), t('merchants.col.kyb'), t('merchants.col.status'), t('merchants.col.created'), '']} rows={rows} empty={t('merchants.none')}
          renderRow={(m) => (
            <tr key={m.id}>
              <td style={td}>{m.name}</td>
              <td style={td}><Badge value={m.onboardingStatus} /></td>
              <td style={td}>{m.isActive ? t('merchants.active') : <span style={{ color: '#f87171' }}>{t('merchants.suspended')}</span>}</td>
              <td style={{ ...td, color: '#7b86a3', fontSize: 12 }}>{new Date(m.createdAt).toLocaleDateString('fr-FR')}</td>
              <td style={td}><Link to={`/merchants/${m.id}`} style={{ color: '#00B4D8', fontSize: 13, fontWeight: 700 }}>{t('merchants.sheet')} →</Link></td>
            </tr>
          )} />
      </Card>
    </div>
  );
}
