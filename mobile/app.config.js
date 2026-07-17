// Config Expo unique (remplace app.json). L'URL de l'API peut être surchargée
// par variable d'environnement au build/lancement, sans éditer de fichier :
//
//   EXPO_PUBLIC_API_URL=http://192.168.1.50:3000 npx expo start
//   $env:EXPO_PUBLIC_API_URL="https://xxx.trycloudflare.com"; eas build -p android --profile preview
//
const DEFAULT_API_URL = 'http://192.168.1.174:3000';

module.exports = () => ({
  name: 'PayBrain',
  slug: 'paybrain-mobile',
  scheme: 'paybrain',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  newArchEnabled: true,
  splash: { backgroundColor: '#0035c5' },
  ios: { supportsTablet: true, bundleIdentifier: 'cg.paybrain.app' },
  android: {
    package: 'cg.paybrain.app',
    adaptiveIcon: { backgroundColor: '#0035c5' },
    // Autorise le trafic HTTP non chiffré (API locale de dev/démo en http://).
    // Android 9+ bloque le cleartext par défaut, silencieusement — sans ça
    // aucune requête ne quitte l'appareil (l'API ne voit jamais rien).
    // À retirer/restreindre dès que l'API tourne en HTTPS (prod).
    usesCleartextTraffic: true,
  },
  plugins: ['expo-router', 'expo-secure-store', 'expo-font', 'expo-asset'],
  extra: {
    apiBaseUrl: process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_URL,
    eas: { projectId: '5fb2127e-f2ae-4820-bcb4-ccdb59f55b7a' },
  },
});
