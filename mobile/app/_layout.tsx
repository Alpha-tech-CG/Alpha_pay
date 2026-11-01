import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider } from '@/session';
import { UC } from '@/uc';

// Les polices d'icônes sont des SVG (lucide) : rien à charger au démarrage.
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: UC.bg } }} />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
