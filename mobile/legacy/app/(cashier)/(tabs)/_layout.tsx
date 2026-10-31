import { Tabs, Redirect } from 'expo-router';
import { View, Text, Pressable } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Icon } from '@/components/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/auth';
import { useTheme } from '@/theme';

type IconName = string;

const TABS: { name: string; label: string; icon: IconName }[] = [
  { name: 'index',   label: 'Encaisser',  icon: 'qr-code' },
  { name: 'history', label: 'Historique', icon: 'receipt-long' },
];

function CashierTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { C } = useTheme();
  return (
    <View style={{
      flexDirection: 'row',
      backgroundColor: C.surfaceContainer,
      paddingBottom: insets.bottom > 0 ? insets.bottom : 12,
      paddingTop: 10,
      paddingHorizontal: 4,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.06,
      shadowRadius: 12,
      elevation: 10,
    }}>
      {state.routes.map((route, i) => {
        const tab = TABS[i];
        const focused = state.index === i;
        return (
          <Pressable
            key={route.key}
            onPress={() => navigation.navigate(route.name)}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          >
            <View style={{
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: focused ? C.secondaryContainer : 'transparent',
              borderRadius: 999,
              paddingHorizontal: focused ? 18 : 8,
              paddingVertical: 6,
              minWidth: focused ? 100 : 40,
              flexDirection: focused ? 'row' : 'column',
              gap: focused ? 4 : 0,
            }}>
              <Icon name={tab.icon} size={22} color={focused ? C.onSecondaryContainer : C.muted} />
              {focused && (
                <Text style={{ fontSize: 11, fontWeight: '700', color: C.onSecondaryContainer }}>
                  {tab.label}
                </Text>
              )}
            </View>
            {!focused && (
              <Text style={{ fontSize: 10, fontWeight: '600', color: C.muted, marginTop: 2 }}>
                {tab.label}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

export default function CashierTabsLayout() {
  const { ready, apiKey, role } = useAuth();
  if (ready && (!apiKey || role !== 'MERCHANT_CASHIER')) return <Redirect href="/" />;

  return (
    <Tabs tabBar={(props) => <CashierTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="history" />
    </Tabs>
  );
}
