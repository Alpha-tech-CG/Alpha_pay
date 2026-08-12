import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { router } from 'expo-router';
import { useAuth } from '@/auth';
import { usePhoto } from '@/photo';
import { useTheme, THEME_OPTIONS, type Palette, type ThemeName } from '@/theme';

type IconName = string;

export default function ProfileScreen() {
  const { phone, signOut } = useAuth();
  const { C, name: themeName, setTheme } = useTheme();
  const { uri: photoUri, pick } = usePhoto();
  const s = useMemo(() => makeStyles(C), [C]);

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.title}>Profil</Text>

        {/* Avatar */}
        <View style={s.avatarSection}>
          <Pressable style={s.avatar} onPress={pick}>
            {photoUri
              ? <Image source={{ uri: photoUri }} style={s.avatarImg} />
              : <Text style={s.avatarTxt}>{(phone ?? 'MA').slice(-2)}</Text>}
            <View style={s.avatarCamera}><Icon name="edit" size={14} color={C.onPrimary} /></View>
          </Pressable>
          <Text style={s.name}>{phone ?? '—'}</Text>
          <View style={s.badge}>
            <Icon name="verified" size={13} color={C.success} />
            <Text style={s.badgeTxt}>Vérifié (Niveau 2)</Text>
          </View>
          <Text style={s.market}>Marché : Congo 🇨🇬</Text>
        </View>

        {/* Upgrade */}
        <Pressable style={s.upgrade}>
          <Icon name="arrow-circle-up" size={22} color={C.primary} />
          <View style={{ flex: 1 }}>
            <Text style={s.upgradeTitle}>Améliorer votre compte</Text>
            <Text style={s.upgradeSub}>Devenir Marchand ou Développeur</Text>
          </View>
          <Icon name="chevron-right" size={20} color={C.muted} />
        </Pressable>

        {/* Comptes liés */}
        <Section title="Comptes liés" C={C} s={s}>
          <View style={s.row}>
            <View style={s.rowLeft}>
              <View style={[s.opTag, { backgroundColor: C.pendingBg }]}><Text style={[s.opTagTxt, { color: C.pending }]}>MTN</Text></View>
              <Text style={s.rowLabel}>MTN MoMo</Text>
            </View>
            <View style={s.connected}><Icon name="shield" size={13} color={C.success} /><Text style={[s.connectedTxt, { color: C.success }]}>Préféré</Text></View>
          </View>
          <Text style={s.rowSub}>{phone ?? '+242 06 123 4567'}</Text>
          <View style={s.sep} />
          <Pressable style={s.row} onPress={() => router.push('/(client)/link-account')}>
            <View style={s.rowLeft}>
              <View style={[s.opTag, { backgroundColor: C.primarySoft }]}><Icon name="add" size={16} color={C.primary} /></View>
              <Text style={s.rowLabel}>Choisir le compte préféré</Text>
            </View>
            <View style={s.connected}><Text style={[s.connectedTxt, { color: C.primary }]}>MTN · Airtel · Banque</Text><Icon name="chevron-right" size={16} color={C.primary} /></View>
          </Pressable>
        </Section>

        {/* Apparence — thème */}
        <Section title="Apparence" C={C} s={s}>
          <View style={{ padding: 16 }}>
            <Text style={s.themeHint}>Choisir le thème</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {THEME_OPTIONS.map((t) => (
                <ThemeSwatch key={t.key} opt={t} active={themeName === t.key} onPress={() => setTheme(t.key)} C={C} s={s} />
              ))}
            </View>
          </View>
        </Section>

        {/* Sécurité */}
        <Section title="Sécurité" C={C} s={s}>
          <MenuItem icon="vpn-key" label="Changer de PIN" onPress={() => {}} C={C} s={s} />
          <View style={s.sep} />
          <MenuItem icon="fingerprint" label="Activer la biométrie" onPress={() => {}} C={C} s={s} />
        </Section>

        {/* Danger */}
        <Section title="Zone sensible" C={C} s={s}>
          <MenuItem icon="logout" label="Se déconnecter" onPress={signOut} danger C={C} s={s} />
          <View style={s.sep} />
          <MenuItem icon="delete-outline" label="Supprimer le compte" onPress={() => {}} danger C={C} s={s} />
        </Section>

        <Text style={s.version}>AlphaPay v1.0 · Compte personnel</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children, s }: { title: string; children: React.ReactNode; C: Palette; s: Styles }) {
  return (
    <View style={{ marginTop: 22 }}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.card}>{children}</View>
    </View>
  );
}

