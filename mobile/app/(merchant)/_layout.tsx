import { Redirect, Tabs } from 'expo-router';
import { View } from 'react-native';
import { B } from '@/brand';
import { Spinner } from '@/bank';
import { useSession } from '@/session';
import { makeTabBar } from '@/TabBar';

// Espace marchand : Encaisser au centre ; Liens et détail d'un paiement sont poussés.
const TabBar = makeTabBar(
  [
    { name: 'index', label: 'Accueil', icon: 'home' },
    { name: 'card', label: 'Cartes', icon: 'credit-card' },
    { name: 'collect', label: 'Encaisser', icon: 'qr-code', center: true },
    { name: 'payments', label: 'Paiements', icon: 'swap-horiz' },
    { name: 'settings', label: 'Plus', icon: 'more-circle' },
  ],
  { 'payment/[id]': 'payments', links: 'settings' },
);

export default function MerchantLayout() {
  const { status, user } = useSession();
  if (status === 'loading') return <View style={{ flex: 1, backgroundColor: B.bg, padding: 24 }}><Spinner /></View>;
  if (status !== 'authenticated' || !user?.merchants?.length) return <Redirect href="/" />;
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: B.bg }, animation: 'shift' }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="card" />
      <Tabs.Screen name="collect" />
      <Tabs.Screen name="payments" />
      <Tabs.Screen name="settings" />
      <Tabs.Screen name="links" options={{ href: null }} />
      <Tabs.Screen name="payment/[id]" options={{ href: null }} />
    </Tabs>
  );
}
