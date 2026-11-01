import { Redirect, Stack } from 'expo-router';
import { View } from 'react-native';
import { B } from '@/brand';
import { Spinner } from '@/bank';
import { useSession } from '@/session';

// Espace développeur (D-066) : réservé aux comptes qui gèrent les clés API d'un marchand
// (propriétaire, administrateur, développeur), comme sur le tableau de bord web.
export default function DeveloperLayout() {
  const { status, user } = useSession();
  if (status === 'loading') return <View style={{ flex: 1, backgroundColor: B.bg, padding: 24 }}><Spinner /></View>;
  if (status !== 'authenticated' || !user?.merchants?.some((m) => m.developer)) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: B.bg } }} />;
}
