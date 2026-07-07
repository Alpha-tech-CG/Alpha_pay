import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { C } from '@/theme';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

const TABS: { name: string; label: string; icon: IconName }[] = [
  { name: 'index',   label: 'Accueil',    icon: 'account-balance-wallet' },
  { name: 'scan',    label: 'Scanner',    icon: 'qr-code-scanner' },
  { name: 'history', label: 'Historique', icon: 'receipt-long' },
  { name: 'profile', label: 'Profil',     icon: 'person' },
];

function ClientTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.bar, { paddingBottom: insets.bottom + 6 }]}>
      {state.routes.map((route: any, i: number) => {
        const tab = TABS[i];
        const focused = state.index === i;
        return (
          <View key={route.key} style={s.tabItem}>
            {focused && <View style={s.pill} />}
            <MaterialIcons
              name={tab.icon}
              size={24}
              color={focused ? C.secondary : C.muted}
              onPress={() => navigation.navigate(route.name)}
            />
          </View>
        );
      })}
    </View>
  );
}

export default function ClientTabLayout() {
  return (
    <Tabs
      tabBar={(props) => <ClientTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      {TABS.map((t) => (
        <Tabs.Screen key={t.name} name={t.name} options={{ title: t.label }} />
      ))}
    </Tabs>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 10,
    paddingHorizontal: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    paddingBottom: 2,
  },
  pill: {
    position: 'absolute',
    top: -10,
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.secondaryContainer,
  },
});
