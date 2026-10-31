import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../api';
import { t } from '../i18n';
import { ROLE_LABEL } from '../rbac';
import { useStaff } from '../session';
import { Button, Card, Table, td } from '../ui';

const field = { padding: '7px 9px', borderRadius: 6, border: '1px solid #2c3450', background: '#0f1320', color: '#e6e9f2', fontSize: 13 };
const EMPTY = { email: '', display_name: '', role: 'SUPPORT', password: '' };

/**
 * Comptes du personnel (§M12, super-administrateur) : création, réinitialisation
 * de l'authentification à deux facteurs (téléphone perdu), désactivation au départ.
 */
export default function Staff() {
  const { staff } = useStaff();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => setUsers((await api.get('/internal/staff/users')).data), []);
  useEffect(() => { load().catch((err) => setMsg({ error: true, text: errorText(err) })); }, [load]);

  const run = async (fn, ok) => {
    setMsg(null);
    try { await fn(); setMsg({ error: false, text: ok }); await load(); } catch (err) { setMsg({ error: true, text: errorText(err) }); }
  };
  const create = (e) => {
    e.preventDefault();
    run(async () => { await api.post('/internal/staff/users', form); setForm(EMPTY); }, t('staff.created'));
  };
  const resetTotp = (u) => {
    if (!window.confirm(t('staff.resetConfirm', { name: u.displayName }))) return;
    run(() => api.post(`/internal/staff/users/${u.id}/reset-totp`), t('staff.resetDone'));
  };
  const setActive = (u, active) => run(() => api.post(`/internal/staff/users/${u.id}/active`, { active }), active ? t('staff.activated') : t('staff.deactivated'));
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>{t('staff.title')}</h1>
      {msg && <div style={{ color: msg.error ? '#f87171' : '#4ade80', fontSize: 13, marginBottom: 12 }}>{msg.text}</div>}
      <Card title={t('staff.list')}>
        <Table columns={[t('staff.col.name'), t('staff.col.email'), t('staff.col.role'), t('staff.col.totp'), t('staff.col.lastLogin'), '']} rows={users} empty={t('staff.none')}
          renderRow={(u) => (
            <tr key={u.id} style={{ opacity: u.isActive ? 1 : 0.5 }}>
              <td style={td}>{u.displayName}{!u.isActive && <span style={{ color: '#f87171' }}> · {t('staff.inactive')}</span>}</td>
              <td style={td}>{u.email}</td>
              <td style={td}>{ROLE_LABEL[u.role] ?? u.role}</td>
              <td style={td}>{u.totpEnabled ? t('common.yes') : t('staff.totpPending')}</td>
              <td style={td}>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('fr-FR') : '—'}</td>
              <td style={{ ...td, display: 'flex', gap: 6 }}>
                {u.totpEnabled && <Button variant="ghost" onClick={() => resetTotp(u)}>{t('staff.resetTotp')}</Button>}
                {u.id !== staff?.id && (u.isActive
                  ? <Button variant="danger" onClick={() => setActive(u, false)}>{t('staff.deactivate')}</Button>
                  : <Button variant="ghost" onClick={() => setActive(u, true)}>{t('staff.activate')}</Button>)}
              </td>
            </tr>
          )} />
      </Card>
      <Card title={t('staff.new')}>
        <form onSubmit={create} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input style={field} type="email" required placeholder={t('staff.col.email')} value={form.email} onChange={set('email')} />
          <input style={field} required minLength={2} placeholder={t('staff.col.name')} value={form.display_name} onChange={set('display_name')} />
          <select style={field} value={form.role} onChange={set('role')}>
            {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input style={field} type="password" required minLength={12} autoComplete="new-password" placeholder={t('staff.password')} value={form.password} onChange={set('password')} />
          <Button>{t('staff.create')}</Button>
        </form>
        <p style={{ fontSize: 12, color: '#7b86a3', margin: '10px 0 0' }}>{t('staff.passwordHint')}</p>
      </Card>
    </div>
  );
}
