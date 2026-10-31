// Config Expo unique. Adresses de l'API et du tableau de bord web fixées au build :
//
//   EXPO_PUBLIC_API_URL=https://api.alphapay.cg EXPO_PUBLIC_DASHBOARD_URL=https://app.alphapay.cg npx expo start
//
// Un build EAS est évalué sur les serveurs d'Expo : les variables viennent du
// bloc `env` du profil dans eas.json, pas du terminal local.
//
// Par défaut : API du PC de développement via `adb reverse tcp:3000 tcp:3000` (USB).
const DEFAULT_API_URL = 'http://localhost:3000';
const DEFAULT_DASHBOARD_URL = 'http://localhost:5173';

const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_URL;

module.exports = () => ({
  name: 'AlphaPay',
  slug: 'paybrain-mobile',
  scheme: 'alphapay',
  version: '1.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  newArchEnabled: false,
  splash: { backgroundColor: '#E2001A' },
  ios: { supportsTablet: true, bundleIdentifier: 'cg.paybrain.app' },
  android: {
    package: 'cg.paybrain.app',
    versionCode: 2,
    adaptiveIcon: { backgroundColor: '#E2001A' },
    // HTTP en clair seulement pour une API locale (démo) ; jamais en HTTPS.
    usesCleartextTraffic: apiBaseUrl.startsWith('http://'),
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    ['expo-local-authentication', { faceIDPermission: 'AlphaPay utilise Face ID pour déverrouiller l’app.' }],
  ],
  extra: {
    apiBaseUrl,
    dashboardUrl: process.env.EXPO_PUBLIC_DASHBOARD_URL || DEFAULT_DASHBOARD_URL,
    eas: { projectId: '5fb2127e-f2ae-4820-bcb4-ccdb59f55b7a' },
  },
});
