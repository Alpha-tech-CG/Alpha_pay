import { Tabs } from 'expo-router';
import { B } from '@/brand';
import { makeTabBar } from '@/TabBar';

// Espace particulier (D-065) : AlphaPay (envoyer / recevoir) au centre.
const TabBar = makeTabBar([
  { name: 'index', label: 'Accueil', icon: 'home' },
  { name: 'budget', label: 'Budget', icon: 'payments' },
  { name: 'alphapay', label: 'AlphaPay', icon: 'swap-horiz', center: true },
  { name: 'savings', label: 'Épargne', icon: 'piggy-bank' },
  { name: 'more', label: 'Plus', icon: 'more-circle' },
]);

export default function PersonalTabs() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: B.bg }, animation: 'shift' }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="budget" />
      <Tabs.Screen name="alphapay" />
      <Tabs.Screen name="savings" />
      <Tabs.Screen name="more" />
    </Tabs>
  );
}
