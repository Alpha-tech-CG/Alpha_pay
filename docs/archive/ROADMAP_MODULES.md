# PayBrain — Roadmap par modules
*7 juillet 2026 — stratégie : lancer UN produit visible, se faire connaître, perfectionner, puis empiler les services.*

## Vision

Devenir le « PayPal du bassin du Congo » : un client recharge son compte PayBrain depuis
son Mobile Money (MTN/Airtel) et paie **en ligne, sur n'importe quelle plateforme, même à
l'étranger** — sans carte bancaire. Les marchands encaissent via une API unifiée.

## Découpage en modules

### Module 1 — Wallet client & paiement en ligne (LANCEMENT · en cours)

Le produit d'appel grand public. Un compte, rechargé par MoMo, qui paie partout.

**Déjà construit** (ce commit inclus) :
- Wallet closed-loop : cash-in/cash-out MTN & Airtel, P2P, paiement marchand par QR
- Apps mobiles client `(client)` et caissier `(cashier)` — design Kinetic Ledger
- Auth PIN Argon2id + JWT, idempotence, débits conditionnels anti-course, callbacks HMAC fail-closed
- Crédit marchand intégré au settlement engine (operator=WALLET)

**Construit pour le lancement (fait ✅)** :
1. **Checkout « Payer avec PayBrain »** (ALP-169) — app `apps/checkout` (`/pay/[id]`) + endpoint
   `POST /v1/checkout/paylinks/:id/wallet` : le client paie un lien/QR marchand depuis son wallet.
2. **Paiement à l'étranger multi-devises** (ALP-170) — un wallet XAF règle un lien en USD/EUR ;
   conversion via le module FX (ALP-151), marchand crédité dans la devise du lien.
3. **Durcissements** : OTP SMS inscription (ALP-171), QR signés (ALP-172), verrouillage PIN
   (ALP-173), réconciliation float (ALP-175). **Reste** : plafonds KYC/BEAC (ALP-174, dépend de
   la banque partenaire).

### Module 2 — Encaissement marchand par API (CONSTRUIT ✅)

Le cœur agrégateur : API paiements MTN/Airtel/CinetPay, webhooks signés, dashboard,
paylinks, page checkout. Devient la surface sur laquelle le Module 1 branche le bouton wallet.

### Module 3 — Reversements & trésorerie (CONSTRUIT ✅, à fiabiliser en volume)

Settlement engine, payouts MoMo, multi-devises FX, validation 4-eyes, réconciliation quotidienne.

### Module 4 — Services additionnels (APRÈS traction)

Dans l'ordre de valeur probable une fois la base clients acquise :
- **Cartes virtuelles Visa/Mastercard** (partenaire émetteur — ALP-176) pour payer les sites
  qui n'acceptent que la carte, en Europe et ailleurs. Priorité haute côté produit, bloqué sur
  l'émetteur. Fondation déjà en place : wallet multi-devises + settlement + réconciliation.
- Paiement de factures (électricité, eau, TV, scolarité)
- Épargne / tontines digitales
- USSD grand public (prêt côté code — attend le shortcode agrégateur)

## Périmètre V1 — ce qui marche aujourd'hui (côté code)

La V1 grand public couvre les trois usages demandés :

| Usage | État | Comment |
|-------|------|---------|
| **Payer un marchand** (lien de paiement ou QR généré par le vendeur) | ✅ | QR signés (app caissier) + checkout web `/pay/:id`, en XAF **et** en devise étrangère (USD/EUR) |
| **Envoyer / recevoir des fonds** (P2P) | ✅ | `POST /v1/wallet/p2p`, transfert instantané entre wallets par numéro |
| **Recharger / retirer** | ✅ | cash-in / cash-out MTN & Airtel |

## Paiement en ligne « type carte Visa » (fonds en Europe, etc.) — à cadrer

C'est l'ambition finale : payer **n'importe quel** site (pas seulement un marchand intégré
à PayBrain), y compris à l'étranger, comme avec une carte Visa. Deux modèles très différents :

- **Closed-loop (fait ✅)** : payer un marchand qui a intégré PayBrain (lien/QR/checkout).
  Fonctionne déjà, y compris cross-devises. C'est ce que couvre la V1.
- **Open-loop / carte Visa (Module 4, dépendance partenaire)** : émettre une **carte virtuelle
  Visa/Mastercard** adossée au wallet, utilisable sur tout site acceptant les cartes. **Cela
  exige un émetteur licencié / sponsor de BIN** (Stripe Issuing, Marqeta, ou un émetteur
  africain) — c'est une dépendance externe **du même ordre que les contrats MTN/Airtel**, pas
  quelque chose qui se code seul. Le wallet multi-devises + le settlement constituent déjà la
  fondation (le solde qui garantit la carte) ; il manque le partenaire émetteur et le KYC renforcé.

> **En clair** : la V1 permet de payer en ligne partout où un marchand accepte PayBrain, même
> à l'étranger. Payer sur un site qui n'accepte QUE Visa/Mastercard nécessitera la carte
> virtuelle (Module 4), bloquée sur la signature d'un émetteur — à intégrer dès qu'il est trouvé,
> potentiellement via la banque partenaire en cours de contractualisation.

## Séquence de lancement recommandée

1. **Sandbox pilote** (dès maintenant) : Module 1 + 2 en sandbox opérateur, 5–10 marchands pilotes, comptes wallet en monnaie de test.
2. **Prod à petit volume** : après RCCM + contrats opérateurs (voir AVANT_PROD.md) + durcissements pré-fonds réels + pen-test.
3. **Marketing d'acquisition** : le wallet client est le produit qui se partage (P2P = boucle virale) ; le checkout en ligne donne la visibilité auprès des e-commerçants.
4. **Modules 4** : uniquement quand le Module 1 a des utilisateurs actifs et un NPS mesuré.

## Prérequis business inchangés (bloquants prod, voir AVANT_PROD.md)

Société + compte bancaire → agrément PTSP → contrats MTN/Airtel/CinetPay → pen-test externe.
Aucun code ne débloque ces étapes ; le wallet ajoute une exigence : **l'agrément e-money
(émission de monnaie électronique) est plus exigeant que le simple statut PTSP d'agrégation** —
à valider avec le conseil juridique dès maintenant.
