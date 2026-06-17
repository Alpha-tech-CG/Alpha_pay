import { Routes, Route, Navigate, useParams } from 'react-router-dom'
import { SignedIn, SignedOut, RedirectToSignIn } from '@clerk/clerk-react'
import { SignInPage, SignUpPage } from './auth/AuthPages'
import AppLayout from './layout/AppLayout'
import DashboardHome from './pages/DashboardHome'
import Profile from './pages/Profile'
import Onboarding from './pages/Onboarding'
import Checkout from './Checkout'

function CheckoutRoute() {
  const { id } = useParams()
  return <Checkout linkId={id} />
}

function Protected({ children }) {
  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut><RedirectToSignIn /></SignedOut>
    </>
  )
}

export default function App() {
  return (
    <Routes>
      {/* Auth (Clerk gère login, signup, mot de passe oublié, vérif email, MFA) */}
      <Route path="/sign-in/*" element={<SignInPage />} />
      <Route path="/sign-up/*" element={<SignUpPage />} />

      {/* Checkout public (lien de paiement) */}
      <Route path="/pay/:id" element={<CheckoutRoute />} />

      {/* Onboarding (protégé, hors layout) */}
      <Route path="/onboarding" element={<Protected><Onboarding /></Protected>} />

      {/* App protégée avec layout */}
      <Route path="/" element={<Protected><AppLayout><DashboardHome /></AppLayout></Protected>} />
      <Route path="/profile" element={<Protected><AppLayout><Profile /></AppLayout></Protected>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
