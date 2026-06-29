import { useEffect, useRef } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { AuthProvider } from '@/auth';

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
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }} />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
