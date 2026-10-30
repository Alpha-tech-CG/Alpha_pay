import { Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom'
import { ForgotPasswordPage, SignInPage, SignUpPage } from './auth/AuthPages'
import { useAuth } from './auth/session'
import { useT } from './i18n'
import AppLayout from './layout/AppLayout'
import DashboardHome from './pages/DashboardHome'
import Payments from './pages/Payments'
import Developers from './pages/Developers'
import Profile from './pages/Profile'
import Team from './pages/Team'
import Operators from './pages/Operators'
import Caisse from './pages/Caisse'
import Kyb from './pages/Kyb'
import Billing from './pages/Billing'
import InviteAccept from './pages/InviteAccept'
import Checkout from './Checkout'

function CheckoutRoute() {
  const { id } = useParams()
  return <Checkout linkId={id} />
}

/** Routes réservées aux utilisateurs connectés (le serveur revérifie chaque requête). */
function Protected({ children }) {
  const { status } = useAuth()
  const { t } = useT()
  const location = useLocation()
  if (status === 'loading') return <div style={{ padding: 24 }}>{t('common.loading')}</div>
  if (status === 'anonymous') {
    return <Navigate to={`/sign-in?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  }
  return children
}

/** Un utilisateur déjà connecté n'a rien à faire sur les pages de connexion. */
function GuestOnly({ children }) {
  const { status } = useAuth()
  if (status === 'authenticated') return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      {/* Comptes (§M1) : mot de passe + code à usage unique */}
      <Route path="/sign-in" element={<GuestOnly><SignInPage /></GuestOnly>} />
      <Route path="/sign-up" element={<GuestOnly><SignUpPage /></GuestOnly>} />
      <Route path="/forgot-password" element={<GuestOnly><ForgotPasswordPage /></GuestOnly>} />

      {/* Checkout public (lien de paiement) */}
      <Route path="/pay/:id" element={<CheckoutRoute />} />

      {/* Invitation d'équipe : aperçu public, acceptation une fois connecté */}
      <Route path="/invite" element={<InviteAccept />} />

      {/* App protégée avec layout */}
      <Route path="/" element={<Protected><AppLayout><DashboardHome /></AppLayout></Protected>} />
      <Route path="/payments" element={<Protected><AppLayout><Payments /></AppLayout></Protected>} />
      <Route path="/developers" element={<Protected><AppLayout><Developers /></AppLayout></Protected>} />
      <Route path="/team" element={<Protected><AppLayout><Team /></AppLayout></Protected>} />
      <Route path="/kyb" element={<Protected><AppLayout><Kyb /></AppLayout></Protected>} />
      <Route path="/caisse" element={<Protected><AppLayout><Caisse /></AppLayout></Protected>} />
      <Route path="/operators" element={<Protected><AppLayout><Operators /></AppLayout></Protected>} />
      <Route path="/billing" element={<Protected><AppLayout><Billing /></AppLayout></Protected>} />
      <Route path="/profile" element={<Protected><AppLayout><Profile /></AppLayout></Protected>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
