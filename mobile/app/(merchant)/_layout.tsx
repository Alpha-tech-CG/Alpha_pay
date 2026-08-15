import { Tabs } from 'expo-router';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { AP, shadow } from '@/design';
import { MerchantProvider } from '@/merchant-store';

const TABS: Record<string, { label: string; icon: string }> = {
  index: { label: 'Home', icon: 'layout-dashboard' },
  transactions: { label: 'Sales', icon: 'swap-horiz' },
  'payment-links': { label: 'Links', icon: 'link' },
  settlement: { label: 'Payouts', icon: 'payments' },
  settings: { label: 'Settings', icon: 'settings' },
};

function MerchantTabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const routes = state.routes.filter((r: any) => TABS[r.name]);
  return (
    <View style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) + 12 }]} pointerEvents="box-none">
      <View style={styles.pill}>
        {routes.map((route: any) => {
          const tab = TABS[route.name];
          const focused = state.routes[state.index]?.name === route.name;
          const color = focused ? AP.primary : 'rgba(255,255,255,0.5)';
          return (
            <Pressable key={route.key} style={styles.item} onPress={() => navigation.navigate(route.name)}>
              <Icon name={tab.icon} size={22} color={color} />
              <Text style={[styles.label, { color }]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function MerchantLayout() {
  return (
    <MerchantProvider>
    <Tabs tabBar={(props) => <MerchantTabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: AP.bg } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="transactions" />
      <Tabs.Screen name="payment-links" />
      <Tabs.Screen name="settlement" />
      <Tabs.Screen name="settings" />
      {/* Écrans poussés (hors barre) */}
      <Tabs.Screen name="api-keys" options={{ href: null }} />
      <Tabs.Screen name="webhooks" options={{ href: null }} />
      <Tabs.Screen name="team" options={{ href: null }} />
    </Tabs>
    </MerchantProvider>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16 },
  pill: { height: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 6, backgroundColor: AP.secondary, borderRadius: 32, ...shadow(16, AP.secondary, 0.35) },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 6 },
  label: { fontSize: 9, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
});
