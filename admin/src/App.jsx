import { Routes, Route, Navigate } from 'react-router-dom';
import { SignIn, SignedIn, SignedOut, RedirectToSignIn } from '@clerk/clerk-react';
import Layout from './Layout';
import { can, roleOf } from './rbac';
import { DEMO, useSessionUser } from './session';
import Search from './pages/Search';
import Kyc from './pages/Kyc';
import ClientKyc from './pages/ClientKyc';
import WalletClients from './pages/WalletClients';
import Settlements from './pages/Settlements';
import Reconciliation from './pages/Reconciliation';

function Gate({ cap, children }) {
  const { user } = useSessionUser();
  if (cap && !can(roleOf(user), cap)) {
    return <div style={{ color: '#f87171' }}>Accès refusé — votre rôle n’a pas la permission <code>{cap}</code>.</div>;
  }
  return children;
}

function Protected({ cap, children }) {
  // En démo, pas de Clerk : on rend directement le back-office.
  if (DEMO) return <Layout><Gate cap={cap}>{children}</Gate></Layout>;
  return (
    <>
      <SignedIn><Layout><Gate cap={cap}>{children}</Gate></Layout></SignedIn>
      <SignedOut><RedirectToSignIn /></SignedOut>
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/sign-in/*" element={
        DEMO ? <Navigate to="/" replace /> : (
          <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <SignIn routing="path" path="/sign-in" />
          </div>
        )
      } />
      <Route path="/" element={<Protected cap="search.view"><Search /></Protected>} />
      <Route path="/kyc" element={<Protected cap="kyc.view"><Kyc /></Protected>} />
      <Route path="/client-kyc" element={<Protected cap="kyc.view"><ClientKyc /></Protected>} />
      <Route path="/wallets" element={<Protected cap="wallet.view"><WalletClients /></Protected>} />
      <Route path="/settlements" element={<Protected cap="settlement.view"><Settlements /></Protected>} />
      <Route path="/reconciliation" element={<Protected cap="reconciliation.view"><Reconciliation /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
