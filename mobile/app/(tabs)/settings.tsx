import { View, Text, Pressable, ScrollView, StyleSheet, Switch } from 'react-native';
import Constants from 'expo-constants';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/auth';
import { C } from '@/theme';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

function SettingRow({ icon, label, subtitle, onPress, right }: {
  icon: IconName;
  label: string;
  subtitle?: string;
  onPress?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <Pressable onPress={onPress} style={s.row}>
      <View style={s.rowIcon}>
        <MaterialIcons name={icon} size={20} color={C.primary} />
      </View>
      <View style={{ flex: 1, marginLeft: 14 }}>
        <Text style={s.rowLabel}>{label}</Text>
        {subtitle && <Text style={s.rowSub}>{subtitle}</Text>}
      </View>
      {right ?? <MaterialIcons name="chevron-right" size={22} color={C.border} />}
    </Pressable>
  );
}

export default function Settings() {
  const { apiKey, signOut } = useAuth();
  const masked = apiKey ? `${apiKey.slice(0, 14)}…` : '—';
  const apiBaseUrl = (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl;
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <View style={s.topBar}>
        <Text style={s.pageTitle}>Profil</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>

        {/* Avatar + name */}
        <View style={s.profileHeader}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>JK</Text>
          </View>
          <Pressable style={s.editBtn}>
            <MaterialIcons name="edit" size={14} color={C.onSecondary} />
          </Pressable>
          <Text style={s.profileName}>Jean-Paul Kambou</Text>
          <Text style={s.profilePhone}>+242 065 000 000</Text>
          <View style={s.accountBadge}>
            <Text style={s.accountBadgeText}>COMPTE COMMERÇANT</Text>
          </View>
        </View>

        {/* Session */}
        <Text style={s.sectionLabel}>SESSION</Text>
        <View style={s.group}>
          <SettingRow icon="vpn-key" label="Clé API" subtitle={masked} />
          <View style={s.divider} />
          <SettingRow icon="dns" label="Serveur" subtitle={apiBaseUrl ?? '—'} />
          <View style={s.divider} />
          <SettingRow icon="info" label="Version" subtitle={`PayBrain v${version}`} />
        </View>

        {/* Sécurité */}
        <Text style={s.sectionLabel}>SÉCURITÉ & ACCÈS</Text>
        <View style={s.group}>
          <SettingRow
            icon="fingerprint"
            label="Connexion biométrique"
            subtitle="Face ID & empreinte digitale"
            right={<Switch value onValueChange={() => {}} trackColor={{ false: C.border, true: C.secondaryContainer }} thumbColor={C.secondary} />}
          />
          <View style={s.divider} />
          <SettingRow icon="lock" label="Changer le PIN" subtitle="Code d'accès à 6 chiffres" />
          <View style={s.divider} />
          <SettingRow icon="devices" label="Appareils de confiance" subtitle="1 appareil actif" />
        </View>

        {/* Préférences */}
        <Text style={s.sectionLabel}>PRÉFÉRENCES</Text>
        <View style={s.group}>
          <SettingRow
            icon="notifications-active"
            label="Notifications push"
            right={<Switch value onValueChange={() => {}} trackColor={{ false: C.border, true: C.secondaryContainer }} thumbColor={C.secondary} />}
          />
          <View style={s.divider} />
          <SettingRow
            icon="mail"
            label="Emails marketing"
            right={<Switch value={false} onValueChange={() => {}} trackColor={{ false: C.border, true: C.secondaryContainer }} thumbColor={C.secondary} />}
          />
        </View>

        {/* Déconnexion */}
        <Pressable onPress={signOut} style={s.logoutBtn}>
          <MaterialIcons name="logout" size={20} color={C.error} />
          <Text style={s.logoutText}>Se déconnecter</Text>
        </Pressable>
        <Text style={s.versionNote}>La clé API est effacée du stockage chiffré à la déconnexion.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  topBar: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  pageTitle: { fontSize: 26, fontWeight: '700', color: C.text, letterSpacing: -0.5 },

  profileHeader: { alignItems: 'center', paddingVertical: 24, position: 'relative' },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: C.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: C.surface, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 4 },
  avatarText: { fontSize: 28, fontWeight: '700', color: C.primary },
  editBtn: { position: 'absolute', top: 88, left: '55%', backgroundColor: C.secondary, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.surface },
  profileName: { fontSize: 22, fontWeight: '700', color: C.text, marginTop: 12 },
  profilePhone: { fontSize: 14, color: C.muted, marginTop: 4 },
  accountBadge: { backgroundColor: C.surfaceContainerHigh, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 5, marginTop: 8 },
  accountBadgeText: { fontSize: 11, fontWeight: '700', color: C.primary, letterSpacing: 0.5 },

  sectionLabel: { fontSize: 11, fontWeight: '700', color: C.muted, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10, marginTop: 20 },

  group: { backgroundColor: C.surface, borderRadius: 16, overflow: 'hidden', shadowColor: '#0035c5', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  rowIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surfaceContainerLow, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 14, fontWeight: '600', color: C.text },
  rowSub: { fontSize: 12, color: C.muted, marginTop: 2 },
  divider: { height: 1, backgroundColor: C.border, marginLeft: 70 },

  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 54, borderRadius: 16, borderWidth: 1.5, borderColor: C.errorContainer, backgroundColor: 'rgba(186,26,26,0.04)', marginTop: 28 },
  logoutText: { fontSize: 15, fontWeight: '700', color: C.error },
  versionNote: { fontSize: 12, color: C.muted, textAlign: 'center', marginTop: 14, lineHeight: 18 },
});
