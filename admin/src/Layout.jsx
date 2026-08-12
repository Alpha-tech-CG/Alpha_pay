import { Link, useLocation } from 'react-router-dom';
import { UserButton } from '@clerk/clerk-react';
import { can, roleOf } from './rbac';
import { DEMO, useSessionUser } from './session';
import { useIdleLogout } from './useIdleLogout';

const NAV = [
  { to: '/', label: 'Recherche', cap: 'search.view' },
  { to: '/kyc', label: 'KYC marchands', cap: 'kyc.view' },
  { to: '/client-kyc', label: '🪪 Pièces d’identité clients', cap: 'kyc.view' },
  { to: '/wallets', label: '👛 Wallets clients', cap: 'wallet.view' },
  { to: '/settlements', label: 'Settlements', cap: 'settlement.view' },
  { to: '/reconciliation', label: 'Réconciliation', cap: 'reconciliation.view' },
];

export default function Layout({ children }) {
  useIdleLogout();
  const { user } = useSessionUser();
  const role = roleOf(user);
  const loc = useLocation();
  const items = NAV.filter((n) => can(role, n.cap));

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{ width: 220, background: '#161b2e', borderRight: '1px solid #232a40', padding: '20px 14px' }}>
        <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 4 }}>
          Pay<span style={{ color: '#5b7cfa' }}>Brain</span>
        </div>
        <div style={{ fontSize: 11, color: '#7b86a3', marginBottom: 24, letterSpacing: 1 }}>BACK-OFFICE</div>
        <nav>
          {items.map((n) => (
            <Link key={n.to} to={n.to} style={{
              display: 'block', padding: '9px 12px', borderRadius: 8, marginBottom: 4, fontSize: 14,
              textDecoration: 'none', fontWeight: 600,
              background: loc.pathname === n.to ? '#5b7cfa' : 'transparent',
              color: loc.pathname === n.to ? '#fff' : '#c4cce0',
            }}>{n.label}</Link>
          ))}
        </nav>
      </aside>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <header style={{ height: 56, borderBottom: '1px solid #232a40', display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px', background: '#141929' }}>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: '#7b86a3' }}>Rôle :</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#5b7cfa', textTransform: 'uppercase' }}>{role}</span>
          {DEMO
            ? <span style={{ fontSize: 11, fontWeight: 700, color: '#d97706', border: '1px solid #d97706', borderRadius: 6, padding: '2px 8px' }}>DÉMO</span>
            : <UserButton afterSignOutUrl="/sign-in" />}
        </header>
        <main style={{ padding: 24, flex: 1, maxWidth: 1100 }}>{children}</main>
      </div>
    </div>
  );
}
