# AlphaPay, app mobile marchand (V1)

App **Expo / React Native** (TypeScript, expo-router) branchée sur l'API V1
(`apps/api`), les mêmes routes que le tableau de bord web. Décision D-064.

## Écrans
- **Connexion** : email ou téléphone + mot de passe, puis code à 6 chiffres (SMS,
  WhatsApp ou email). Inscription et mot de passe oublié dans l'app.
- **Accueil** : encaissé du jour, de la semaine et du mois, répartition par moyen de
  paiement (module Gérer ; sinon totaux simples), derniers paiements.
- **Paiements** : liste filtrable et recherche, détail, remboursement (carte par la
  banque partenaire ; Mobile Money déclaré par le marchand).
- **Encaisser** : QR de la caisse (le client saisit le montant) ou QR d'un montant
  précis (lien à usage unique) ; arrivées en direct, vibration au paiement reçu.
- **Liens** : création, partage WhatsApp / SMS, désactivation.
- **Réglages** : commerce, dossier, mode test / live, équipe, déconnexion.

Un caissier ne voit que ses caisses et leurs paiements (contrôle côté serveur).
Boutiques, caisses, factures, opérateurs, clés API et invitations restent sur le web.

## Sécurité
- Jeton d'accès (15 min) en mémoire ; jeton de rafraîchissement dans le stockage
  sécurisé (Keystore Android), envoyé dans le corps de `/v1/auth/refresh`
  (`client: "mobile"` à la vérification du code). Rotation à chaque usage, rejeu
  détecté (session révoquée).
- Déverrouillage par empreinte ou code de l'appareil au lancement.
- HTTP en clair autorisé seulement quand l'API visée est en `http://` (démo locale).

## Lancer en local
```bash
cd mobile
npm install
npx expo start
```

## APK (EAS)
| Profil | API | Usage |
| --- | --- | --- |
| `preview` | `http://localhost:3000` | démo : téléphone en USB, `adb reverse tcp:3000 tcp:3000` |
| `preview-prod` | `https://api.alphapay.cg` | APK de test contre la production |
| `production` | `https://api.alphapay.cg` | Play Store (AAB) |

```bash
eas build -p android --profile preview
```

Les écrans de l'ancienne app (portefeuille, ancien backend) sont dans `legacy/`.
