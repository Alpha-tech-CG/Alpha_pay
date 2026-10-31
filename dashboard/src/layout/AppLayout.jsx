import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/session'
import { useTheme } from '../theme'
import { useT } from '../i18n'
import { useMerchant } from '../merchant'

function NavItem({ to, label, active }) {
  const { t } = useTheme()
  return (
    <Link to={to} style={{
      display: 'block', padding: '10px 14px', borderRadius: 8, marginBottom: 4,
      fontSize: 14, fontWeight: 600, textDecoration: 'none',
      color: active ? t.primaryText : t.text,
      background: active ? t.primary : 'transparent',
    }}>{label}</Link>
  )
}

const ICONS = {
  dashboard: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  payments: 'M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8',
  caisse: 'M20 6L9 17l-5-5',
  kyb: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 15l2 2 4-4',
  developers: 'M8 9l-3 3 3 3M16 9l3 3-3 3',
  team: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  profile: 'M20 21a8 8 0 1 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  billing: 'M2 5h20v14H2zM2 10h20',
  reconciliation: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  links: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  invoices: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5',
  school: 'M22 10L12 5 2 10l10 5 10-5zM6 12v5c3 2 9 2 12 0v-5',
  stores: 'M3 9l1-5h16l1 5M4 9v11h16V9M9 20v-6h6v6',
}
function TabIcon({ d }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

// Barre d'onglets mobile (signature du design Stitch). Masquée en desktop (sidebar).
function BottomNav({ tabs, path }) {
  const { t } = useTheme()
  return (
    <nav className="pb-bottomnav" style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, height: 62, zIndex: 35,
      background: t.surface, borderTop: `1px solid ${t.border}`,
      display: 'none', alignItems: 'stretch',
    }}>
      {tabs.filter((tab) => !tab.desktopOnly).map((tab) => {
        const active = path === tab.to
        return (
          <Link key={tab.to} to={tab.to} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 3, textDecoration: 'none', color: active ? t.primary : t.textMuted, fontSize: 11, fontWeight: 600,
          }}>
            <TabIcon d={ICONS[tab.icon]} />
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}

/** Mode live verrouillé tant que le dossier n'est pas approuvé (§M2) : rappel aux gestionnaires. */
function LiveBanner() {
  const { user } = useAuth()
  const { t: tr } = useT()
  const location = useLocation()
  const m = user?.merchants?.[0]
  if (!m || m.kybStatus === 'APPROVED' || !['OWNER', 'ADMIN'].includes(m.role) || location.pathname === '/kyb') return null
  return (
    <Link to="/kyb" style={{ display: 'block', background: '#FFF4CE', color: '#6B4E00', borderRadius: 10, padding: '10px 14px', fontSize: 14, fontWeight: 600, marginBottom: 16, textDecoration: 'none' }}>
      {tr(m.kybStatus === 'REJECTED' ? 'kyb.banner.rejected' : 'kyb.banner')} →
    </Link>
  )
}

export default function AppLayout({ children }) {
  const { t, mode, toggle } = useTheme()
  const { t: tr, locale, toggle: toggleLocale } = useT()
  const location = useLocation()
  const [open, setOpen] = useState(false)

  const { can } = useMerchant()
  // Écrans selon le rôle (le serveur revérifie) ; un module hors palier reste visible, verrouillé.
  const tabs = [
    { to: '/', icon: 'dashboard', label: tr('nav.dashboard') },
    { to: '/caisse', icon: 'caisse', label: tr('nav.caisse') },
    { to: '/payments', icon: 'payments', label: tr('nav.payments') },
    { to: '/reconciliation', icon: 'reconciliation', label: tr('nav.reconciliation'), desktopOnly: true, show: can('reconciliation:view') || can('cash:declare') },
    { to: '/links', icon: 'links', label: tr('nav.links'), desktopOnly: true, show: can('payments:view') },
    { to: '/invoices', icon: 'invoices', label: tr('nav.invoices'), show: can('invoices:view') },
    { to: '/school', icon: 'school', label: tr('nav.school'), desktopOnly: true, show: can('school:view') },
    { to: '/stores', icon: 'stores', label: tr('nav.stores'), desktopOnly: true, show: can('stores:manage') },
    { to: '/developers', icon: 'developers', label: tr('nav.developers'), desktopOnly: true },
    { to: '/team', icon: 'team', label: tr('nav.team'), desktopOnly: true },
    // Réglage ponctuel : barre latérale seulement, pas dans la barre d'onglets mobile.
    { to: '/kyb', icon: 'kyb', label: tr('nav.kyb'), desktopOnly: true },
    { to: '/operators', icon: 'operators', label: tr('nav.operators'), desktopOnly: true },
    { to: '/billing', icon: 'billing', label: tr('nav.billing'), desktopOnly: true },
    { to: '/profile', icon: 'profile', label: tr('nav.profile') },
  ]
  const visibleTabs = tabs.filter((tab) => tab.show !== false)
  const nav = (
    <nav>
      {visibleTabs.map((tab) => (
        <NavItem key={tab.to} to={tab.to} label={tab.label} active={location.pathname === tab.to} />
      ))}
    </nav>
  )

  return (
    <div style={{ minHeight: '100vh', background: t.bg, color: t.text, display: 'flex' }}>
      {/* Sidebar desktop */}
      <aside style={{
        width: 220, borderRight: `1px solid ${t.border}`, background: t.surface,
        padding: '24px 16px', position: 'sticky', top: 0, height: '100vh',
        display: 'flex', flexDirection: 'column', overflowY: 'auto', boxSizing: 'border-box',
      }} className="pb-sidebar">
        <div style={{ fontSize: 11, color: t.textMuted, fontWeight: 700, letterSpacing: 2, marginBottom: 4 }}>{tr('layout.group')}</div>
        <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 28 }}>
          Alpha<span style={{ color: t.primary }}>Pay</span>
        </div>
        {nav}
      </aside>

      {/* Drawer mobile */}
      {open && (
        <div onClick={() => setOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 40,
        }}>
          <aside onClick={(e) => e.stopPropagation()} style={{
            width: 240, height: '100%', background: t.surface, padding: '24px 16px', overflowY: 'auto', boxSizing: 'border-box',
            borderRight: `1px solid ${t.border}`,
          }}>
            <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 28 }}>
              Alpha<span style={{ color: t.primary }}>Pay</span>
            </div>
            <div onClick={() => setOpen(false)}>{nav}</div>
          </aside>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Topbar */}
        <header style={{
          height: 60, borderBottom: `1px solid ${t.border}`, background: t.surface,
          display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px',
          position: 'sticky', top: 0, zIndex: 30,
        }}>
          <button onClick={() => setOpen(true)} className="pb-burger" style={{
            display: 'none', background: 'transparent', border: 'none', cursor: 'pointer',
            fontSize: 20, color: t.text,
          }}>☰</button>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{tr('dash.title')}</div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={toggleLocale} style={iconBtn(t)} title={tr('layout.language')}>
              {locale === 'fr' ? '🇫🇷 FR' : '🇬🇧 EN'}
            </button>
            <button onClick={toggle} style={iconBtn(t)} title={tr('layout.theme')}>
              {mode === 'dark' ? '☀️' : '🌙'}
            </button>
            <UserMenu />
          </div>
        </header>

        <main className="pb-main" style={{ padding: '28px 24px', flex: 1, maxWidth: 1200, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
          <LiveBanner />
          {children}
        </main>
      </div>

      <BottomNav tabs={visibleTabs} path={location.pathname} />

      <style>{`
        @media (max-width: 760px) {
          .pb-sidebar { display: none !important; }
          .pb-bottomnav { display: flex !important; }
          /* Les écrans hors barre d'onglets restent accessibles par le menu. */
          .pb-burger { display: inline-block !important; }
          .pb-main { padding-bottom: 80px !important; }
        }
      `}</style>
    </div>
  )
}

