import { Tabs } from 'expo-router';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { AP } from '@/design';
import { ucFont } from '@/uc';
import { MerchantProvider } from '@/merchant-store';

const TABS: Record<string, { label: string; icon: string }> = {
  index: { label: 'Accueil', icon: 'layout-dashboard' },
  transactions: { label: 'Ventes', icon: 'swap-horiz' },
  'payment-links': { label: 'Liens', icon: 'link' },
  settlement: { label: 'Virements', icon: 'payments' },
  settings: { label: 'Réglages', icon: 'settings' },
};

function MerchantTabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const routes = state.routes.filter((r: any) => TABS[r.name]);
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {routes.map((route: any) => {
          const tab = TABS[route.name];
          const focused = state.routes[state.index]?.name === route.name;
          const color = focused ? AP.primary : '#4D4D4D';
          return (
            <Pressable key={route.key} style={styles.item} onPress={() => navigation.navigate(route.name)}>
              <Icon name={tab.icon} size={24} color={color} />
              <Text style={[styles.label, { color: focused ? AP.primary : AP.foreground }]}>{tab.label}</Text>
            </Pressable>
          );
        })}
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
  bar: { flexDirection: 'row', backgroundColor: AP.bg, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: AP.border },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  label: { fontFamily: ucFont.regular, fontSize: 13 },
});
