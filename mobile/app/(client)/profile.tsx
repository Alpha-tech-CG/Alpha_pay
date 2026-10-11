import { View, Text, Pressable, StyleSheet, ScrollView, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Icon } from '@/components/Icon';
import { useAuth } from '@/auth';
import { usePhoto } from '@/photo';
import { BigTitle, BrandTile, Divider, Label, LinkAction, TopBar, useStatusBar } from '@/components/UcKit';
import { UC, ucFont } from '@/uc';
import { useWallet } from '@/wallet-store';

function Line({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <>
      <View style={s.line}>
        <View style={{ flex: 1, gap: 4 }}>
          <Label>{label}</Label>
          {value && <Text style={s.value}>{value}</Text>}
        </View>
        {children}
      </View>
      <Divider />
    </>
  );
}

export default function ProfileScreen() {
  useStatusBar('dark');
  const { phone, signOut } = useAuth();
  const { user } = useWallet();
  const { uri: photoUri, pick } = usePhoto();
  const confirmDelete = () => Alert.alert('Supprimer le compte', 'Contactez le support AlphaPay pour clôturer votre compte.');

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <TopBar onBack={() => router.back()} />
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <BigTitle style={{ marginTop: 12 }}>Profil</BigTitle>

        {/* Identité */}
        <View style={s.identity}>
          <Pressable onPress={pick}>
            <View style={s.ring}>
              <Image source={{ uri: photoUri ?? user.avatar }} style={s.avatar} />
            </View>
            <View style={s.edit}><Icon name="camera" size={14} color={UC.white} /></View>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.name}>{user.name}</Text>
            <Text style={s.phone}>{phone ?? user.phone}</Text>
            <View style={s.kyc}><Icon name="verified" size={14} color={UC.white} /><Text style={s.kycText}>VÉRIFIÉ · NIVEAU 2</Text></View>
          </View>
        </View>

        <Label style={s.section}>Informations</Label>
        <Divider />
        <Line label="Identifiant AlphaPay" value={user.tag} />
        <Line label="Pays" value="République du Congo" />
        <Line label="Type de compte" value="Compte personnel">
          <LinkAction label="Évoluer" onPress={() => Alert.alert('Évoluer', 'Devenez Marchand ou Développeur depuis le site AlphaPay.')} />
        </Line>

        <Label style={s.section}>Compte préféré</Label>
        <Divider />
        <View style={s.line}>
          <BrandTile brand="mtn" size={36} />
          <View style={{ flex: 1 }}>
            <Text style={s.value}>MTN MoMo</Text>
            <Text style={s.phone}>{phone ?? user.phone}</Text>
          </View>
          <LinkAction label="Modifier" onPress={() => router.push('/(client)/link-account')} />
        </View>
        <Divider />

        <Label style={s.section}>Sécurité</Label>
        <Divider />
        <Line label="Code PIN"><LinkAction label="Modifier" onPress={() => {}} /></Line>
        <Line label="Biométrie" value="EMPREINTE DIGITALE"><LinkAction label="Gérer" onPress={() => {}} /></Line>

        <Pressable style={s.logout} onPress={signOut}>
          <Icon name="log-out" size={18} color={UC.red} />
          <Text style={s.logoutText}>Se déconnecter</Text>
        </Pressable>
        <Pressable style={s.delete} onPress={confirmDelete}>
          <Text style={s.deleteText}>Supprimer le compte</Text>
        </Pressable>
        <Text style={s.version}>AlphaPay v1.0 · Compte personnel</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: UC.bg },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: UC.bgGrey, borderRadius: 10, padding: 16, marginTop: 20 },
  ring: { width: 76, height: 76, borderRadius: 38, borderWidth: 3, borderColor: UC.red, alignItems: 'center', justifyContent: 'center', backgroundColor: UC.white },
  avatar: { width: 66, height: 66, borderRadius: 33, backgroundColor: UC.lineSoft },
  edit: { position: 'absolute', right: -2, bottom: -2, width: 26, height: 26, borderRadius: 13, backgroundColor: UC.teal, borderWidth: 2, borderColor: UC.white, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: ucFont.condensed, fontSize: 22, fontWeight: '700', color: UC.ink },
  phone: { fontFamily: ucFont.regular, fontSize: 14, color: UC.muted, marginTop: 2 },
  kyc: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: UC.teal, borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2, marginTop: 8 },
  kycText: { fontFamily: ucFont.condensed, fontSize: 12, fontWeight: '700', color: UC.white },
  section: { marginTop: 28, marginBottom: 8 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16 },
  value: { fontFamily: ucFont.regular, fontSize: 17, color: UC.ink },
  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1.5, borderColor: UC.red, borderRadius: 6, height: 50, marginTop: 32 },
  logoutText: { fontFamily: ucFont.condensed, fontSize: 16, fontWeight: '700', color: UC.red },
  delete: { height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  deleteText: { fontFamily: ucFont.condensed, fontSize: 15, fontWeight: '700', color: UC.muted, textDecorationLine: 'underline' },
  version: { fontFamily: ucFont.regular, fontSize: 13, color: UC.muted, textAlign: 'center', marginTop: 16 },
});
