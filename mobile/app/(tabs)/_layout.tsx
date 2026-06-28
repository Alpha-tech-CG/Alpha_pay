import { Tabs, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/auth';
import { C } from '@/theme';

export default function TabsLayout() {
  const { ready, apiKey } = useAuth();
  if (ready && !apiKey) return <Redirect href="/" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.primary,
        tabBarInactiveTintColor: C.muted,
        tabBarStyle: { backgroundColor: C.surface, borderTopColor: C.border },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Tableau de bord', tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="payments"
        options={{ title: 'Paiements', tabBarIcon: ({ color, size }) => <Ionicons name="qr-code-outline" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="transactions"
        options={{ title: 'Transactions', tabBarIcon: ({ color, size }) => <Ionicons name="list-outline" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="settlements"
        options={{ title: 'Reversements', tabBarIcon: ({ color, size }) => <Ionicons name="wallet-outline" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Réglages', tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" color={color} size={size} /> }}
      />
    </Tabs>
  );
}
