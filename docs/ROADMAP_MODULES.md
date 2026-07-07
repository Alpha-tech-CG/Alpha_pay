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

**À construire pour le lancement** (issues Linear créées) :
1. **Checkout « Payer avec PayBrain »** — bouton sur la page de paiement hébergée existante :
   le client se connecte (phone + PIN + confirmation), le site marchand est payé depuis le wallet.
   C'est LA brique « payer en ligne sur plusieurs plateformes ».
2. **Paiement à l'étranger** — multi-devises depuis le wallet XAF : réutiliser le module FX
   existant (ALP-151) pour débiter en XAF et régler le marchand en USD/EUR ; corridor CEMAC d'abord.
3. Durcissements pré-fonds réels : OTP SMS inscription, QR signés, verrouillage PIN,
   plafonds KYC/BEAC, réconciliation float.

### Module 2 — Encaissement marchand par API (CONSTRUIT ✅)

Le cœur agrégateur : API paiements MTN/Airtel/CinetPay, webhooks signés, dashboard,
paylinks, page checkout. Devient la surface sur laquelle le Module 1 branche le bouton wallet.

### Module 3 — Reversements & trésorerie (CONSTRUIT ✅, à fiabiliser en volume)

Settlement engine, payouts MoMo, multi-devises FX, validation 4-eyes, réconciliation quotidienne.

### Module 4 — Services additionnels (APRÈS traction)

Dans l'ordre de valeur probable une fois la base clients acquise :
- Paiement de factures (électricité, eau, TV, scolarité)
- Cartes virtuelles (partenaire émetteur) pour les sites qui n'acceptent que Visa/MC
- Épargne / tontines digitales
- USSD grand public (prêt côté code — attend le shortcode agrégateur)

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
