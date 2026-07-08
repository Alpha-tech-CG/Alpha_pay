# PayBrain — Verdict « prêt pour la production »
*8 juillet 2026*

## Résumé en une phrase

**Le code de la V1 est prêt et testé** (260 tests verts, `tsc` propre, 5/5 durcissements
sécurité faits) ; le lancement en production réel est **bloqué par des étapes
administratives/partenaires**, pas par le code — au premier rang la finalisation de
l'agrément via la banque partenaire.

## Feu vert — ce qui est prêt côté code ✅

| Domaine | État |
|--------|------|
| Encaissement marchand (API MTN/Airtel/CinetPay, webhooks signés, paylinks, checkout) | ✅ |
| Wallet client : cash-in/out, P2P, paiement QR & lien, **multi-devises** | ✅ |
| App de paiement en ligne `apps/checkout` (« Payer avec PayBrain ») | ✅ |
| Apps mobiles client + caissier (Expo, design Kinetic Ledger) | ✅ |
| Settlement / reversements + FX + réconciliation opérateur | ✅ |
| **Sécurité wallet** : OTP inscription, QR signés, verrouillage PIN, réconciliation float, plafonds KYC | ✅ (ALP-171/172/173/174/175) |
| Défense en profondeur : WAF/CORS/Helmet/rate-limit, Argon2id, HMAC anti-replay, ledger hash-chain, PII AES-256-GCM | ✅ |
| Observabilité : Prometheus, Grafana, Loki, Tempo, Sentry | ✅ |
| Infra Terraform (VPC, RDS Multi-AZ, ECS, ALB, WAF, Secrets Manager, EIP fixe) | ✅ validée |
| Migrations DB versionnées (11), tests 260 verts | ✅ |

## Feu rouge — bloquants production (NON-code)

Ordre recommandé. Détail dans [AVANT_PROD.md](AVANT_PROD.md).

1. **Société + compte bancaire** (RCCM, NIU) — ALP-115.
2. **Agrément / partenariat bancaire** — ALP-116 *(en cours)*. ⚠️ **Vérifier que le contrat
   couvre l'émission de monnaie électronique (wallets), pas seulement l'agrégation** — c'est la
   condition légale du Module 1.
3. **Contrats opérateurs** MTN + Airtel (Collection **et** Disbursement) + CinetPay → clés de
   production + whitelist de l'IP `34.253.60.206`.
4. **Fournisseurs tiers** : Smile Identity (KYC), screening sanctions/AML, Postmark (email),
   Africa's Talking (SMS), Clerk (dashboard prod), Sentry.
5. **Pen-test externe** (requis avant fonds réels) — corriger les findings critiques/hauts.
6. **Infra jour J** : `terraform apply`, remplir Secrets Manager, générer les secrets internes
   (`openssl rand`), build/push/migrate/deploy, DNS + TLS + `ALLOWED_ORIGINS`.

## Points à finaliser côté code avant fonds réels (petits)

- [ ] **Plafonds KYC** : ajuster les seuils par défaut (`wallet_limits`) selon les exigences de
      la banque partenaire (endpoint `PUT /internal/wallet-limits/:level` déjà prêt).
- [ ] **Montée de niveau KYC** wallet N0→N1 : brancher le pipeline Smile Identity existant sur
      le `kycLevel` du wallet (aujourd'hui réglable en interne).
- [ ] **Exposition FX treasury** : poster au grand livre l'exposition de change des paiements
      wallet cross-devises pour qu'elle apparaisse dans `fxSpread` (voir commentaire ALP-170).
- [ ] **Alertes Grafana** : câbler les seuils sur `paybrain_wallet_pin_failures_total` et
      `paybrain_wallet_float_drift_cents`.
- [ ] **Rattachement caissiers** : écran/process admin pour lier un wallet caissier à son marchand
      (`wallets.merchant_id`).

## Roadmap post-lancement (Module 4)

- **Cartes virtuelles Visa/Mastercard** (ALP-176) — payer *tout* site, y compris fonds en Europe.
  Bloqué sur un **émetteur licencié / sponsor de BIN** (dépendance externe, potentiellement via la
  banque partenaire). Fondation déjà en place (wallet multi-devises + settlement + réconciliation).

## Recommandation

1. **Aujourd'hui** : lancer un **pilote sandbox** (démo ci-jointe [DEMO.md](DEMO.md)) avec 5–10
   marchands, comptes en monnaie de test — pour valider le produit et le playbook.
2. **Dès l'agrément + contrats opérateurs signés** : basculer en prod à petit volume, après
   pen-test et ajustement des plafonds KYC.
3. **Après traction** : cartes virtuelles (Module 4).

Délai réaliste jusqu'à la prod « fonds réels » : **piloté par l'agrément et les contrats
opérateurs (2–6 mois selon la banque)**, pas par le développement.
