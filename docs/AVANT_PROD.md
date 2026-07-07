# PayBrain — Ce qui reste avant la prod
*Mise à jour : 29 juin 2026 · Code 100 % prêt, infra validée*

---

## Comment lire ce document

- **Bloquant** = la prod ne peut pas démarrer sans ça
- **Requis avant fonds réels** = la prod peut démarrer en sandbox, mais pas avec de l'argent réel
- **Recommandé** = fortement conseillé avant tout volume significatif

Ordre de priorité : **A → B → C → D**.

---

## A — Créer la société et le compte bancaire (BLOQUANT)

*Sans structure légale, aucun opérateur ne signe et aucun compte de collecte n'est ouvert.*

| Tâche | Qui | Notes |
|-------|-----|-------|
| Créer la société (SARL ou SAS selon juridiction) | Toi + avocat/notaire local | Congo/Cameroun/RDC selon votre marché cible |
| Ouvrir un compte bancaire professionnel | Toi | Banque partenaire locale ou UBA/Ecobank |
| Obtenir le Registre du Commerce (RCCM) | Toi | Délai : 2–4 semaines selon le pays |
| Rédiger les CGU et politique de confidentialité | Avocat | Exigé par MTN, Airtel, CinetPay |
| Rédiger la politique AML/KYC | Avocat/compliance | Exigé avant tout partenariat financier |

---

## B — Obtenir le statut PTSP / agrément (BLOQUANT avant fonds réels)

*Selon le pays, collecter de la monnaie électronique sans agrément est illégal.*

| Tâche | Qui | Notes |
|-------|-----|-------|
| Identifier l'autorité de régulation (BEAC, BCC, COBAC…) | Avocat local | Dépend du pays de domiciliation |
| Déposer le dossier PTSP ou PSP | Toi + avocat | Délai : 1–6 mois selon le pays |
| Obtenir la lettre d'accréditation | Régulateur | Requis pour signer avec MTN/Airtel |
| Mettre en place le capital minimum réglementaire | Toi | Variable selon pays (5M–100M FCFA) |

---

## C — Signer les contrats opérateurs (BLOQUANT)

*Sans contrat signé, aucune clé API de production n'est fournie.*

### MTN Mobile Money
- [ ] Contacter le département Partenariats MTN (MoMo Business) dans ton pays
- [ ] Fournir : RCCM + agrément PTSP + CGU + business plan + KYC entreprise
- [ ] Signer le contrat Collection **et** Disbursement (2 contrats séparés)
- [ ] Récupérer les credentials production : `MTN_SUBSCRIPTION_KEY`, `MTN_API_USER_ID`, `MTN_API_KEY` + variantes Disbursement
- [ ] Faire whitelister l'IP `34.253.60.206` (notre Elastic IP AWS)

### Airtel Money
- [ ] Contacter Airtel Money Business dans ton pays
- [ ] Fournir les mêmes documents que MTN
- [ ] Signer le contrat Collection + Disbursement
- [ ] Récupérer : `AIRTEL_CLIENT_ID`, `AIRTEL_CLIENT_SECRET`, `AIRTEL_DISBURSEMENT_PIN`
- [ ] Faire whitelister l'IP `34.253.60.206`

### CinetPay (cartes Visa/Mastercard)
- [ ] Créer un compte marchand CinetPay sur cinetpay.com
- [ ] Fournir les documents de la société
- [ ] Passer en mode production (sortir du sandbox)
- [ ] Récupérer : `CINETPAY_API_KEY`, `CINETPAY_SITE_ID`
- [ ] Configurer `CINETPAY_NOTIFY_URL` = `https://api.paybrain.io/webhooks/cinetpay`

