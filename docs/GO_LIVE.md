# Mise en production : ce qu'il reste à brancher

La V1 fonctionne de bout en bout avec les fournisseurs factices. Chaque élément
ci-dessous se branche **par configuration** (`infra/vps/secrets/app_env.json`, puis
`dc up -d --force-recreate api worker`, voir `RUNBOOK.md`), sans changer le code.
Responsable : Miche, sauf mention contraire. Cocher au fur et à mesure.

## Avant toute ouverture au public

- [ ] **Avis juridique sur le modèle** (avec l'avocat) : AlphaPay ne détient ni ne
  reçoit jamais les fonds des marchands. Tant qu'il n'est pas rendu, aucun mode live
  n'est ouvert au public (ne valider aucun dossier KYB de client réel).
- [ ] **Hébergement** : VPS de production et VPS de préproduction OVH, DNS des
  quatre domaines (`api`, `pay`, `app`, `admin`), procédure `DEPLOYMENT_VPS.md`.
- [ ] **Sauvegardes** : paire de clés `age` générée hors du serveur, clé publique dans
  le cron, bucket OVH Object Storage, cron installé, **première vérification de
  restauration** faite (`restore.sh`, `RUNBOOK.md` §4).
- [ ] **Premier agent du back-office** (`staff-bootstrap`) et liste `ADMIN_ALLOWED_IPS`.
- [ ] **Prix des paliers** et des packs de crédits saisis dans le back-office
  (Paliers et prix) ; tant qu'un palier payant est à 0, il reste « Sur devis ».
- [ ] **Compte marchand d'AlphaPay** (encaisse les abonnements) : créer le marchand
  AlphaPay, valider son dossier, connecter son compte MTN/Airtel, puis renseigner
  `ALPHAPAY_BILLING_MERCHANT_ID`.
- [ ] **Recette en préproduction** : les deux parcours Playwright passent
  (`RUNBOOK.md` §3).

## Opérateurs Mobile Money

- [ ] **Modèle d'accès API par marchand** (D-006), à confirmer avec MTN et Airtel :
  un compte API par marchand (hypothèse retenue et codée : chaque marchand saisit ses
  identifiants dans **Comptes opérateur**, chiffrés) ou un compte partenaire AlphaPay
  avec sous-comptes. Si c'est le second, seul l'adaptateur change
  (`packages/providers/src/mobile-money/`).
- [ ] **MTN MoMo production** : obtenir l'accès production Congo (URL, devise XAF,
  clé d'abonnement, utilisateur API) ; un marchand pilote connecte son compte
  production ; un paiement réel de faible montant aller-retour ; communiquer à MTN
  l'IP du VPS et l'URL de callback affichée dans **Comptes opérateur** ; renseigner
  `MTN_WEBHOOK_IP_ALLOWLIST` avec leurs plages.
  *Si non prêt au 27 décembre* : livraison en sandbox (`MOBILE_MONEY_TEST_PROVIDER=sandbox`,
  `MTN_SANDBOX_CURRENCY=EUR`).
- [ ] **Airtel Money** : accès sandbox puis production. L'adaptateur est livré et
  testé sur le fournisseur factice et la suite de contrat ; dès réception des accès,
  valider les chemins d'API (D-022) avec un paiement sandbox, puis production.
  Renseigner `AIRTEL_WEBHOOK_IP_ALLOWLIST`.

## Vérification d'identité (KYC)

- [ ] **Contrat Sumsub** : `KYC_PROVIDER=sumsub`, `SUMSUB_APP_TOKEN`,
  `SUMSUB_SECRET_KEY`, `SUMSUB_WEBHOOK_SECRET`, `SUMSUB_LEVEL_NAME` ; déclarer le
  webhook `https://<API_DOMAIN>/webhooks/kyc/sumsub` ; valider les chemins d'API sur
  un dossier réel (D-051).
  *En attendant* : KYC factice en préproduction, et en production validation manuelle
  des pièces par la Conformité avec dérogation motivée (`ADMIN.md`).

## Messages

- [ ] **SMS (Infobip)** : compte, `SMS_PROVIDER=infobip`, `INFOBIP_BASE_URL`,
  `INFOBIP_API_KEY`, nom d'expéditeur « AlphaPay » demandé auprès des opérateurs
  (`SMS_SENDER_ID`), URL d’accusés `https://<API_DOMAIN>/webhooks/messages/infobip?token=<MESSAGING_WEBHOOK_TOKEN>` et réponses STOP sur `…/infobip/inbound`.
  *Sinon* : envoi sous numéro générique.
- [ ] **WhatsApp (Meta Cloud API)** : vérification de l'entreprise chez Meta, numéro
  WhatsApp Business, `WHATSAPP_PROVIDER=meta` et ses quatre variables, webhook
  `https://<API_DOMAIN>/webhooks/messages/whatsapp` (jeton de vérification : `WHATSAPP_VERIFY_TOKEN`). Faire approuver les modèles (textes
  dans `apps/api/src/modules/messaging/templates.catalog.ts`) :
  `alphapay_otp` (catégorie Authentification), `alphapay_paiement_recu`,
  `alphapay_lien_paiement`, `alphapay_invitation_equipe`, `alphapay_notification`,
  `alphapay_facture`, `alphapay_relance`, `alphapay_recu`.
  *Sinon* : bascule automatique sur SMS.
- [ ] **Email** : fournisseur SMTP (Brevo, Amazon SES ou Resend), domaine d'envoi
  vérifié (SPF, DKIM, DMARC), `EMAIL_PROVIDER=smtp`, `SMTP_URL`, `EMAIL_FROM`.
- [ ] **Notifications web push (Vérif)** : générer les clés VAPID une fois
  (`npx web-push generate-vapid-keys`), `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `VAPID_SUBJECT` ; tester sur un vrai téléphone Android.

## Carte bancaire

- [ ] **Partenaire d'acceptation carte** : non signé. L'option reste désactivée
  (`FEATURE_CARD_PAYMENTS=false`) : aucune trace de la carte dans l'interface ni
  l'API. À la signature : adaptateur du partenaire derrière `CardAcquirer`, puis
  activation.

## Divers

- [ ] **Logos officiels MTN et Airtel** pour les QR imprimés : fichiers `mtn.png` et
  `airtel.png` dans `apps/api/assets/operators/` (droits d'usage via les contrats) ;
  à défaut, badge aux couleurs de l'opérateur.
- [ ] **Suivi des erreurs** : projet Sentry, `SENTRY_DSN`.
- [ ] **Sonde externe** sur `https://<API_DOMAIN>/ready`.
- [ ] **Test d'intrusion de base** après la livraison (§8.1).
- [ ] À arbitrer : crédits consommés par les relances et reçus (D-054), limite de
  transactions du palier Gratuit (D-053), rotation des clés de chiffrement (après la V1).
