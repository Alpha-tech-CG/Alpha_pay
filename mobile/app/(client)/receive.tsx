import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { BigTitle, Divider, Label, LinkAction, LogoMark, PrimaryButton, TopBar, useStatusBar } from '@/components/UcKit';
import { UC, ucFont } from '@/uc';
import { useWallet } from '@/wallet-store';

export default function Receive() {
  const router = useRouter();
  useStatusBar('dark');
  const { user } = useWallet();
  const tag = user.tag.startsWith('@') ? user.tag : `@${user.tag}`;
  const link = `alphapay.africa/${tag.replace('@', '')}`;
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await Clipboard.setStringAsync(`https://${link}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const share = () => Share.share({ message: `Payez-moi sur AlphaPay : https://${link}` });

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <TopBar onBack={() => router.back()} />
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <BigTitle style={{ marginTop: 12 }}>Recevoir de l'argent</BigTitle>
        <Text style={s.sub}>Montrez ce QR code à tout utilisateur AlphaPay pour recevoir des fonds instantanément.</Text>

        <View style={s.qrCard}>
          <View>
            <QRCode value={`https://${link}`} size={170} color={UC.ink} backgroundColor={UC.white} />
            <View style={s.qrLogo}><LogoMark size={44} color={UC.white} bg={UC.red} /></View>
          </View>
          <Text style={s.tag}>{tag}</Text>
          <Text style={s.name}>{user.name}</Text>
        </View>

        <Divider />
        <View style={s.line}>
          <View style={{ flex: 1, gap: 4 }}>
            <Label>Lien de paiement</Label>
            <Text style={s.value} numberOfLines={1}>{link}</Text>
          </View>
          <LinkAction label={copied ? 'Copié' : 'Copier'} onPress={copy} />
        </View>
        <Divider />
        <View style={s.line}>
          <View style={{ flex: 1, gap: 4 }}>
            <Label>Numéro Mobile Money</Label>
            <Text style={s.value}>{user.phone}</Text>
          </View>
          <LinkAction label="Copier" onPress={() => Clipboard.setStringAsync(user.phone)} />
        </View>
        <Divider />
      </ScrollView>
      <View style={s.footer}>
        <PrimaryButton label="Partager le lien" icon="share-variant" onPress={share} />
        <PrimaryButton label="Enregistrer l'image" variant="dark" icon="download" onPress={share} />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: UC.bg },
  scroll: { paddingHorizontal: 16, paddingBottom: 24 },
  sub: { fontFamily: ucFont.regular, fontSize: 16, color: UC.inkSoft, marginTop: 6 },
  qrCard: { alignItems: 'center', backgroundColor: UC.bgGrey, borderRadius: 10, paddingVertical: 20, marginVertical: 18 },
  qrLogo: { position: 'absolute', top: 63, left: 63, width: 44, height: 44, borderRadius: 22, borderWidth: 3, borderColor: UC.white, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  tag: { fontFamily: ucFont.condensed, fontSize: 24, fontWeight: '700', color: UC.ink, marginTop: 12 },
  name: { fontFamily: ucFont.regular, fontSize: 15, color: UC.muted, marginTop: 2 },
  line: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, gap: 12 },
  value: { fontFamily: ucFont.regular, fontSize: 17, color: UC.ink },
  footer: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, gap: 10 },
});
