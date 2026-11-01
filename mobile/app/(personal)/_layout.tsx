import { Redirect, Stack } from 'expo-router';
import { View } from 'react-native';
import { B } from '@/brand';
import { Spinner } from '@/bank';
import { useSession } from '@/session';

// Onglets dans (tabs) ; ajout, envoi, demande, scan, rapport, alertes et configuration
// s'empilent par-dessus et repartent de zéro à chaque ouverture.
export default function PersonalLayout() {
  const { status, user } = useSession();
  if (status === 'loading') return <View style={{ flex: 1, backgroundColor: B.bg, padding: 24 }}><Spinner /></View>;
  if (status !== 'authenticated' || !user?.personal) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: B.bg }, animation: 'slide_from_right' }} />;
}
