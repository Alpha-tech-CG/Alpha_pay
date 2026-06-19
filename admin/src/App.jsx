import { Routes, Route, Navigate } from 'react-router-dom';
import { SignIn, SignedIn, SignedOut, RedirectToSignIn, useUser } from '@clerk/clerk-react';
import Layout from './Layout';
import { can, roleOf } from './rbac';
import Search from './pages/Search';
import Kyc from './pages/Kyc';
import Settlements from './pages/Settlements';
import Reconciliation from './pages/Reconciliation';

function Gate({ cap, children }) {
  const { user } = useUser();
  if (cap && !can(roleOf(user), cap)) {
    return <div style={{ color: '#f87171' }}>Accès refusé — votre rôle n’a pas la permission <code>{cap}</code>.</div>;
  }
  return children;
}

function Protected({ cap, children }) {
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
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <SignIn routing="path" path="/sign-in" />
        </div>
      } />
      <Route path="/" element={<Protected cap="search.view"><Search /></Protected>} />
      <Route path="/kyc" element={<Protected cap="kyc.view"><Kyc /></Protected>} />
      <Route path="/settlements" element={<Protected cap="settlement.view"><Settlements /></Protected>} />
      <Route path="/reconciliation" element={<Protected cap="reconciliation.view"><Reconciliation /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
