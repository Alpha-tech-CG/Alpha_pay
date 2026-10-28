import { Link, useLocation } from 'react-router-dom';
import { can, ROLE_LABEL } from './rbac';
import { useStaff } from './session';

const NAV = [
  { to: '/', label: 'Marchands', cap: 'merchants.view' },
  { to: '/kyc', label: 'Dossiers KYB', cap: 'kyc.view' },
  { to: '/billing', label: 'Paliers et prix', cap: 'billing.view' },
  { to: '/supervision', label: 'Supervision', cap: 'supervision.view' },
  { to: '/reconciliation', label: 'Réconciliation', cap: 'reconciliation.view' },
];

export default function Layout({ children }) {
  const { staff, role, logout } = useStaff();
  const loc = useLocation();
  const items = NAV.filter((n) => can(role, n.cap));

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{ width: 220, background: '#161b2e', borderRight: '1px solid #232a40', padding: '20px 14px' }}>
        <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 4 }}>
          Alpha<span style={{ color: '#00B4D8' }}>Pay</span>
        </div>
        <div style={{ fontSize: 11, color: '#7b86a3', marginBottom: 24, letterSpacing: 1 }}>BACK-OFFICE</div>
        <nav>
          {items.map((n) => (
            <Link key={n.to} to={n.to} style={{
              display: 'block', padding: '9px 12px', borderRadius: 8, marginBottom: 4, fontSize: 14,
              textDecoration: 'none', fontWeight: 600,
              background: loc.pathname === n.to ? '#0B1E3D' : 'transparent',
              color: loc.pathname === n.to ? '#00B4D8' : '#c4cce0',
            }}>{n.label}</Link>
          ))}
        </nav>
      </aside>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <header style={{ height: 56, borderBottom: '1px solid #232a40', display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px', background: '#141929' }}>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: '#c4cce0' }}>{staff?.email}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#00B4D8' }}>{ROLE_LABEL[role] ?? role}</span>
          <button onClick={logout} style={{ background: 'transparent', border: '1px solid #2c3450', color: '#c4cce0', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>Déconnexion</button>
        </header>
        <main style={{ padding: 24, flex: 1, maxWidth: 1100 }}>{children}</main>
      </div>
    </div>
  );
}
