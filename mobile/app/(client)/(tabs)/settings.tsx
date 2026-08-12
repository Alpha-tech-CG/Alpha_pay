import { useState } from 'react';
import { View, Text, Pressable, Image, ScrollView, StyleSheet, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { useAuth } from '@/auth';
import { AP, soft, radius, shadow } from '@/design';
import { useWallet } from '@/wallet-store';

function Row({ icon, label, children, onPress }: { icon: string; label: string; children: React.ReactNode; onPress?: () => void }) {
  return (
    <Pressable style={s.row} onPress={onPress} disabled={!onPress}>
      <View style={s.rowLeft}>
        <Icon name={icon} size={18} color={AP.primary} />
        <Text style={s.rowLabel}>{label}</Text>
      </View>
      {children}
    </Pressable>
  );
}

export default function Settings() {
  const { signOut } = useAuth();
  const { user } = useWallet();
  const [biometrics, setBiometrics] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.title}>Settings</Text>

        {/* Profil */}
        <View style={[s.profile, shadow(12, AP.secondary, 0.2)]}>
          <Image source={{ uri: user.avatar }} style={s.profileAvatar} />
          <View style={{ flex: 1 }}>
            <Text style={s.profileName}>{user.name}</Text>
            <Text style={s.profilePhone}>{user.phone}</Text>
          </View>
          <Pressable style={s.editBtn}>
            <Icon name="edit-3" size={18} color="#fff" />
          </Pressable>
        </View>

        {/* Sécurité */}
        <Text style={s.sectionTitle}>SECURITY</Text>
        <View style={s.group}>
          <Row icon="lock" label="Change PIN" onPress={() => {}}>
            <Icon name="chevron-right" size={18} color={AP.mutedForeground} />
          </Row>
          <View style={s.divider} />
          <Row icon="fingerprint" label="Biometrics">
            <Switch value={biometrics} onValueChange={setBiometrics} trackColor={{ true: AP.primary, false: AP.muted }} thumbColor="#fff" />
          </Row>
        </View>

        {/* Préférences */}
        <Text style={s.sectionTitle}>PREFERENCES</Text>
        <View style={s.group}>
          <Row icon="languages" label="Language" onPress={() => {}}>
            <Text style={s.rowValue}>Français</Text>
          </Row>
          <View style={s.divider} />
          <Row icon="moon" label="Dark Mode">
            <Switch value={darkMode} onValueChange={setDarkMode} trackColor={{ true: AP.primary, false: AP.muted }} thumbColor="#fff" />
          </Row>
        </View>

        <Pressable style={s.logout} onPress={signOut}>
          <Icon name="log-out" size={18} color={AP.destructive} />
          <Text style={s.logoutText}>Log out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: AP.bg },
  scroll: { paddingHorizontal: 20, paddingBottom: 24 },
  title: { fontSize: 20, fontWeight: '700', color: AP.foreground, paddingTop: 8, paddingBottom: 24 },

  profile: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: AP.secondary, borderRadius: radius.xxl, padding: 20 },
  profileAvatar: { width: 64, height: 64, borderRadius: radius.full, borderWidth: 2, borderColor: AP.primary },
  profileName: { fontSize: 18, fontWeight: '700', color: '#fff' },
  profilePhone: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  editBtn: { width: 40, height: 40, borderRadius: radius.full, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },

  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, color: AP.mutedForeground, marginTop: 28, marginBottom: 12, marginLeft: 4 },
  group: { backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, borderRadius: radius.xl, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowLabel: { fontSize: 14, fontWeight: '500', color: AP.foreground },
  rowValue: { fontSize: 12, fontWeight: '600', color: AP.mutedForeground },
  divider: { height: 1, backgroundColor: AP.border },

  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: soft.destructive10, borderRadius: radius.xl, padding: 16, marginTop: 28 },
  logoutText: { fontSize: 15, fontWeight: '700', color: AP.destructive },
});
