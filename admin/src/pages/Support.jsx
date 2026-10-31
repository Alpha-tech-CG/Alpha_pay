import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorText } from '../api';
import { t } from '../i18n';
import { Badge, Button, Card, field, muted, Table, td, when } from '../ui';
import PaymentDetail from './PaymentDetail';

/**
 * Assistance (§M12) : le client appelle avec une référence, un numéro, un
 * identifiant de paiement ou de webhook, un préfixe de clé ou son nom ; une
 * seule recherche mène au paiement ou à la fiche du marchand.
 */
export default function Support() {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState(null);

  const search = async (e) => {
    e.preventDefault();
    setError(null); setOpen(null);
    try {
      const r = (await api.get('/internal/support/search', { params: { q } })).data;
      setRes(r);
      if (r.payments.length === 1 && r.merchants.length === 0) setOpen(r.payments[0].id);
    } catch (err) { setError(errorText(err)); }
  };

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>{t('support.title')}</h1>
      <p style={{ ...muted, fontSize: 13, marginTop: 0, marginBottom: 16 }}>{t('support.intro')}</p>
      <Card>
        <form onSubmit={search} style={{ display: 'flex', gap: 10 }}>
          <input style={{ ...field, flex: 1 }} placeholder={t('support.placeholder')} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <Button>{t('merchants.searchBtn')}</Button>
        </form>
        {error && <div style={{ color: '#f87171', fontSize: 13, marginTop: 10 }}>{error}</div>}
      </Card>

      {res && (
        <>
          <Card title={t('support.payments', { n: res.payments.length })}>
            <Table columns={[t('pay.col.date'), t('pay.merchant'), t('pay.col.reference'), t('pay.amount'), t('pay.operator'), t('pay.status'), '']} rows={res.payments} empty={t('support.noPayment')}
              renderRow={(p) => (
                <tr key={p.id}>
                  <td style={{ ...td, fontSize: 12 }}>{when(p.created_at)}</td>
                  <td style={td}><Link to={`/merchants/${p.merchant_id}`} style={{ color: '#00B4D8' }}>{p.merchant_name}</Link></td>
                  <td style={td}>{p.reference}{p.livemode ? '' : ' (test)'}</td>
                  <td style={td}>{p.display}</td>
                  <td style={td}>{p.operator}</td>
                  <td style={td}><Badge value={p.status} /></td>
                  <td style={td}><Button variant="ghost" onClick={() => setOpen(p.id)}>{t('common.open')}</Button></td>
                </tr>
              )} />
          </Card>
          {open && <PaymentDetail id={open} onClose={() => setOpen(null)} />}
          <Card title={t('support.merchants', { n: res.merchants.length })}>
            <Table columns={[t('merchants.col.name'), t('merchants.col.kyb'), t('merchants.col.status'), '']} rows={res.merchants} empty={t('merchants.none')}
              renderRow={(m) => (
                <tr key={m.id}>
                  <td style={td}>{m.name}</td>
                  <td style={td}><Badge value={m.onboardingStatus} /></td>
                  <td style={td}>{m.isActive ? t('merchants.active') : <span style={{ color: '#f87171' }}>{t('merchants.suspended')}</span>}</td>
                  <td style={td}><Link to={`/merchants/${m.id}`} style={{ color: '#00B4D8', fontSize: 13, fontWeight: 700 }}>{t('merchants.sheet')} →</Link></td>
                </tr>
              )} />
          </Card>
        </>
      )}
    </div>
  );
}
