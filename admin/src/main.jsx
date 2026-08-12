import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ClerkProvider } from '@clerk/clerk-react';
import App from './App.jsx';
import { DEMO } from './session';
import './index.css';

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function MissingKey() {
  return (
    <div style={{ fontFamily: 'system-ui', maxWidth: 540, margin: '80px auto', padding: 24, lineHeight: 1.6 }}>
      <h1>Configuration Clerk manquante</h1>
      <p>Définis <code>VITE_CLERK_PUBLISHABLE_KEY</code> dans <code>admin/.env</code> puis relance <code>npm run dev</code>.</p>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {DEMO ? (
      // Mode démo : pas de Clerk, accès direct au back-office (rôle admin fictif).
      <BrowserRouter>
        <App />
      </BrowserRouter>
    ) : CLERK_KEY ? (
      <ClerkProvider publishableKey={CLERK_KEY} afterSignOutUrl="/" signInUrl="/sign-in">
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ClerkProvider>
    ) : (
      <MissingKey />
    )}
  </StrictMode>,
);
