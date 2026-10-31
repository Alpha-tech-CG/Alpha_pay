import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import { Icon } from '@/components/Icon';
import { useAuth } from '@/auth';
import { AvatarBadge, BigTitle, Divider, useStatusBar } from '@/components/UcKit';
import { UC, ucFont } from '@/uc';
import { useWallet } from '@/wallet-store';

function Row({ icon, label, value, onPress, right }: { icon: string; label: string; value?: string; onPress?: () => void; right?: React.ReactNode }) {
  return (
    <>
      <Pressable style={({ pressed }) => [s.row, pressed && onPress && { opacity: 0.6 }]} onPress={onPress} disabled={!onPress}>
        <Icon name={icon} size={22} color={UC.ink} />
        <Text style={s.rowLabel}>{label}</Text>
        {value && <Text style={s.rowValue}>{value}</Text>}
        {right ?? (onPress && <Icon name="chevron-right" size={20} color={UC.teal} />)}
      </Pressable>
      <Divider />
    </>
  );
}

export default function More() {
  const router = useRouter();
  useStatusBar('dark');
  const { signOut } = useAuth();
  const { user } = useWallet();
  const [biometrics, setBiometrics] = useState(true);
  const go = (href: Href) => () => router.push(href);

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <BigTitle>Plus</BigTitle>
          <AvatarBadge uri={user.avatar} count={3} onPress={go('/(client)/profile')} />
        </View>

        <Pressable style={s.profile} onPress={go('/(client)/profile')}>
          <View style={{ flex: 1 }}>
            <Text style={s.profileName}>{user.name}</Text>
            <Text style={s.profileSub}>{user.phone} · {user.tag}</Text>
          </View>
          <Icon name="chevron-right" size={20} color={UC.teal} />
        </Pressable>

        <Text style={s.section}>SERVICES</Text>
        <Divider />
        <Row icon="qr-code" label="Recevoir de l'argent" onPress={go('/(client)/receive')} />
        <Row icon="smartphone" label="USSD hors connexion" onPress={go('/(client)/ussd')} />
        <Row icon="link" label="Lier un compte Mobile Money" onPress={go('/(client)/link-account')} />

        <Text style={s.section}>SÉCURITÉ</Text>
        <Divider />
        <Row icon="lock" label="Modifier le PIN" onPress={() => {}} />
        <Row
          icon="fingerprint"
          label="Empreinte digitale"
          right={<Switch value={biometrics} onValueChange={setBiometrics} trackColor={{ true: UC.teal, false: UC.line }} thumbColor={UC.white} />}
        />

        <Text style={s.section}>PRÉFÉRENCES</Text>
        <Divider />
        <Row icon="languages" label="Langue" value="Français" onPress={() => {}} />
        <Row icon="help-circle" label="Aide et contact" onPress={() => {}} />

        <Pressable style={s.logout} onPress={signOut}>
          <Icon name="log-out" size={18} color={UC.red} />
          <Text style={s.logoutText}>Se déconnecter</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: UC.bg },
  scroll: { paddingHorizontal: 16, paddingBottom: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, paddingBottom: 16 },
  profile: { flexDirection: 'row', alignItems: 'center', backgroundColor: UC.bgGrey, borderRadius: 10, padding: 16 },
  profileName: { fontFamily: ucFont.condensed, fontSize: 19, fontWeight: '700', color: UC.ink },
  profileSub: { fontFamily: ucFont.regular, fontSize: 13, color: UC.muted, marginTop: 2 },
  section: { fontFamily: ucFont.condensed, fontSize: 13, fontWeight: '700', letterSpacing: 0.6, color: UC.inkSoft, marginTop: 24, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  rowLabel: { flex: 1, fontFamily: ucFont.regular, fontSize: 16, color: UC.ink },
  rowValue: { fontFamily: ucFont.condensed, fontSize: 13, fontWeight: '700', color: UC.teal, textTransform: 'uppercase' },
  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1.5, borderColor: UC.red, borderRadius: 6, height: 50, marginTop: 30 },
  logoutText: { fontFamily: ucFont.condensed, fontSize: 16, fontWeight: '700', color: UC.red },
});
