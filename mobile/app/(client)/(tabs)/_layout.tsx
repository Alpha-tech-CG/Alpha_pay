import { useMemo } from 'react';
import { Tabs } from 'expo-router';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { AP } from '@/design';

// Onglets AlphaPay (maquette Home) : Home / Cards / History / Settings.
const TABS: Record<string, { label: string; icon: string }> = {
  index: { label: 'Home', icon: 'layout-dashboard' },
  card: { label: 'Cards', icon: 'credit-card' },
  history: { label: 'History', icon: 'history' },
  settings: { label: 'Settings', icon: 'settings' },
};

function ClientTabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const s = useMemo(() => styles, []);
  return (
    <View style={[s.bar, { paddingBottom: insets.bottom + 8, height: 72 + insets.bottom }]}>
      {state.routes
        .filter((r: any) => TABS[r.name])
        .map((route: any) => {
          const tab = TABS[route.name];
          const focused = state.routes[state.index]?.name === route.name;
          const color = focused ? AP.primary : AP.mutedForeground;
          return (
            <Pressable
              key={route.key}
              style={s.tabItem}
              onPress={() => navigation.navigate(route.name)}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
            >
              <Icon name={tab.icon} size={24} color={color} />
              <Text style={[s.label, { color }]}>{tab.label}</Text>
            </Pressable>
          );
        })}
    </View>
  );
}

export default function ClientTabLayout() {
  return (
    <Tabs tabBar={(props) => <ClientTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="card" options={{ title: 'Cards' }} />
      <Tabs.Screen name="history" options={{ title: 'History' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: AP.bg,
    borderTopWidth: 1,
    borderTopColor: AP.border,
    paddingTop: 10,
    paddingHorizontal: 12,
    alignItems: 'flex-start',
  },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  label: { fontSize: 10, fontWeight: '600' },
});
