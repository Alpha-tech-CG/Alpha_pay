import { Tabs } from 'expo-router';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { AP, shadow } from '@/design';

export const DEV_BG = '#0d1117';

const TABS: Record<string, { label: string; icon: string }> = {
  index: { label: 'Overview', icon: 'layout-dashboard' },
  docs: { label: 'Docs', icon: 'info' },
  sandbox: { label: 'Sandbox', icon: 'code' },
};

function DevTabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const routes = state.routes.filter((r: any) => TABS[r.name]);
  return (
    <View style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) + 12 }]} pointerEvents="box-none">
      <View style={styles.pill}>
        {routes.map((route: any) => {
          const tab = TABS[route.name];
          const focused = state.routes[state.index]?.name === route.name;
          const color = focused ? AP.primary : 'rgba(255,255,255,0.45)';
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
  wrap: { position: 'absolute', left: 16, right: 16 },
  pill: { height: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 6, backgroundColor: '#161b22', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 32, ...shadow(16, '#000', 0.4) },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 6 },
  label: { fontSize: 9, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
});
