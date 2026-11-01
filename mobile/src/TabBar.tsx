// Barre d'onglets commune aux deux espaces : l'action principale au centre en bouton
// moutarde surélevé ; l'onglet actif en marine avec un trait moutarde qui apparaît en
// ressort. Masquée pendant la saisie (sinon elle remonte au-dessus du clavier).
import { useEffect, useRef, useState } from 'react';
import { Animated, Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { B, F, shadow } from '@/brand';
import { reduceMotion } from '@/motion';

export type TabDef = { name: string; label: string; icon: string; center?: boolean; badge?: number };

/** `parents` : écran poussé → onglet à mettre en avant (ex. détail d'un paiement → Paiements). */
export function makeTabBar(tabs: TabDef[], parents: Record<string, string> = {}) {
  const order = tabs.map((t) => t.name);
  return function TabBar({ state, navigation }: any) {
    const insets = useSafeAreaInsets();
    const current = state.routes[state.index]?.name as string;
    const activeName = parents[current] ?? current;
    const pos = useRef(new Animated.Value(Math.max(0, order.indexOf(activeName)))).current;
    const [keyboard, setKeyboard] = useState(false);

    useEffect(() => {
      const show = Keyboard.addListener('keyboardDidShow', () => setKeyboard(true));
      const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboard(false));
      return () => {
        show.remove();
        hide.remove();
      };
    }, []);

    useEffect(() => {
      const i = order.indexOf(activeName);
      if (i < 0) return;
      if (reduceMotion()) pos.setValue(i);
      else Animated.spring(pos, { toValue: i, useNativeDriver: true, speed: 18, bounciness: 7 }).start();
    }, [activeName, pos]);

    if (keyboard) return null;
    return (
      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        {tabs.map((tab, i) => {
          const route = state.routes.find((r: any) => r.name === tab.name);
          if (!route) return null;
          const focused = activeName === tab.name;
          return (
            <Pressable key={route.key} style={styles.item} onPress={() => navigation.navigate(tab.name)} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={tab.label}>
              {tab.center ? (
                <View style={[styles.center, focused && { backgroundColor: B.navy }]}>
                  <Icon name={tab.icon} size={26} color={focused ? B.mustard : B.navy} />
                </View>
              ) : (
                <View>
                  <Icon name={tab.icon} size={23} color={focused ? B.navy : '#8A94A6'} />
                  {tab.badge ? <View style={styles.badge}><Text style={styles.badgeText}>{tab.badge > 9 ? '9+' : tab.badge}</Text></View> : null}
                </View>
              )}
              <Text style={[styles.label, { color: focused ? B.navy : '#8A94A6', fontFamily: focused ? F.semibold : F.regular }]}>{tab.label}</Text>
              {focused && !tab.center ? <SlideDot i={i} pos={pos} /> : null}
            </Pressable>
          );
        })}
      </View>
    );
  };
}

function SlideDot({ pos, i }: { pos: Animated.Value; i: number }) {
  const scale = pos.interpolate({ inputRange: [i - 1, i, i + 1], outputRange: [0.2, 1, 0.2], extrapolate: 'clamp' });
  return <Animated.View style={[styles.dot, { transform: [{ scaleX: scale }] }]} />;
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: B.surface, paddingTop: 10, borderTopLeftRadius: 22, borderTopRightRadius: 22, ...shadow(3) },
  item: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4, minHeight: 52 },
  center: { width: 54, height: 54, borderRadius: 27, backgroundColor: B.mustard, alignItems: 'center', justifyContent: 'center', marginTop: -30, borderWidth: 4, borderColor: B.surface, ...shadow(2) },
  label: { fontSize: 11 },
  dot: { position: 'absolute', bottom: -6, width: 18, height: 3, borderRadius: 2, backgroundColor: B.mustard },
  badge: { position: 'absolute', top: -5, right: -9, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: B.burgundy, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, borderWidth: 2, borderColor: B.surface },
  badgeText: { fontFamily: F.bold, fontSize: 9, color: B.white },
});
