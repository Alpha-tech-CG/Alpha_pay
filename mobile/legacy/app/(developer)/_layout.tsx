import { Tabs } from 'expo-router';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { ucFont } from '@/uc';

export const DEV_BG = '#1F1F1F';
// Accent teal éclairci : lisible sur fond sombre.
export const DEV_ACCENT = '#4FB3C4';

const TABS: Record<string, { label: string; icon: string }> = {
  index: { label: 'Aperçu', icon: 'layout-dashboard' },
  docs: { label: 'Documentation', icon: 'info' },
  sandbox: { label: 'Sandbox', icon: 'code' },
};

function DevTabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const routes = state.routes.filter((r: any) => TABS[r.name]);
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {routes.map((route: any) => {
          const tab = TABS[route.name];
          const focused = state.routes[state.index]?.name === route.name;
          const color = focused ? DEV_ACCENT : 'rgba(255,255,255,0.6)';
          return (
            <Pressable key={route.key} style={styles.item} onPress={() => navigation.navigate(route.name)}>
              <Icon name={tab.icon} size={24} color={color} />
              <Text style={[styles.label, { color }]}>{tab.label}</Text>
            </Pressable>
          );
        })}
    </View>
  );
}

export default function DeveloperLayout() {
  return (
    <Tabs tabBar={(props) => <DevTabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: DEV_BG } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="docs" />
      <Tabs.Screen name="sandbox" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: '#2B2B2B', paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.12)' },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  label: { fontFamily: ucFont.regular, fontSize: 13 },
});
