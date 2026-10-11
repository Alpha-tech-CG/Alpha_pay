import { Tabs } from 'expo-router';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { UC, ucFont } from '@/uc';

// Onglets client (design « banque ») : Accueil / Cartes / Paiements / Plus.
// Barre blanche pleine largeur, icônes pleines grises, onglet actif en teal.
// « history » reste une route de l'onglet mais n'apparaît pas dans la barre.
const TABS: Record<string, { label: string; icon: string }> = {
  index: { label: 'Accueil', icon: 'home' },
  card: { label: 'Cartes', icon: 'shapes' },
  payments: { label: 'Paiements', icon: 'payments' },
  settings: { label: 'Plus', icon: 'more-circle' },
};

function ClientTabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const routes = state.routes.filter((r: any) => TABS[r.name]);
  const current = state.routes[state.index]?.name;
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {routes.map((route: any) => {
        const tab = TABS[route.name];
        const focused = current === route.name || (route.name === 'index' && current === 'history');
        const color = focused ? UC.teal : UC.inkSoft;
        return (
          <Pressable
            key={route.key}
            style={styles.item}
            onPress={() => navigation.navigate(route.name)}
            accessibilityRole="button"
            accessibilityState={{ selected: focused }}
          >
            <Icon name={tab.icon} size={24} color={color} />
            <Text style={[styles.label, { color: focused ? UC.teal : UC.ink }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function ClientTabLayout() {
  return (
    <Tabs
      tabBar={(props) => <ClientTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: UC.bg } }}
    >
      <Tabs.Screen name="index" options={{ title: 'Accueil' }} />
      <Tabs.Screen name="card" options={{ title: 'Cartes' }} />
      <Tabs.Screen name="payments" options={{ title: 'Paiements' }} />
      <Tabs.Screen name="settings" options={{ title: 'Plus' }} />
      <Tabs.Screen name="history" options={{ title: 'Mouvements', href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: UC.bg,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: UC.lineSoft,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  label: { fontFamily: ucFont.regular, fontSize: 13 },
});
