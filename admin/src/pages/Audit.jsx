import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../api';
import { t } from '../i18n';
import { Button, Card, field } from '../ui';
import { AuditTable } from './MerchantDetail';

const ACTORS = ['', 'staff', 'user', 'api_key', 'system'];

/** Journal d'audit global (§M12) : qui a fait quoi, agents compris ; filtres par action et par auteur. */
export default function Audit() {
  const [filter, setFilter] = useState({ action: '', actor_type: '' });
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);

  const fetchPage = useCallback((cursor) => {
    const params = { ...(filter.action ? { action: filter.action } : {}), ...(filter.actor_type ? { actor_type: filter.actor_type } : {}), ...(cursor ? { cursor } : {}) };
    return api.get('/internal/support/audit', { params }).then((r) => r.data);
  }, [filter]);
  const load = useCallback(() => fetchPage().then(setRows).catch((err) => setError(errorText(err))), [fetchPage]);
  useEffect(() => { load(); }, [load]);
  const more = () => fetchPage(rows.at(-1)?.id).then((next) => setRows((r) => [...r, ...next])).catch((err) => setError(errorText(err)));

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>{t('audit.title')}</h1>
      <Card>
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={{ ...field, flex: 1 }} placeholder={t('audit.actionPlaceholder')} defaultValue={filter.action}
            onKeyDown={(e) => e.key === 'Enter' && setFilter((f) => ({ ...f, action: e.currentTarget.value.trim() }))} />
          <select style={field} value={filter.actor_type} onChange={(e) => setFilter((f) => ({ ...f, actor_type: e.target.value }))}>
            {ACTORS.map((a) => <option key={a} value={a}>{a ? t(`audit.actor.${a}`) : t('audit.allActors')}</option>)}
          </select>
        </div>
        {error && <div style={{ color: '#f87171', fontSize: 13, marginTop: 10 }}>{error}</div>}
      </Card>
      <Card>
        <AuditTable rows={rows} showMerchant />
        {rows.length > 0 && rows.length % 100 === 0 && <div style={{ marginTop: 12 }}><Button variant="ghost" onClick={more}>{t('audit.more')}</Button></div>}
      </Card>
    </div>
  );
}
