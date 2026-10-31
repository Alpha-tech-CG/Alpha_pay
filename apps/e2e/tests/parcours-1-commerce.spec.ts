import { expect, request, test } from '@playwright/test';
import { PAY_URL, MOCK_SUCCESS_PHONE, pdf, sessionApi, signUp, staffApi } from '../support';

/**
 * Parcours 1 (§9) : inscription → dossier KYB → paiement test par QR →
 * confirmation Vérif → reçu ; puis validation du dossier par AlphaPay, qui
 * ouvre le mode live (clé ap_live_ autorisée).
 */
test('commerçant : inscription → KYB → paiement test par QR → Vérif → reçu → live ouvert', async ({ page, browser }) => {
  const id = await signUp(page, 'Commerce');

  // ── Dossier entreprise (KYB) et identité du dirigeant (KYC factice) ──
  await page.goto('/kyb');
  const fields: [string, string][] = [
    ['Raison sociale', `${id.name} SARL`],
    ['Forme juridique', 'SARL'],
    ['Numéro RCCM', 'CG-BZV-01-2026-B12-00042'],
    ['NIU', 'M2026000123456'],
    ['Adresse', 'Avenue de la Paix, Brazzaville'],
    ['Secteur d’activité', 'Quincaillerie'],
    ['Prénom du dirigeant', 'Jean'],
    ['Nom du dirigeant', 'Mabiala'],
  ];
  for (const [label, value] of fields) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Brouillon').first()).toBeVisible();

  const files = page.locator('input[type=file]');
  for (const [i, name] of ['rccm.pdf', 'niu.pdf', 'piece-dirigeant.pdf'].entries()) {
    await files.nth(i).setInputFiles({ name, mimeType: 'application/pdf', buffer: pdf(name) });
    await expect(page.getByText(`✓ ${name}`)).toBeVisible();
  }

  const [kyc] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: 'Commencer la vérification' }).click()]);
  await kyc.getByRole('button', { name: 'Envoyer mes pièces' }).click();
  await expect(kyc.getByText('Vérification envoyée')).toBeVisible();
  await kyc.close();
  await page.reload();
  await expect(page.getByText('Identité vérifiée ✓')).toBeVisible();
  await page.getByRole('button', { name: 'Soumettre le dossier' }).click();
  await expect(page.getByText('Soumis').first()).toBeVisible();

  // ── Boutique, caisse, QR ──
  await page.goto('/stores');
  await page.getByLabel('Nom de la boutique').fill('Boutique Plateau');
  await page.getByRole('button', { name: 'Ajouter la boutique' }).click();
  await page.getByPlaceholder('Nom de la caisse (ex. Caisse 1)').fill('Caisse 1');
  await page.getByRole('button', { name: 'Ajouter une caisse' }).click();
  const code = (await page.locator('code').first().textContent())!.trim();
  expect(code).toMatch(/^[A-Za-z0-9]{6,}$/);
  const [qr] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'QR A6' }).click()]);
  expect(qr.suggestedFilename()).toMatch(/A6\.pdf$/);

  // ── Écran Caisse ouvert pendant que le client paie ──
  await page.goto('/caisse');
  await expect(page.getByText('En direct')).toBeVisible();

  // ── Le client scanne le QR : page de paiement hébergée, sans compte ──
  const customer = await browser.newPage();
  await customer.goto(`${PAY_URL}/c/${code}`);
  await customer.locator('#amount').fill('15000');
  await customer.locator('#phone').fill(MOCK_SUCCESS_PHONE);
  const paidAt = Date.now();
  await customer.getByRole('button', { name: 'Payer' }).click();
  await expect(customer.getByText('Paiement réussi')).toBeVisible({ timeout: 60_000 });

  // ── Vérif : confirmation en direct sur l'écran Caisse, sans rechargement (§M5 : < 5 s après le statut final) ──
  await expect(page.getByText(/15\s000\sXAF/).first()).toBeVisible({ timeout: 15_000 });
  expect(Date.now() - paidAt).toBeLessThan(60_000);

  // ── Reçu : lien sur la page de paiement, PDF numéroté ──
  const receiptLink = customer.getByRole('link', { name: 'Télécharger mon reçu' });
  await expect(receiptLink).toBeVisible();
  const href = (await receiptLink.getAttribute('href'))!;
  const anon = await request.newContext({ ignoreHTTPSErrors: !!process.env.E2E_IGNORE_HTTPS_ERRORS });
  const receipt = await anon.get(href);
  expect(receipt.headers()['content-type']).toContain('application/pdf');
  expect((await receipt.body()).subarray(0, 4).toString()).toBe('%PDF');
  await anon.dispose();
  await customer.close();

  // ── Validation du dossier par AlphaPay (back-office), puis mode live ouvert ──
  const s = await sessionApi(page);
  const liveBefore = await page.request.post(`/api/v1/merchants/${s.merchantId}/api-keys`, { headers: s.headers, data: { name: 'Serveur', mode: 'live' } });
  expect(liveBefore.status()).toBe(403); // pas de clé ap_live_ avant l'approbation (§M2)

  const staff = await staffApi();
  const queue = await (await staff.get('/internal/kyb?status=SUBMITTED')).json();
  const items = Array.isArray(queue) ? queue : queue.data;
  const app = items.find((x: any) => JSON.stringify(x).includes(id.name));
  expect(app, 'dossier dans la file du back-office').toBeTruthy();
  expect((await staff.post(`/internal/kyb/${app.id}/review`)).ok()).toBeTruthy();
  const decision = await staff.post(`/internal/kyb/${app.id}/decision`, { data: { decision: 'approve' } });
  expect(decision.ok(), await decision.text()).toBeTruthy();
  await staff.dispose();

  await page.goto('/kyb');
  await expect(page.getByText('Approuvé').first()).toBeVisible();
  const s2 = await sessionApi(page);
  const live = await page.request.post(`/api/v1/merchants/${s2.merchantId}/api-keys`, { headers: s2.headers, data: { name: 'Serveur', mode: 'live' } });
  expect(live.status(), await live.text()).toBe(201);
  expect((await live.json()).key).toMatch(/^ap_live_/);
});
