import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { AP, soft, radius, shadow } from '@/design';
import { Card, SectionTitle } from '@/dash';
import { useMerchant } from '@/merchant-store';

export default function MerchantSettings() {
  const router = useRouter();
  const { business } = useMerchant();
  const [name, setName] = useState(business.business);
  const [email, setEmail] = useState(business.email);

  // Resynchronise quand le profil live arrive.
  useEffect(() => { setName(business.business); setEmail(business.email); }, [business]);

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.title}>Settings</Text>

        <SectionTitle>Business Profile</SectionTitle>
        <Card>
          <View style={s.logoRow}>
            <View style={s.logo}><Text style={{ fontSize: 32 }}>🏢</Text></View>
            <Pressable style={s.logoBtn}><Text style={s.logoBtnText}>Change Logo</Text></Pressable>
          </View>
          <Text style={s.label}>Business Name</Text>
          <TextInput style={s.input} value={name} onChangeText={setName} />
          <Text style={s.label}>Support Email</Text>
          <TextInput style={s.input} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        </Card>

        <View style={{ marginTop: 24 }}>
          <SectionTitle>Team</SectionTitle>
          <Card style={{ padding: 0 }}>
            <Pressable style={s.toolRow} onPress={() => router.push('/(merchant)/team')}>
              <View style={s.toolLeft}><Icon name="account-multiple" size={20} color={AP.primary} /><Text style={s.toolText}>Team Members</Text></View>
              <Icon name="chevron-right" size={18} color={AP.mutedForeground} />
            </Pressable>
          </Card>
        </View>

        <View style={{ marginTop: 24 }}>
          <SectionTitle>Developer Tools</SectionTitle>
          <Card style={{ padding: 0 }}>
            <Pressable style={s.toolRow} onPress={() => router.push('/(merchant)/api-keys')}>
              <View style={s.toolLeft}><Icon name="vpn-key" size={20} color={AP.primary} /><Text style={s.toolText}>API Keys</Text></View>
              <Icon name="chevron-right" size={18} color={AP.mutedForeground} />
            </Pressable>
            <View style={s.toolBorder} />
            <Pressable style={s.toolRow} onPress={() => router.push('/(merchant)/webhooks')}>
              <View style={s.toolLeft}><Icon name="dns" size={20} color={AP.primary} /><Text style={s.toolText}>Webhooks</Text></View>
              <Icon name="chevron-right" size={18} color={AP.mutedForeground} />
            </Pressable>
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: AP.bg },
  scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 120 },
  title: { fontSize: 22, fontWeight: '900', color: AP.secondary, marginBottom: 24 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 20, marginBottom: 20 },
  logo: { width: 72, height: 72, borderRadius: radius.xl, backgroundColor: soft.muted50, alignItems: 'center', justifyContent: 'center' },
  logoBtn: { height: 40, paddingHorizontal: 16, borderWidth: 1, borderColor: AP.border, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  logoBtnText: { fontSize: 12, fontWeight: '800', color: AP.secondary },
  label: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: AP.mutedForeground, textTransform: 'uppercase', marginBottom: 8, marginTop: 12 },
  input: { height: 46, backgroundColor: soft.muted50, borderWidth: 1, borderColor: AP.border, borderRadius: radius.md, paddingHorizontal: 16, fontSize: 14, fontWeight: '600', color: AP.secondary },

  toolRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20 },
  toolBorder: { borderTopWidth: 1, borderTopColor: AP.border },
  toolLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toolText: { fontSize: 14, fontWeight: '700', color: AP.secondary },
});