function MenuItem({ icon, label, onPress, danger, C, s }: { icon: IconName; label: string; onPress: () => void; danger?: boolean; C: Palette; s: Styles }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.menuItem, pressed && { opacity: 0.7 }]}>
      <View style={[s.menuIcon, danger && { backgroundColor: C.errorContainer }]}>
        <Icon name={icon} size={20} color={danger ? C.error : C.primary} />
      </View>
      <Text style={[s.menuLabel, danger && { color: C.error }]}>{label}</Text>
      {!danger && <Icon name="chevron-right" size={20} color={C.muted} />}
    </Pressable>
  );
}

function ThemeSwatch({ opt, active, onPress, C, s }: {
  opt: { key: ThemeName; label: string; swatch: string; bg: string }; active: boolean; onPress: () => void; C: Palette; s: Styles;
}) {
  return (
    <Pressable onPress={onPress} style={[s.swatch, { borderColor: active ? C.primary : C.border }]}>
      <View style={[s.swatchPreview, { backgroundColor: opt.bg, borderColor: C.border }]}>
        <View style={[s.swatchDot, { backgroundColor: opt.swatch }]} />
        {active && (
          <View style={[s.swatchCheck, { backgroundColor: C.primary }]}>
            <Icon name="check" size={11} color={C.onPrimary} />
          </View>
        )}
      </View>
      <Text style={s.swatchLabel}>{opt.label}</Text>
    </Pressable>
  );
}

type Styles = ReturnType<typeof makeStyles>;
const makeStyles = (C: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: 20, paddingBottom: 60 },
  title: { fontSize: 24, fontWeight: '800', color: C.text, marginBottom: 20 },

  avatarSection: { alignItems: 'center', marginBottom: 4 },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarImg: { width: 88, height: 88, borderRadius: 44 },
  avatarTxt: { fontSize: 26, fontWeight: '900', color: C.onPrimary },
  avatarCamera: { position: 'absolute', right: 0, bottom: 12, width: 28, height: 28, borderRadius: 14, backgroundColor: C.secondary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.bg },
  name: { fontSize: 18, fontWeight: '700', color: C.text },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, backgroundColor: C.successBg, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  badgeTxt: { fontSize: 12, fontWeight: '700', color: C.success },
  market: { fontSize: 13, color: C.muted, marginTop: 8 },

  upgrade: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 22, backgroundColor: C.primarySoft, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 16 },
  upgradeTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  upgradeSub: { fontSize: 12, color: C.muted, marginTop: 1 },

  sectionTitle: { fontSize: 12, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  card: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },

  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowLabel: { fontSize: 14, fontWeight: '600', color: C.text },
  rowSub: { fontSize: 12, color: C.muted, paddingHorizontal: 16, paddingBottom: 10 },
  opTag: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  opTagTxt: { fontSize: 11, fontWeight: '800' },
  connected: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  connectedTxt: { fontSize: 12, fontWeight: '700' },

  themeHint: { fontSize: 13, color: C.muted, marginBottom: 12 },
  swatch: { flex: 1, alignItems: 'center', gap: 8, borderWidth: 1.5, borderRadius: 14, padding: 10 },
  swatchPreview: { width: '100%', height: 40, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  swatchDot: { width: 18, height: 18, borderRadius: 9 },
  swatchCheck: { position: 'absolute', top: 4, right: 4, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  swatchLabel: { fontSize: 11, fontWeight: '700', color: C.text },

  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  menuIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: C.surfaceContainerLow, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: C.text },
  sep: { height: 1, backgroundColor: C.border, marginLeft: 16 },
  version: { fontSize: 12, color: C.muted, textAlign: 'center', marginTop: 28 },
});
