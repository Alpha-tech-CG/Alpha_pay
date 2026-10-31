import { defineConfig, devices } from '@playwright/test';

/**
 * Parcours de bout en bout (§9) contre une pile déjà lancée :
 * - local : `docker compose up -d --build` (mocks par défaut, MailHog) ;
 * - préproduction : mêmes variables pointées sur les URL de préproduction.
 *
 * E2E_DASHBOARD_URL  tableau de bord (défaut http://localhost:5174)
 * E2E_API_URL        API, page de paiement hébergée (défaut http://localhost:3000)
 * E2E_MAILHOG_URL    boîte de réception des emails de test (défaut http://localhost:8025)
 * E2E_STAFF_*        agent back-office (sinon créé par docker compose en local)
 * E2E_PAY_URL        page de paiement hébergée (défaut : E2E_API_URL)
 * E2E_COMPOSE        arguments docker compose de la pile locale (agent créé dedans)
 * E2E_IGNORE_HTTPS_ERRORS  certificats locaux de Caddy (recette *.localhost)
 * E2E_CHANNEL        « chrome » pour utiliser Chrome installé plutôt que Chromium
 */
export default defineConfig({
  testDir: './tests',
  timeout: 240_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  globalSetup: './global-setup.ts',
  use: {
    baseURL: process.env.E2E_DASHBOARD_URL ?? 'http://localhost:5174',
    locale: 'fr-FR',
    timezoneId: 'Africa/Brazzaville',
    ignoreHTTPSErrors: !!process.env.E2E_IGNORE_HTTPS_ERRORS,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Vidéo sur demande (E2E_VIDEO=1) : demande ffmpeg (`npx playwright install ffmpeg`).
    video: process.env.E2E_VIDEO ? 'retain-on-failure' : 'off',
  },
  projects: [
    {
      // Mobile d'abord (§8.3) : les parcours tournent sur un téléphone de milieu de gamme.
      name: 'mobile',
      use: { ...devices['Pixel 7'], ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}) },
    },
  ],
});
