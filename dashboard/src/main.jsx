import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ClerkProvider } from '@clerk/clerk-react'
import './index.css'
import App from './App.jsx'
import { ThemeProvider } from './theme.jsx'
import { I18nProvider } from './i18n.jsx'

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

function MissingKey() {
  return (
    <div style={{ fontFamily: 'system-ui', maxWidth: 560, margin: '80px auto', padding: 24, lineHeight: 1.6 }}>
      <h1 style={{ fontSize: 22 }}>Configuration Clerk manquante</h1>
      <p>
        Définis <code>VITE_CLERK_PUBLISHABLE_KEY</code> dans <code>dashboard/.env</code>
        {' '}(clé <code>pk_test_…</code> du dashboard Clerk), puis relance <code>npm run dev</code>.
      </p>
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <I18nProvider>
        {CLERK_KEY ? (
          <ClerkProvider
            publishableKey={CLERK_KEY}
            afterSignOutUrl="/sign-in"
            signInUrl="/sign-in"
            signUpUrl="/sign-up"
          >
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </ClerkProvider>
        ) : (
          <MissingKey />
        )}
      </I18nProvider>
    </ThemeProvider>
  </StrictMode>,
)
