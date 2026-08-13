import { Tabs } from 'expo-router';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { AP, radius, shadow } from '@/design';

// Onglets AlphaPay (maquette Home) : Home / Cards / History / Settings.
// Bottom-nav flottante = pilule navy arrondie posée au-dessus du contenu.
const TABS: Record<string, { label: string; icon: string }> = {
  index: { label: 'Home', icon: 'home' },
  card: { label: 'Cards', icon: 'credit-card' },
  history: { label: 'History', icon: 'history' },
  settings: { label: 'Settings', icon: 'settings' },
};

function ClientTabBar({ state, navigation }: any) {
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
            <Pressable
              key={route.key}
              style={styles.item}
              onPress={() => navigation.navigate(route.name)}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
            >
              <Icon name={tab.icon} size={24} color={color} />
              <Text style={[styles.label, { color }]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function ClientTabLayout() {
  return (
    <Tabs
      tabBar={(props) => <ClientTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: AP.bg } }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="card" options={{ title: 'Cards' }} />
      <Tabs.Screen name="history" options={{ title: 'History' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 20, right: 20 },
  pill: {
    height: 76,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    backgroundColor: AP.secondary,
    borderRadius: 36,
    ...shadow(16, AP.secondary, 0.35),
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8 },
  label: { fontSize: 9, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
});
