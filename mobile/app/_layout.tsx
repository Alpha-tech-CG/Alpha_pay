import { useEffect, useRef } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { AuthProvider } from '@/auth';
import { ThemeProvider, useTheme } from '@/theme';
import { PhotoProvider } from '@/photo';
import { WalletProvider } from '@/wallet-store';

// Les polices d'icônes (MaterialIcons / MaterialCommunityIcons) sont embarquées
// nativement dans android/app/src/main/assets/fonts — elles sont donc disponibles
// dès le démarrage, sans chargement JS (useFonts hangeait en release/bridgeless).
export default function RootLayout() {
  const notifListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    // Notification reçue en foreground — affichée automatiquement grâce au handler global.
    notifListener.current = Notifications.addNotificationReceivedListener(() => {
      // Pas d'action nécessaire : le handler global affiche l'alerte.
    });

    // Tap sur une notification → naviguer vers les transactions.
    responseListener.current = Notifications.addNotificationResponseReceivedListener(() => {
      // expo-router gère la navigation via le deep link dans la notification si défini.
      // Ici on laisse le comportement par défaut (amène l'app au premier plan).
    });

    return () => {
      notifListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <AuthProvider>
          <PhotoProvider>
            <WalletProvider>
              <ThemedRoot />
            </WalletProvider>
          </PhotoProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

function ThemedRoot() {
  const { C, isDark } = useTheme();
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }} />
    </>
  );
}
