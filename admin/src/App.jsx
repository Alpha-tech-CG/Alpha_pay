import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './Layout';
import { can } from './rbac';
import { useStaff } from './session';
import Login from './pages/Login';
import Merchants from './pages/Merchants';
import Kyc from './pages/Kyc';
import Billing from './pages/Billing';
import Supervision from './pages/Supervision';
import Reconciliation from './pages/Reconciliation';

function Protected({ cap, children }) {
  const { role } = useStaff();
  if (cap && !can(role, cap)) {
    return <Layout><div style={{ color: '#f87171' }}>Accès refusé pour votre rôle.</div></Layout>;
  }
  return <Layout>{children}</Layout>;
}

export default function App() {
  const { signedIn } = useStaff();
  if (!signedIn) return <Login />;
  return (
    <Routes>
      <Route path="/" element={<Protected cap="merchants.view"><Merchants /></Protected>} />
      <Route path="/kyc" element={<Protected cap="kyc.view"><Kyc /></Protected>} />
      <Route path="/billing" element={<Protected cap="billing.view"><Billing /></Protected>} />
      <Route path="/supervision" element={<Protected cap="supervision.view"><Supervision /></Protected>} />
      <Route path="/reconciliation" element={<Protected cap="reconciliation.view"><Reconciliation /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
