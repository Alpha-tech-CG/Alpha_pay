# PayBrain — Verdict « prêt pour la production »
*Mise à jour : 17 août 2026*

## Résumé en une phrase

**Le code est prêt à 100 %** (372 tests unitaires + 31 tests e2e verts, `tsc` propre,
5/5 durcissements sécurité faits, tous les items du feu orange traités) ; le lancement en
production réel reste **entièrement bloqué par des étapes administratives/partenaires**,
détaillées dans [AVANT_PROD.md](AVANT_PROD.md) §A-G — plus aucun travail de code identifié
ne se trouve sur le chemin critique.

## Feu vert — ce qui est prêt côté code ✅

| Domaine | État |
|--------|------|
| Encaissement marchand (API MTN/Airtel/CinetPay, webhooks signés, paylinks, checkout) | ✅ |
| Wallet client : cash-in/out, P2P, paiement QR & lien, **multi-devises** | ✅ |
| App de paiement en ligne `apps/checkout` (« Payer avec PayBrain ») | ✅ |
| Apps mobiles client + caissier (Expo, design Kinetic Ledger) | ✅ |
| **Équipe marchand multi-utilisateurs** (rôles, invitations, audit, dashboard + mobile lecture seule) | ✅ |
| KYC client (pièce d'identité à l'inscription + revue admin, N0→N1) | ✅ **stockage S3** (presigned URL), plus de mode démo |
| Back-office admin : bypass démo impossible à activer en build de production | ✅ (double garde-fou build + runtime) |
| Settlement / reversements + FX + réconciliation opérateur | ✅ |
| **Sécurité wallet** : OTP inscription, QR signés, verrouillage PIN, réconciliation float, plafonds KYC | ✅ (ALP-171/172/173/174/175) |
| Défense en profondeur : WAF/CORS/Helmet/rate-limit, Argon2id, HMAC anti-replay, ledger hash-chain, PII AES-256-GCM | ✅ |
| Observabilité : Prometheus, Grafana, Loki, Tempo, Sentry | ✅ |
| Infra Terraform (VPC, RDS Multi-AZ, ECS, ALB, WAF, Secrets Manager, EIP fixe) | ✅ validée |
| Migrations DB versionnées (16) | ✅ **rejouées avec succès depuis zéro** |
| Tests | ✅ 372 unitaires + 31 e2e verts, `tsc` propre (api + mobile) |

## Feu orange — reste EN CODE avant la prod

**Vide.** Les 3 items bloquants/requis identifiés (migration cassée sur base neuve, KYC en
mode démo, bypass admin) sont **tous traités** — voir [AVANT_PROD.md](AVANT_PROD.md) §0 pour
le détail et les commits. Il reste 4 ajustements **mineurs, non bloquants** (plafonds KYC à
caler avec la banque, exposition FX treasury, alertes Grafana, écran de rattachement
caissier) — cf. AVANT_PROD.md §0 items 4-7, à traiter avant volume significatif mais pas
avant le lancement.

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

1. **Aujourd'hui** : lancer un **pilote sandbox** (démo dans [DEMO.md](DEMO.md)) avec 5–10
   marchands, comptes en monnaie de test — pour valider le produit et le playbook. Plus aucun
   prérequis de code ne bloque ce pilote.
2. **En parallèle, dès maintenant** : démarches légales/partenaires (§ feu rouge) — c'est
   désormais le seul chemin critique restant.
3. **Dès l'agrément + contrats opérateurs signés** : basculer en prod à petit volume, après
   pen-test et ajustement des plafonds KYC (item mineur restant).
4. **Après traction** : cartes virtuelles (Module 4).

Délai réaliste jusqu'à la prod « fonds réels » : **piloté entièrement par l'agrément et les
contrats opérateurs (2–6 mois selon la banque)** — le développement n'est plus sur le chemin
critique.