function iconBtn(t) {
  return {
    background: 'transparent', border: `1px solid ${t.border}`, borderRadius: 8,
    padding: '5px 10px', cursor: 'pointer', fontSize: 13, color: t.text,
  }
}

/** Menu du compte : nom, déconnexion de cet appareil ou de tous. */
function UserMenu() {
  const { t } = useTheme()
  const { t: tr } = useT()
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const initial = (user?.fullName || user?.email || '?').trim().charAt(0).toUpperCase()
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} style={{
        width: 34, height: 34, borderRadius: 9999, border: 'none', cursor: 'pointer',
        background: t.primary, color: t.primaryText, fontWeight: 800,
      }}>{initial}</button>
      {open && (
        <div role="menu" style={{
          position: 'absolute', right: 0, top: 42, minWidth: 220, zIndex: 20,
          background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10, boxShadow: t.shadow, padding: 8,
        }}>
          <div style={{ padding: '6px 10px', fontSize: 13, fontWeight: 700 }}>{user?.fullName}</div>
          <div style={{ padding: '0 10px 8px', fontSize: 12, color: t.textMuted }}>{user?.email}</div>
          <button role="menuitem" onClick={() => logout(false)} style={menuItem(t)}>{tr('nav.signout')}</button>
          <button role="menuitem" onClick={() => logout(true)} style={menuItem(t)}>{tr('auth.logoutAll')}</button>
        </div>
      )}
    </div>
  )
}

function menuItem(t) {
  return {
    display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', fontSize: 13,
    background: 'transparent', border: 'none', borderRadius: 6, color: t.text, cursor: 'pointer',
  }
}
