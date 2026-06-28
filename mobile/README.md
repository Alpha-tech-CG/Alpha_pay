# PayBrain — App mobile marchand (ALP-150)

App **Expo / React Native** (TypeScript, expo-router) à l'identité émeraude, qui
consomme l'API PayBrain existante.

## Écrans
- **Connexion** : le marchand saisit sa **clé API** (`pk_…`), stockée chiffrée sur
  l'appareil via `expo-secure-store` (jamais en clair).
- **Tableau de bord** : hero « volume encaissé » + ventilation MTN/Airtel + transactions récentes (pull-to-refresh).
- **Paiements** : génère un paiement → **QR + lien + code USSD** avec copie.
- **Transactions** : liste filtrable (Tout / En attente / Réussi / Échoué).
- **Réglages** : session + déconnexion (efface la clé).

## Lancer en local
```bash
cd mobile
npm install
npx expo start          # puis scanner le QR avec Expo Go (iOS/Android)
```

⚠️ **Configurer l'URL de l'API** : l'appareil doit joindre le backend. Mettre
l'IP LAN de la machine qui fait tourner l'API dans `app.json` →
`expo.extra.apiBaseUrl` (ex. `http://192.168.1.10:3000`). `localhost` ne marche
PAS depuis un téléphone physique.

## Sécurité
- La clé API marchand n'est **jamais** en dur : saisie par l'utilisateur, stockée
  via SecureStore (Keychain iOS / Keystore Android), envoyée en `X-API-Key`.
- En prod, prévoir des **clés scoupées** (lecture + création de liens) plutôt
  qu'une clé pleine, et un flux d'auth dédié (Clerk mobile / OAuth) à terme.

## Statut
Scaffold fonctionnel complet (navigation + 5 écrans + client API). À installer et
lancer sur un device/emulateur pour exécution (non exécuté dans l'environnement de
build ci-présent — pas de runtime Expo).
