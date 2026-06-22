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

export default function AppLayout({ children }) {
  const { t, mode, toggle } = useTheme()
  const { t: tr, locale, toggle: toggleLocale } = useT()
  const location = useLocation()
  const [open, setOpen] = useState(false)

  const nav = (
    <nav>
      <NavItem to="/" label={tr('nav.dashboard')} active={location.pathname === '/'} />
      <NavItem to="/payments" label={tr('nav.payments')} active={location.pathname === '/payments'} />
      <NavItem to="/developers" label={tr('nav.developers')} active={location.pathname === '/developers'} />
      <NavItem to="/profile" label={tr('nav.profile')} active={location.pathname === '/profile'} />
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

        <main style={{ padding: '28px 24px', flex: 1, maxWidth: 1200, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
          {children}
        </main>
      </div>

      <style>{`
        @media (max-width: 760px) {
          .pb-sidebar { display: none !important; }
          .pb-burger { display: inline-block !important; }
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
