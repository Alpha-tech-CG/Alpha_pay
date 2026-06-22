import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { UserButton } from '@clerk/clerk-react'
import { useTheme } from '../theme'
import { useT } from '../i18n'

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
  developers: 'M8 9l-3 3 3 3M16 9l3 3-3 3',
  profile: 'M20 21a8 8 0 1 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
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
      {tabs.map((tab) => {
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

export default function AppLayout({ children }) {
  const { t, mode, toggle } = useTheme()
  const { t: tr, locale, toggle: toggleLocale } = useT()
  const location = useLocation()
  const [open, setOpen] = useState(false)

  const tabs = [
    { to: '/', icon: 'dashboard', label: tr('nav.dashboard') },
    { to: '/payments', icon: 'payments', label: tr('nav.payments') },
    { to: '/developers', icon: 'developers', label: tr('nav.developers') },
    { to: '/profile', icon: 'profile', label: tr('nav.profile') },
  ]
  const nav = (
    <nav>
      {tabs.map((tab) => (
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
        display: 'flex', flexDirection: 'column',
      }} className="pb-sidebar">
        <div style={{ fontSize: 11, color: t.textMuted, fontWeight: 700, letterSpacing: 2, marginBottom: 4 }}>GROUPE ALPHA</div>
        <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 28 }}>
          Pay<span style={{ color: t.primary }}>Brain</span>
        </div>
        {nav}
      </aside>

      {/* Drawer mobile */}
      {open && (
        <div onClick={() => setOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 40,
        }}>
          <aside onClick={(e) => e.stopPropagation()} style={{
            width: 240, height: '100%', background: t.surface, padding: '24px 16px',
            borderRight: `1px solid ${t.border}`,
          }}>
            <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 28 }}>
              Pay<span style={{ color: t.primary }}>Brain</span>
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
            <button onClick={toggleLocale} style={iconBtn(t)} title="Language">
              {locale === 'fr' ? '🇫🇷 FR' : '🇬🇧 EN'}
            </button>
            <button onClick={toggle} style={iconBtn(t)} title="Theme">
              {mode === 'dark' ? '☀️' : '🌙'}
            </button>
            <UserButton afterSignOutUrl="/sign-in" />
          </div>
        </header>

        <main className="pb-main" style={{ padding: '28px 24px', flex: 1, maxWidth: 1200, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
          {children}
        </main>
      </div>

      <BottomNav tabs={tabs} path={location.pathname} />

      <style>{`
        @media (max-width: 760px) {
          .pb-sidebar { display: none !important; }
          .pb-bottomnav { display: flex !important; }
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
