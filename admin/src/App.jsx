import { Routes, Route, Navigate } from 'react-router-dom';
import { t } from './i18n';
import Layout from './Layout';
import { can } from './rbac';
import { useStaff } from './session';
import Login from './pages/Login';
import Merchants from './pages/Merchants';
import Kyc from './pages/Kyc';
import Billing from './pages/Billing';
import Supervision from './pages/Supervision';
import Reconciliation from './pages/Reconciliation';
import Staff from './pages/Staff';
import Support from './pages/Support';
import MerchantDetail from './pages/MerchantDetail';
import System from './pages/System';
import Audit from './pages/Audit';

function Protected({ cap, children }) {
  const { role } = useStaff();
  if (cap && !can(role, cap)) {
    return <Layout><div style={{ color: '#f87171' }}>{t('common.forbidden')}</div></Layout>;
  }
  return <Layout>{children}</Layout>;
}

export default function App() {
  const { signedIn } = useStaff();
  if (!signedIn) return <Login />;
  return (
    <Routes>
      <Route path="/" element={<Protected cap="merchants.view"><Merchants /></Protected>} />
      <Route path="/merchants/:id" element={<Protected cap="merchants.view"><MerchantDetail /></Protected>} />
      <Route path="/support" element={<Protected cap="support.view"><Support /></Protected>} />
      <Route path="/system" element={<Protected cap="system.view"><System /></Protected>} />
      <Route path="/audit" element={<Protected cap="audit.view"><Audit /></Protected>} />
      <Route path="/kyc" element={<Protected cap="kyc.view"><Kyc /></Protected>} />
      <Route path="/billing" element={<Protected cap="billing.view"><Billing /></Protected>} />
      <Route path="/supervision" element={<Protected cap="supervision.view"><Supervision /></Protected>} />
      <Route path="/reconciliation" element={<Protected cap="reconciliation.view"><Reconciliation /></Protected>} />
      <Route path="/staff" element={<Protected cap="staff.manage"><Staff /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
