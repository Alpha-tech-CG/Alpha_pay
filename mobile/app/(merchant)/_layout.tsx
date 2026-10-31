import { Redirect, Tabs } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { AP } from '@/design';
import { ucFont } from '@/uc';
import { useMerchant, useSession } from '@/session';
import { Loading } from '@/kit';

const TABS: Record<string, { label: string; icon: string; action?: string }> = {
  index: { label: 'Accueil', icon: 'layout-dashboard' },
  payments: { label: 'Paiements', icon: 'swap-horiz' },
  collect: { label: 'Encaisser', icon: 'qr-code' },
  links: { label: 'Liens', icon: 'link', action: 'payments:view' },
  settings: { label: 'Réglages', icon: 'settings' },
};

function TabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { can } = useMerchant();
  const routes = state.routes.filter((r: any) => TABS[r.name] && (!TABS[r.name].action || can(TABS[r.name].action!)));
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
  const { status, user } = useSession();
  if (status === 'loading') return <Loading />;
  if (status !== 'authenticated' || !user?.merchants?.length) return <Redirect href="/" />;
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: AP.bg } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="payments" />
      <Tabs.Screen name="collect" />
      <Tabs.Screen name="links" />
      <Tabs.Screen name="settings" />
      {/* Écrans poussés (hors barre) */}
      <Tabs.Screen name="payment/[id]" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: AP.bg, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: AP.border },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  label: { fontFamily: ucFont.regular, fontSize: 12 },
});
