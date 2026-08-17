# PayBrain — Verdict « prêt pour la production »
*Mise à jour : 15 août 2026*

## Résumé en une phrase

**Le code est prêt à ~95 %** (354 tests unitaires + 31 tests e2e verts, `tsc` propre,
5/5 durcissements sécurité faits) ; le lancement en production réel reste **bloqué
principalement par des étapes administratives/partenaires**, mais il reste **une poignée
d'items de code identifiés** (issus de fonctionnalités livrées en mode démo/accéléré) à
traiter avant d'accepter des fonds réels — listés ci-dessous, détaillés dans
[AVANT_PROD.md](AVANT_PROD.md) §0.

## Feu vert — ce qui est prêt côté code ✅

| Domaine | État |
|--------|------|
| Encaissement marchand (API MTN/Airtel/CinetPay, webhooks signés, paylinks, checkout) | ✅ |
| Wallet client : cash-in/out, P2P, paiement QR & lien, **multi-devises** | ✅ |
| App de paiement en ligne `apps/checkout` (« Payer avec PayBrain ») | ✅ |
| Apps mobiles client + caissier (Expo, design Kinetic Ledger) | ✅ |
| **Équipe marchand multi-utilisateurs** (rôles, invitations, audit, dashboard + mobile lecture seule) | ✅ *(nouveau)* |
| KYC client (pièce d'identité à l'inscription + revue admin, N0→N1) | ✅ *(nouveau, mais livré en mode démo — cf. §0 restant)* |
| Settlement / reversements + FX + réconciliation opérateur | ✅ |
| **Sécurité wallet** : OTP inscription, QR signés, verrouillage PIN, réconciliation float, plafonds KYC | ✅ (ALP-171/172/173/174/175) |
| Défense en profondeur : WAF/CORS/Helmet/rate-limit, Argon2id, HMAC anti-replay, ledger hash-chain, PII AES-256-GCM | ✅ |
| Observabilité : Prometheus, Grafana, Loki, Tempo, Sentry | ✅ |
| Infra Terraform (VPC, RDS Multi-AZ, ECS, ALB, WAF, Secrets Manager, EIP fixe) | ✅ validée |
| Migrations DB versionnées (15) | ✅ **rejouées avec succès depuis zéro** (migration 12 corrigée, commit `149da24`) |
| Tests | ✅ 354 unitaires + 31 e2e verts, `tsc` propre |

## Feu orange — reste EN CODE avant la prod (pas de dépendance externe, on peut le faire maintenant)

Détail et checklist dans [AVANT_PROD.md](AVANT_PROD.md) **§0**. Résumé :

1. ~~Corriger la migration 12~~ **✅ FAIT** (`wallet_kyc_documents`, commit `149da24`) —
   `prisma migrate deploy` échouait sur toute base Postgres neuve (P3018, incompatibilité de
   type). Corrigé et vérifié : les 15 migrations s'appliquent proprement depuis zéro. *Reste un
   point de suivi mineur : réaligner la base dev Docker existante une fois accessible (cf.
   AVANT_PROD.md §0) — n'affecte que le poste de dev, aucune prod n'existe encore.*
2. **Sortir le KYC client du mode démo** : documents stockés en base64 en DB (pas S3, pas
   d'expiration/lifecycle) → migrer vers S3 comme le fait déjà le KYC marchand
   (`KycDocumentStorageService`, presigned URL, `KYC_DOCUMENTS_BUCKET`).
3. **Neutraliser le bypass démo admin** (`admin/src/session.js`, `VITE_DEMO_ADMIN=1`) —
   contourne totalement l'authentification Clerk. Actuellement un simple flag d'env non
   protégé par un garde-fou de build ; à durcir pour qu'il soit impossible de l'activer en
   build de production.
4. Plafonds KYC : ajuster les seuils par défaut (`wallet_limits`) selon les exigences de la
   banque partenaire (endpoint déjà prêt).
5. Exposition FX treasury : poster au grand livre l'exposition de change des paiements wallet
   cross-devises (`fxSpread`, gap noté depuis ALP-170).
6. Alertes Grafana : câbler les seuils sur `paybrain_wallet_pin_failures_total` et
   `paybrain_wallet_float_drift_cents`.
7. Rattachement caissiers : écran/process admin pour lier un wallet caissier à son marchand
   (`wallets.merchant_id`).

Items 2–3 sont les plus importants restants (sécurité/fiabilité réelle) ; 4–7 sont des
ajustements mineurs déjà identifiés en juillet, toujours ouverts.

## Feu rouge — bloquants production (NON-code)

Ordre recommandé. Détail dans [AVANT_PROD.md](AVANT_PROD.md) §A-G.

1. **Société + compte bancaire** (RCCM, NIU) — ALP-115.
2. **Agrément / partenariat bancaire** — ALP-116 *(en cours)*. ⚠️ **Vérifier que le contrat
   couvre l'émission de monnaie électronique (wallets), pas seulement l'agrégation** — c'est la
   condition légale du Module 1.
3. **Contrats opérateurs** MTN + Airtel (Collection **et** Disbursement) + CinetPay → clés de
   production + whitelist de l'IP `34.253.60.206`.
4. **Fournisseurs tiers** : Smile Identity (KYC), screening sanctions/AML, Postmark (email),
   Africa's Talking (SMS), Clerk (instance dashboard **production**, distincte du dev), Sentry.
5. **Pen-test externe** (requis avant fonds réels) — corriger les findings critiques/hauts.
6. **Infra jour J** : `terraform apply`, remplir Secrets Manager, générer les secrets internes
   (`openssl rand`), build/push/migrate/deploy, DNS + TLS + `ALLOWED_ORIGINS`.

## Roadmap post-lancement (Module 4)

- **Cartes virtuelles Visa/Mastercard** (ALP-176) — payer *tout* site, y compris fonds en Europe.
  Bloqué sur un **émetteur licencié / sponsor de BIN** (dépendance externe, potentiellement via la
  banque partenaire). Fondation déjà en place (wallet multi-devises + settlement + réconciliation).

## Recommandation

1. **Tout de suite, en parallèle des démarches partenaires** : traiter le feu orange (§ ci-dessus,
   surtout les items 2–3) — c'est le seul travail de code qui reste et il ne dépend de personne.
2. **Aujourd'hui** : lancer un **pilote sandbox** (démo dans [DEMO.md](DEMO.md)) avec 5–10
   marchands, comptes en monnaie de test — pour valider le produit et le playbook.
3. **Dès l'agrément + contrats opérateurs signés** : basculer en prod à petit volume, après
   pen-test et ajustement des plafonds KYC.
4. **Après traction** : cartes virtuelles (Module 4).

Délai réaliste jusqu'à la prod « fonds réels » : **piloté par l'agrément et les contrats
opérateurs (2–6 mois selon la banque)**, pas par le développement — sous réserve de traiter
le feu orange en amont.
