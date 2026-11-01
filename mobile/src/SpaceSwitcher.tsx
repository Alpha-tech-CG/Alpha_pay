// Bascule entre les espaces du compte (D-066) : particulier pour tous, marchand et
// développeur quand le compte y a droit. L'espace choisi est retenu sur l'appareil.
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { B, F, R } from '@/brand';
import { Label, Surface } from '@/bank';
import { PressScale } from '@/motion';
import { availableSpaces, useSession, type Space } from '@/session';

const META: Record<Space, { label: string; icon: string; href: '/(personal)' | '/(merchant)' | '/(developer)'; bg: string; fg: string }> = {
  personal: { label: 'Particulier', icon: 'account-circle', href: '/(personal)', bg: B.mustardSoft, fg: B.mustardDeep },
  merchant: { label: 'Marchand', icon: 'storefront', href: '/(merchant)', bg: B.navySoft, fg: B.navy },
  developer: { label: 'Développeur', icon: 'code', href: '/(developer)', bg: B.burgundySoft, fg: B.burgundy },
};

export function SpaceSwitcher({ index }: { index?: number }) {
  const router = useRouter();
  const { user, space, setSpace } = useSession();
  const spaces = availableSpaces(user);
  if (spaces.length < 2) return null;
  const merchantName = user?.merchants?.[0]?.name;
  const sub: Record<Space, string> = {
    personal: user?.personal?.alphapay_id ?? 'Budget, carte, épargne',
    merchant: merchantName ?? 'Encaissements',
    developer: 'Clés API, webhooks, journal',
  };
  return (
    <Surface index={index} style={{ gap: 10 }}>
      <Label>Mes espaces</Label>
      <View style={s.row}>
        {spaces.map((sp) => {
          const m = META[sp];
          const active = sp === space;
          return (
            <PressScale
              key={sp}
              style={[s.item, active && s.active]}
              onPress={() => {
                if (active) return;
                setSpace(sp);
                router.replace(m.href);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Espace ${m.label}`}
            >
              <View style={[s.icon, { backgroundColor: active ? B.mustard : m.bg }]}>
                <Icon name={m.icon} size={20} color={active ? B.navy : m.fg} />
              </View>
              <Text style={[s.label, active && { color: B.white }]}>{m.label}</Text>
              <Text style={[s.sub, active && { color: B.onNavyMuted }]} numberOfLines={1}>{sub[sp]}</Text>
            </PressScale>
          );
        })}
      </View>
    </Surface>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  item: { flex: 1, borderRadius: R.md, borderWidth: 1, borderColor: B.line, padding: 10, gap: 6, minHeight: 104 },
  active: { backgroundColor: B.navy, borderColor: B.navy },
  icon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: F.semibold, fontSize: 14, color: B.ink },
  sub: { fontFamily: F.regular, fontSize: 11, color: B.muted },
});
