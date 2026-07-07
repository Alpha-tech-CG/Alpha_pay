import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '@/auth';
import { C } from '@/theme';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

function MenuItem({ icon, label, onPress, danger }: { icon: IconName; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.menuItem, pressed && { opacity: 0.7 }]}>
      <View style={[s.menuIcon, danger && { backgroundColor: '#fff0f0' }]}>
        <MaterialIcons name={icon} size={20} color={danger ? C.error : C.primary} />
      </View>
      <Text style={[s.menuLabel, danger && { color: C.error }]}>{label}</Text>
      {!danger && <MaterialIcons name="chevron-right" size={20} color={C.muted} />}
    </Pressable>
  );
}

export default function ProfileScreen() {
  const { phone, signOut } = useAuth();

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.title}>Profil</Text>

        {/* Avatar */}
        <View style={s.avatarSection}>
          <View style={s.avatar}>
            <MaterialIcons name="person" size={36} color="#fff" />
          </View>
          <Text style={s.phoneTxt}>{phone ?? '—'}</Text>
          <View style={s.badge}>
            <Text style={s.badgeTxt}>Compte personnel</Text>
          </View>
        </View>

        {/* Menu */}
        <View style={s.card}>
          <MenuItem icon="security" label="Changer de PIN" onPress={() => {}} />
          <View style={s.sep} />
          <MenuItem icon="notifications" label="Notifications" onPress={() => {}} />
          <View style={s.sep} />
          <MenuItem icon="help-outline" label="Aide & Support" onPress={() => {}} />
        </View>

        <View style={[s.card, { marginTop: 16 }]}>
          <MenuItem icon="logout" label="Se déconnecter" onPress={signOut} danger />
        </View>

        <Text style={s.version}>PayBrain v1.0 · Compte client</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: 20, paddingBottom: 48 },
  title: { fontSize: 24, fontWeight: '800', color: C.text, marginBottom: 24 },

  avatarSection: { alignItems: 'center', marginBottom: 32 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  phoneTxt: { fontSize: 18, fontWeight: '700', color: C.text },
  badge: { marginTop: 6, backgroundColor: C.secondaryContainer, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  badgeTxt: { fontSize: 12, fontWeight: '700', color: C.secondary },

  card: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1.5, borderColor: C.border, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  menuIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: C.surfaceContainerLow, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: C.text },
  sep: { height: 1, backgroundColor: C.border, marginLeft: 68 },

  version: { fontSize: 12, color: C.muted, textAlign: 'center', marginTop: 32 },
});
