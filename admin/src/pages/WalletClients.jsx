import { useEffect, useState, useCallback } from 'react';
import { useSessionUser as useUser } from '../session';
import { api } from '../api';
import { roleOf, can } from '../rbac';
import { Card, Button, Badge, Table, td } from '../ui';

// Filtres statut. « Bloqués » = WalletStatus.SUSPENDED côté API.
const FILTERS = [
  { key: '', label: 'Tous' },
  { key: 'PENDING_VERIFICATION', label: 'En attente' },
  { key: 'ACTIVE', label: 'Actifs' },
  { key: 'SUSPENDED', label: 'Bloqués' },
];

const xaf = (cents) => (Number(cents || 0) / 100).toLocaleString('fr-FR', { maximumFractionDigits: 0 });
const dt = (v) => (v ? new Date(v).toLocaleString('fr-FR') : '—');

export default function WalletClients() {
  const { user } = useUser();
  const role = roleOf(user);
  const officer = user?.primaryEmailAddress?.emailAddress || 'officer';
  const mayAct = can(role, 'wallet.block');

  const [status, setStatus] = useState('');
  const [phone, setPhone] = useState('');
  const [rows, setRows] = useState([]);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (statusArg, phoneArg) => {
    try {
      const params = { limit: 50 };
      if (statusArg) params.status = statusArg;
      if (phoneArg) params.phone = phoneArg;
      setRows((await api.get('/internal/wallets', { params })).data);
    } catch { /* ignore */ }
  }, []);

  // Debounce 300ms : couvre la recherche téléphone ET le changement de filtre.
  useEffect(() => {
    const t = setTimeout(() => load(status, phone), 300);
    return () => clearTimeout(t);
  }, [status, phone, load]);

  const open = async (id) => {
    try { setDetail((await api.get(`/internal/wallets/${id}`)).data); } catch { /* ignore */ }
  };

  const act = async (id, action, label) => {
    let reason;
    if (action === 'activate') {
      if (!window.confirm('Confirmer l’activation de ce wallet ?')) return;
    } else {
      // Blocage / déblocage : motif obligatoire (action sensible).
      reason = window.prompt(`Motif du ${label} (obligatoire) :`);
      if (!reason) return; // annulation ou motif vide
    }
    setBusy(true);
    try {
      await api.post(`/internal/wallets/${id}/${action}`, { officer, reason });
      setDetail(null);
      load(status, phone);
    } catch (e) {
      window.alert(e?.response?.data?.message || 'Action refusée');
    } finally {
      setBusy(false);
    }
  };

  // Rattachement d'un wallet comme caissier d'un marchand (remplace le
  // rattachement manuel en DB — AVANT_PROD §0.7).
  const attachCashier = async (id) => {
    const merchantId = window.prompt('ID du marchand pour lequel ce wallet encaissera :');
    if (!merchantId || !merchantId.trim()) return;
    setBusy(true);
    try {
      await api.post(`/internal/wallets/${id}/attach-cashier`, { merchantId: merchantId.trim(), officer });
      setDetail(null);
      load(status, phone);
    } catch (e) {
      window.alert(e?.response?.data?.message || 'Rattachement refusé');
    } finally {
      setBusy(false);
    }
  };

  const detachCashier = async (id) => {
    const reason = window.prompt('Motif du détachement (obligatoire) :');
    if (!reason) return;
    setBusy(true);
    try {
      await api.post(`/internal/wallets/${id}/detach-cashier`, { officer, reason });
      setDetail(null);
      load(status, phone);
    } catch (e) {
      window.alert(e?.response?.data?.message || 'Détachement refusé');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Wallets clients</h1>

      <Card>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          {FILTERS.map((f) => (
            <Button key={f.key || 'all'} variant={status === f.key ? 'primary' : 'ghost'} onClick={() => setStatus(f.key)}>
              {f.label}
            </Button>
          ))}
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Rechercher un numéro…"
            style={{
              marginLeft: 'auto', minWidth: 220, padding: '7px 12px', borderRadius: 8,
              border: '1px solid #2c3450', background: '#0f1424', color: '#e6ebf5', fontSize: 13,
            }}
          />
        </div>

        <Table
          columns={['Téléphone', 'Nom', 'Statut', 'Solde (XAF)', 'KYC', 'Créé le', '']}
          rows={rows}
          empty="Aucun wallet"
          renderRow={(w) => (
            <tr key={w.id}>
              <td style={{ ...td, fontFamily: 'monospace' }}>{w.phone}</td>
              <td style={td}>{w.fullName || '—'}</td>
              <td style={td}><Badge value={w.status} /></td>
              <td style={{ ...td, textAlign: 'right' }}>{xaf(w.balanceCents)}</td>
              <td style={td}>{w.kycLevel}</td>
              <td style={{ ...td, color: '#7b86a3', fontSize: 12 }}>{dt(w.createdAt)}</td>
              <td style={td}><Button variant="ghost" onClick={() => open(w.id)}>Ouvrir</Button></td>
            </tr>
          )}
        />
      </Card>

      {detail && (
        <Card title={`Wallet ${detail.phone}`}>
          <div style={{ fontSize: 13, marginBottom: 6 }}>
            Statut : <Badge value={detail.status} /> · Solde : <strong>{xaf(detail.balanceCents)} XAF</strong> · KYC : {detail.kycLevel}
          </div>
          <div style={{ fontSize: 12, color: '#7b86a3', marginBottom: 6 }}>
            {detail.fullName || 'Nom non renseigné'} · Créé le {dt(detail.createdAt)}
          </div>
          <div style={{ fontSize: 12, color: '#7b86a3', marginBottom: 14 }}>
            Rôle : <strong style={{ color: '#e6ebf5' }}>{detail.role || 'CLIENT'}</strong>
            {detail.role === 'MERCHANT_CASHIER' && detail.merchantId ? (
              <> · caissier du marchand <span style={{ fontFamily: 'monospace' }}>{detail.merchantId}</span></>
            ) : null}
          </div>

          <div style={{ fontSize: 12, color: '#7b86a3', marginBottom: 6, letterSpacing: 1 }}>10 DERNIÈRES TRANSACTIONS</div>
          <Table
            columns={['Type', 'Montant (XAF)', 'Statut', 'Description', 'Date']}
            rows={detail.transactions || []}
            empty="Aucune transaction"
            renderRow={(t) => (
              <tr key={t.id}>
                <td style={td}>{t.type}</td>
                <td style={{ ...td, textAlign: 'right' }}>{xaf(t.amountCents)}</td>
                <td style={td}><Badge value={t.status} /></td>
                <td style={{ ...td, color: '#7b86a3' }}>{t.description || '—'}</td>
                <td style={{ ...td, color: '#7b86a3', fontSize: 12 }}>{dt(t.createdAt)}</td>
              </tr>
            )}
          />

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            {mayAct && detail.status === 'PENDING_VERIFICATION' && (
              <Button onClick={() => act(detail.id, 'activate', 'activation')} disabled={busy}>Activer</Button>
            )}
            {mayAct && detail.status === 'ACTIVE' && (
              <Button variant="danger" onClick={() => act(detail.id, 'block', 'blocage')} disabled={busy}>Bloquer</Button>
            )}
            {mayAct && detail.status === 'SUSPENDED' && (
              <Button style={{ background: '#d97706', color: '#fff' }} onClick={() => act(detail.id, 'unblock', 'déblocage')} disabled={busy}>Débloquer</Button>
            )}
            {mayAct && detail.role !== 'MERCHANT_CASHIER' && detail.status !== 'CLOSED' && (
              <Button variant="ghost" onClick={() => attachCashier(detail.id)} disabled={busy}>Rattacher comme caissier</Button>
            )}
            {mayAct && detail.role === 'MERCHANT_CASHIER' && (
              <Button variant="ghost" onClick={() => detachCashier(detail.id)} disabled={busy}>Détacher du marchand</Button>
            )}
            {!mayAct && <span style={{ color: '#7b86a3', fontSize: 12, alignSelf: 'center' }}>Lecture seule (rôle sans permission d’action).</span>}
            <Button variant="ghost" onClick={() => setDetail(null)}>Fermer</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
