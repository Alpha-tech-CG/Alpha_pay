// Sélecteur de compte global (démo) : onglet flottant -> modal pour naviguer
// entre les trois expériences (Client / Merchant / Developer).
import { useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { AP, soft, radius, shadow } from '@/design';

type Role = { key: string; label: string; desc: string; icon: string; href: string; color: string };

const ROLES: Role[] = [
  { key: 'client', label: 'Client', desc: 'Wallet, cards, transfers', icon: 'account-circle', href: '/(client)/(tabs)', color: AP.primary },
  { key: 'merchant', label: 'Merchant', desc: 'Dashboard, payouts, links', icon: 'store', href: '/(merchant)', color: AP.chart5 },
  { key: 'developer', label: 'Developer', desc: 'API, docs, sandbox', icon: 'code', href: '/(developer)', color: AP.chart2 },
];

export function AccountSwitcher() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const go = (href: string) => {
    setOpen(false);
    router.replace(href as never);
  };

  return (
    <>
      <Pressable style={s.tab} onPress={() => setOpen(true)} accessibilityLabel="Switch account">
        <Icon name="swap-horiz" size={22} color="#fff" />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.overlay} onPress={() => setOpen(false)}>
          <Pressable style={s.card} onPress={(e) => e.stopPropagation()}>
            <View style={s.headerRow}>
              <View>
                <Text style={s.kicker}>AlphaPay Demo</Text>
                <Text style={s.title}>Switch Account</Text>
              </View>
              <Pressable style={s.closeBtn} onPress={() => setOpen(false)}>
                <Icon name="cancel" size={22} color={AP.secondary} />
              </Pressable>
            </View>

            <View style={{ gap: 12 }}>
              {ROLES.map((r) => (
                <Pressable key={r.key} style={({ pressed }) => [s.role, pressed && { transform: [{ scale: 0.98 }] }]} onPress={() => go(r.href)}>
                  <View style={[s.roleIcon, { backgroundColor: r.color + '22' }]}>
                    <Icon name={r.icon} size={24} color={r.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.roleLabel}>{r.label}</Text>
                    <Text style={s.roleDesc}>{r.desc}</Text>
                  </View>
                  <Icon name="chevron-right" size={20} color={AP.mutedForeground} />
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  tab: {
    position: 'absolute',
    right: 0,
    top: '42%',
    width: 40,
    height: 48,
    backgroundColor: AP.secondary,
    borderTopLeftRadius: radius.lg,
    borderBottomLeftRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    ...shadow(10, AP.secondary, 0.35),
  },
  overlay: { flex: 1, backgroundColor: 'rgba(11,30,61,0.5)', justifyContent: 'flex-end' },
  card: { backgroundColor: AP.card, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 },
  kicker: { fontSize: 10, fontWeight: '800', letterSpacing: 2, color: AP.mutedForeground, textTransform: 'uppercase' },
  title: { fontSize: 22, fontWeight: '900', color: AP.secondary, marginTop: 2 },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: soft.muted50, alignItems: 'center', justifyContent: 'center' },
  role: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: AP.bg, borderWidth: 1, borderColor: AP.border, borderRadius: radius.xl, padding: 16 },
  roleIcon: { width: 48, height: 48, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  roleLabel: { fontSize: 16, fontWeight: '800', color: AP.secondary },
  roleDesc: { fontSize: 12, color: AP.mutedForeground, marginTop: 2 },
});
