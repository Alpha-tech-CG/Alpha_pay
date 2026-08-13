import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { Icon } from '@/components/Icon';
import { AP, soft, radius, shadow } from '@/design';
import { useWallet } from '@/wallet-store';

export default function Receive() {
  const router = useRouter();
  const { user } = useWallet();
  const tag = user.tag.startsWith('@') ? user.tag : `@${user.tag}`;
  const link = `alphapay.africa/${tag.replace('@', '')}`;
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await Clipboard.setStringAsync(`https://${link}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const share = () => Share.share({ message: `Pay me on AlphaPay: https://${link}` });

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => router.back()}>
          <Icon name="arrow-left" size={20} color={AP.secondary} />
        </Pressable>
        <Text style={s.title}>Receive Money</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.idBlock}>
          <Text style={s.idLabel}>My Payment ID</Text>
          <Text style={s.idTag}>{tag}</Text>
        </View>

        {/* QR card with corner marks */}
        <View style={s.qrCard}>
          <View style={[s.corner, s.tl]} />
          <View style={[s.corner, s.tr]} />
          <View style={[s.corner, s.bl]} />
          <View style={[s.corner, s.br]} />
          <View style={s.qrInner}>
            <QRCode
              value={`https://${link}`}
              size={188}
              color="#ffffff"
              backgroundColor={AP.secondary}
            />
            <View style={s.qrLogo}>
              <Text style={s.qrLogoText}>α</Text>
            </View>
          </View>
        </View>

        {/* Payment link */}
        <View style={s.linkRow}>
          <View style={s.linkIcon}>
            <Icon name="link" size={22} color={AP.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.linkLabel}>Payment Link</Text>
            <Text style={s.linkValue} numberOfLines={1}>{link}</Text>
          </View>
          <Pressable style={[s.copyBtn, copied && { backgroundColor: AP.primary }]} onPress={copy}>
            <Icon name={copied ? 'check' : 'content-copy'} size={20} color={copied ? '#fff' : AP.secondary} />
          </Pressable>
        </View>

        <View style={s.actions}>
          <Pressable style={({ pressed }) => [s.shareBtn, pressed && s.pressed]} onPress={share}>
            <Icon name="share-variant" size={20} color="#fff" />
            <Text style={s.shareText}>Share link</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [s.saveBtn, pressed && s.pressed]} onPress={share}>
            <Icon name="download" size={20} color={AP.secondary} />
            <Text style={s.saveText}>Save Image</Text>
          </Pressable>
        </View>

        <Text style={s.footerNote}>Show this QR code to any AlphaPay user{'\n'}to receive funds instantly.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: AP.bg },
  pressed: { opacity: 0.95, transform: [{ scale: 0.98 }] },
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  backBtn: { width: 48, height: 48, borderRadius: radius.xl, backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, alignItems: 'center', justifyContent: 'center', ...shadow(2) },
  title: { fontSize: 20, fontWeight: '700', color: AP.secondary },
  scroll: { paddingHorizontal: 20, paddingBottom: 32, alignItems: 'center', gap: 32 },

  idBlock: { alignItems: 'center', gap: 6, marginTop: 8 },
  idLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 3, color: 'rgba(11,30,61,0.4)', textTransform: 'uppercase' },
  idTag: { fontSize: 30, fontWeight: '900', letterSpacing: -1, color: AP.secondary },

  qrCard: { width: '100%', maxWidth: 320, aspectRatio: 1, backgroundColor: AP.card, borderRadius: 40, padding: 40, borderWidth: 1, borderColor: AP.border, alignItems: 'center', justifyContent: 'center', ...shadow(10, AP.secondary, 0.06) },
  corner: { position: 'absolute', width: 32, height: 32, borderColor: AP.primary },
  tl: { top: 32, left: 32, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 12 },
  tr: { top: 32, right: 32, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 12 },
  bl: { bottom: 32, left: 32, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 12 },
  br: { bottom: 32, right: 32, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 12 },
  qrInner: { backgroundColor: AP.secondary, borderRadius: radius.xl, padding: 16, alignItems: 'center', justifyContent: 'center' },
  qrLogo: { position: 'absolute', width: 56, height: 56, borderRadius: radius.xl, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...shadow(6) },
  qrLogoText: { fontSize: 30, fontWeight: '900', color: AP.primary, marginTop: -2 },

  linkRow: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, borderRadius: radius.xxxl, padding: 20, ...shadow(2) },
  linkIcon: { width: 48, height: 48, borderRadius: radius.lg, backgroundColor: soft.primary10, alignItems: 'center', justifyContent: 'center' },
  linkLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: 'rgba(11,30,61,0.4)', textTransform: 'uppercase' },
  linkValue: { fontSize: 14, fontWeight: '700', color: AP.secondary, marginTop: 2 },
  copyBtn: { width: 40, height: 40, borderRadius: radius.lg, backgroundColor: soft.muted50, alignItems: 'center', justifyContent: 'center' },

  actions: { width: '100%', flexDirection: 'row', gap: 16 },
  shareBtn: { flex: 1, height: 64, backgroundColor: AP.secondary, borderRadius: radius.xxl, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, ...shadow(10, AP.secondary, 0.2) },
  shareText: { fontSize: 12, fontWeight: '900', color: '#fff', letterSpacing: 1, textTransform: 'uppercase' },
  saveBtn: { flex: 1, height: 64, backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, borderRadius: radius.xxl, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, ...shadow(2) },
  saveText: { fontSize: 12, fontWeight: '900', color: AP.secondary, letterSpacing: 1, textTransform: 'uppercase' },

  footerNote: { fontSize: 10, fontWeight: '700', letterSpacing: 1, color: 'rgba(11,30,61,0.4)', textTransform: 'uppercase', textAlign: 'center', lineHeight: 18, paddingHorizontal: 40 },
});
