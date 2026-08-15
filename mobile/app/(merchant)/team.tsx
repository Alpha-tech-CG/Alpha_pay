import { View, Text, Image, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { AP, soft, radius, shadow } from '@/design';
import { useMerchant } from '@/merchant-store';

export default function Team() {
  const router = useRouter();
  const { team } = useMerchant();

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => router.back()}><Icon name="arrow-left" size={20} color={AP.secondary} /></Pressable>
        <Text style={s.title}>Team</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.note}>
          <Icon name="info" size={22} color={AP.primary} />
          <View style={{ flex: 1 }}>
            <Text style={s.noteTitle}>Read-only</Text>
            <Text style={s.noteText}>Invitations, roles and ownership are managed from the web dashboard.</Text>
          </View>
        </View>

        <View style={s.card}>
          {team.map((m, i) => (
            <View key={m.id} style={[s.member, i > 0 && s.memberBorder]}>
              <View style={s.memberLeft}>
                {m.avatar ? (
                  <Image source={{ uri: m.avatar }} style={s.memberAvatar} />
                ) : (
                  <View style={[s.memberAvatar, s.memberInitials]}><Text style={s.memberInitialsText}>{m.initials}</Text></View>
                )}
                <View>
                  <Text style={s.memberName}>{m.name}</Text>
                  <Text style={s.memberRole}>{m.role}</Text>
                </View>
              </View>
              {m.badge ? (
                <Text style={[s.memberBadge, m.badge === 'Suspended' && s.memberBadgeWarn]}>{m.badge}</Text>
              ) : null}
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: AP.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  backBtn: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, alignItems: 'center', justifyContent: 'center', ...shadow(2) },
  title: { flex: 1, fontSize: 20, fontWeight: '900', color: AP.secondary },
  scroll: { paddingHorizontal: 20, paddingBottom: 40, gap: 16 },

  note: { flexDirection: 'row', gap: 16, backgroundColor: soft.primary05, borderWidth: 1, borderColor: soft.primary20, borderRadius: radius.lg, padding: 16 },
  noteTitle: { fontSize: 13, fontWeight: '800', color: AP.secondary },
  noteText: { fontSize: 12, color: AP.mutedForeground, lineHeight: 18, marginTop: 4 },

  card: { backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, borderRadius: radius.lg, ...shadow(2) },
  member: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20 },
  memberBorder: { borderTopWidth: 1, borderTopColor: AP.border },
  memberLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  memberAvatar: { width: 40, height: 40, borderRadius: 20 },
  memberInitials: { backgroundColor: AP.primary, alignItems: 'center', justifyContent: 'center' },
  memberInitialsText: { fontSize: 13, fontWeight: '900', color: AP.secondary },
  memberName: { fontSize: 14, fontWeight: '800', color: AP.secondary },
  memberRole: { fontSize: 12, color: AP.mutedForeground, marginTop: 2 },
  memberBadge: { fontSize: 12, fontWeight: '700', color: AP.mutedForeground },
  memberBadgeWarn: { color: AP.chart5 },
});
