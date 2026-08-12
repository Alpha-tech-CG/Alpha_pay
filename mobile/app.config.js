// Config Expo unique (remplace app.json). L'URL de l'API peut être surchargée
// par variable d'environnement au build/lancement, sans éditer de fichier :
//
//   EXPO_PUBLIC_API_URL=http://192.168.1.50:3000 npx expo start
//   $env:EXPO_PUBLIC_API_URL="https://xxx.trycloudflare.com"; eas build -p android --profile preview
//
// URL API fixée en dur pour la démo (le PC sur le Wi-Fi local).
// Changer ici puis rebuild si l'IP du PC change.
const DEFAULT_API_URL = 'http://localhost:3000';  // demo via `adb reverse tcp:3000 tcp:3000` (USB, robuste WiFi/4G)

module.exports = () => ({
  name: 'PayBrain',
  slug: 'paybrain-mobile',
  scheme: 'paybrain',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  // Désactivé : sous la nouvelle archi (Fabric/bridgeless) en release, les glyphes
  // @expo/vector-icons ne se rendaient pas (police non appliquée aux <Text> d'icônes).
  // L'ancienne archi charge les polices assets/fonts de façon fiable.
  newArchEnabled: false,
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
  plugins: [
    'expo-router',
    'expo-secure-store',
    // Embarque + enregistre les polices d'icônes nativement (fiable en release/newArch,
    // là où useFonts/loadAsync peut hanger). @expo/vector-icons les trouve au démarrage.
    ['expo-font', {
      fonts: [
        './node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialIcons.ttf',
        './node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf',
      ],
    }],
    'expo-asset',
    // Capture de pièce d'identité (KYC) : déclare CAMERA + accès photos.
    ['expo-image-picker', {
      cameraPermission: 'AlphaPay utilise la caméra pour photographier votre pièce d\'identité.',
      photosPermission: 'AlphaPay accède à vos photos pour ajouter votre pièce d\'identité.',
    }],
  ],
  extra: {
    apiBaseUrl: process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_URL,
    eas: { projectId: '5fb2127e-f2ae-4820-bcb4-ccdb59f55b7a' },
  },
});