### Agrégateur USSD (canal USSD)
- [ ] Identifier un agrégateur USSD local (Africa's Talking, Comviva, agrégateur national)
- [ ] Louer un shortcode partagé MTN + Airtel (ex. `*150*X#`)
- [ ] Récupérer : `USSD_SHORTCODE`, `USSD_GATEWAY_IP_ALLOWLIST`
- [ ] Configurer le callback vers `https://api.paybrain.io/ussd`

---

## D — Fournisseurs tiers (BLOQUANT pour certaines fonctionnalités)

### Smile Identity (KYC)
- [ ] Créer un compte Smile Identity (smileidentity.com)
- [ ] Signer le contrat d'accès aux données d'identité (Congo/Cameroun/etc.)
- [ ] Récupérer `SMILE_PARTNER_ID`, `SMILE_API_KEY`, `SMILE_WEBHOOK_SECRET`

### Screening sanctions / AML
- [ ] Choisir un fournisseur (Comply Advantage, Refinitiv, ComplyLaunch pour les early-stage)
- [ ] Créer le compte et signer le contrat
- [ ] Récupérer `SANCTIONS_API_URL`, `SANCTIONS_API_TOKEN`

### Notifications
- [ ] **Email** : créer un compte Postmark (postmarkapp.com) → récupérer `POSTMARK_API_TOKEN`
- [ ] **SMS** : créer un compte Africa's Talking (africastalking.com) → récupérer clés SMS

### Authentification dashboard (Clerk)
- [ ] Dans la console Clerk, créer une **instance production** (distincte du dev)
- [ ] Récupérer `CLERK_SECRET_KEY` (sk_live_…) et `VITE_CLERK_PUBLISHABLE_KEY` (pk_live_…)
- [ ] Configurer les domaines autorisés dans Clerk

### Sentry (monitoring erreurs)
- [ ] Créer un compte Sentry (sentry.io) ou instance self-hosted
- [ ] Créer un projet "paybrain-api"
- [ ] Récupérer le `SENTRY_DSN`

---

## E — Infrastructure AWS (faire une fois, le jour J)

*Le code Terraform est prêt et validé. Ces actions se font dans l'ordre.*

| Étape | Action | Notes |
|-------|--------|-------|
| 1 | Étendre les permissions IAM du déployeur (`paybrain-terraform-deployer`) | `AdministratorAccess` temporaire pendant le 1er apply, à restreindre après |
| 2 | Créer le bucket S3 d'état Terraform (`paybrain-terraform-state`, `eu-west-1`) | Une seule fois |
| 3 | Remplir `terraform/prod.tfvars` avec les valeurs de prod | Ne jamais committer ce fichier |
| 4 | `terraform apply -var-file=prod.tfvars` | Crée VPC, RDS Multi-AZ, ECS, ECR, ALB, WAF, Secrets Manager — ~20 min |
| 5 | Remplir **AWS Secrets Manager** avec tous les credentials §C et §D | Voir liste complète dans `docs/DEPLOYMENT.md` |
| 6 | Générer les secrets internes (`API_KEY_PEPPER`, `JWT_SECRET`, `INTERNAL_API_TOKEN`, webhooks secrets) | `openssl rand -hex 32` pour chacun |
| 7 | Build Docker + push ECR + migration DB + déploiement ECS | Suivi dans `docs/DEPLOYMENT.md` |
| 8 | DNS + TLS (certificat ACM) + `ALLOWED_ORIGINS` | Domaines : `api.paybrain.io`, `dashboard.paybrain.io`, `paybrain.io` |

---

## F — Pen-test externe (REQUIS avant fonds réels)

- [ ] Mandater un cabinet de pen-test externe (ex. Synack, YesWeHack, cabinet local certifié)
- [ ] Fournir : scope (api.paybrain.io), credentials de test, documentation API (Swagger)
- [ ] Attendre le rapport et corriger les findings critiques/hauts
- [ ] Obtenir le rapport de conformité signé (exigé par certains partenaires bancaires)
- [ ] Budget estimé : 3 000–10 000 € selon cabinet

---

## G — Avant d'accepter des marchands réels

- [ ] Définir la politique d'onboarding marchand (KYB — Know Your Business)
- [ ] Préparer les contrats marchands (CGV, CGU spécifiques)
- [ ] Configurer les limites de transaction par marchand (dans l'admin)
- [ ] Mettre en place le process de reversement (fréquence, seuils, validation 4-eyes)
- [ ] Tester end-to-end en sandbox : paiement MTN → reversement → settlement → rapport

---

## Récapitulatif des délais estimés

| Bloc | Délai estimé | Dépend de |
|------|-------------|-----------|
| Société + compte bancaire | 2–6 semaines | Notaire, pays |
| Agrément PTSP | 1–6 mois | Pays, régulateur |
| Contrats MTN + Airtel | 2–8 semaines après agrément | Commercial opérateur |
| CinetPay (compte marchand) | 1–2 semaines | Dossier complet |
| Agrégateur USSD | 2–4 semaines | Disponibilité shortcode |
| Infrastructure AWS | 1 jour | Credentials prêts |
| Pen-test | 2–4 semaines | Cabinet disponible |
| **Total réaliste** | **3–9 mois** | Selon pays et rapidité opérateurs |

---

## Ce qui est déjà prêt (ne rien refaire)

- ✅ Code backend complet (NestJS, Prisma, connecteurs MTN/Airtel/CinetPay)
- ✅ App mobile (Expo/React Native, biométrie, push notifications)
- ✅ Dashboard web (React)
- ✅ Observabilité complète (Prometheus, Grafana, Loki, Tempo, Sentry)
- ✅ Infrastructure Terraform validée (59 ressources, NAT/EIP stable `34.253.60.206`)
- ✅ Migrations DB versionnées
- ✅ Sécurité : HMAC, timingSafeEqual, rate limiting, Argon2id, AES-256-GCM ledger
- ✅ Code review gstack passée — 0 issue critique ouverte
- ✅ Canal USSD prêt côté code (bloqué uniquement sur le shortcode agrégateur)
