import { expect, test } from '@playwright/test';
import { PAY_URL, identity, MOCK_SUCCESS_PHONE, sessionApi, signUp, staffApi, waitForMail } from '../support';

/** Date du jour à Brazzaville (UTC+1), AAAA-MM-JJ. */
const todayBzv = () => new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);

/**
 * Parcours 2 (§9) : import école → relance automatique → paiement du parent →
 * facture payée (et impayés de la classe mis à jour).
 */
test('école : import des élèves → relance → paiement du parent → facture payée', async ({ page, browser }) => {
  page.on('dialog', (d) => d.accept());
  await signUp(page, 'Ecole');

  // Palier Établissement attribué par AlphaPay (back-office) : Pack École ouvert.
  const s = await sessionApi(page);
  const staff = await staffApi();
  const plan = await staff.patch(`/internal/merchants/${s.merchantId}/subscription`, { data: { plan_code: 'etablissement', reason: 'Recette de bout en bout' } });
  expect(plan.ok(), await plan.text()).toBeTruthy();
  await staff.dispose();

  // Relances : J0 seulement, envoi à toute heure (la recette peut tourner la nuit).
  await page.goto('/invoices');
  await page.getByRole('tab', { name: 'Relances' }).click();
  await page.getByLabel('Calendrier (jours par rapport à l’échéance)').fill('0');
  await page.getByLabel('Envoi à partir de (h)').fill('0');
  await page.getByLabel("Jusqu'à (h)").fill('24');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Enregistré')).toBeVisible();

  // Année et classe.
  await page.goto('/school');
  await page.getByRole('button', { name: "Créer l'année" }).click();
  await page.getByRole('tab', { name: 'Classes et élèves' }).click();
  await page.getByPlaceholder('Nouvelle classe').fill('CM2 A');
  await page.getByRole('button', { name: '+' }).click();
  await expect(page.getByRole('button', { name: /CM2 A · 0/ })).toBeVisible();

  // Import CSV : 3 élèves valides, 1 ligne en erreur rapportée.
  const parents = [identity('Parent'), identity('Parent'), identity('Parent')];
  const csv = [
    'matricule;prenom;nom;sexe;responsable_nom;responsable_email;responsable_lien',
    ...parents.map((p, i) => `E2E-${i + 1};Élève${i + 1};${p.name.replace(/\s/g, '')};F;${p.name};${p.email};Mère`),
    'E2E-9;Paul;Ngoma;X;;;',
  ].join('\r\n');
  await page.locator('input[type=file]').setInputFiles({ name: 'eleves.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
  await page.getByRole('button', { name: 'Importer' }).click();
  await expect(page.getByText('3 créé(s), 0 mis à jour, 1 ligne(s) en erreur.')).toBeVisible();
  await expect(page.getByText(/Ligne 5/)).toBeVisible();

  // Grille de frais échue aujourd'hui, puis échéanciers générés.
  await page.getByRole('tab', { name: 'Frais' }).click();
  await page.getByRole('button', { name: 'Nouvelle grille de frais' }).click();
  await page.getByLabel('Libellé').fill('Frais CM2');
  await page.getByPlaceholder('Frais (ex. Inscription)').fill('Scolarité 1er trimestre');
  await page.getByPlaceholder('Montant').fill('45000');
  await page.getByLabel('Date limite').fill(todayBzv());
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  const since = Date.now() - 2000;
  await page.getByRole('button', { name: 'Générer les échéanciers' }).click();
  await expect(page.getByText(/3 facture\(s\) créée\(s\)/)).toBeVisible({ timeout: 60_000 });

  // Relance automatique (J0) reçue par le parent, avec son lien de paiement.
  const parent = parents[0];
  const mail = await waitForMail(parent.email, /Rappel/, since, 120_000);
  const link = /https?:\/\/\S+\/l\/[A-Za-z0-9]+/.exec(mail)?.[0];
  expect(link, mail).toBeTruthy();

  // Le parent paie par Mobile Money sur la page hébergée.
  const payer = await browser.newPage();
  await payer.goto(link!.replace(/^https?:\/\/[^/]+/, PAY_URL));
  await expect(payer.getByText(/45\s000/)).toBeVisible();
  await payer.locator('#phone').fill(MOCK_SUCCESS_PHONE);
  await payer.getByRole('button', { name: 'Payer' }).click();
  await expect(payer.getByText('Paiement réussi')).toBeVisible({ timeout: 60_000 });
  await expect(payer.getByRole('link', { name: 'Télécharger mon reçu' })).toBeVisible();
  await payer.close();

  // La facture est payée, sans action de l'école ; les autres restent dues.
  await page.goto('/invoices');
  const row = page.getByRole('button', { name: new RegExp(parent.name) });
  await expect(row.getByText('Payée')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('combobox').first().selectOption('envoyée');
  await expect(page.getByRole('button', { name: /Parent/ })).toHaveCount(2);

  // Tableau de bord école : encaissé et impayés de la classe à jour.
  await page.goto('/school');
  await expect(page.getByText(/45\s000\sXAF encaissés sur 135\s000\sXAF \(33,3 %\)/)).toBeVisible();
});
