import { View, Text, Pressable, ScrollView, StyleSheet, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { AP, radius, shadow } from '@/design';
import { useWallet } from '@/wallet-store';

export default function Receive() {
  const router = useRouter();
  const { user } = useWallet();
  const link = `https://alphapay.africa/pay/${user.tag.replace('@', '')}`;

  const shareLink = () => {
    Share.share({ message: `Payez-moi sur AlphaPay : ${link}` }).catch(() => {});
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.header}>
        <Pressable style={s.back} onPress={() => router.back()}>
          <Icon name="arrow-left" size={20} color={AP.foreground} />
        </Pressable>
        <Text style={s.headerTitle}>Receive</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={[s.qrCard, shadow(6)]}>
          <View style={s.qrInner}>
            <Icon name="qr-code" size={180} color={AP.foreground} />
          </View>
          <View style={s.tag}>
            <Text style={s.tagText}>{user.tag}</Text>
          </View>
        </View>

        <View style={s.textBlock}>
          <Text style={s.title}>Your AlphaPay QR Code</Text>
          <Text style={s.subtitle}>Scan this code to receive money instantly from any AlphaPay user.</Text>
        </View>

        <View style={{ gap: 12, width: '100%' }}>
          <Pressable style={s.optionBtn} onPress={shareLink}>
            <View style={s.optionLeft}>
              <Icon name="link" size={20} color={AP.primary} />
              <Text style={s.optionText}>Share payment link</Text>
            </View>
            <Icon name="chevron-right" size={18} color={AP.mutedForeground} />
          </Pressable>
          <Pressable style={s.optionBtn} onPress={shareLink}>
            <View style={s.optionLeft}>
              <Icon name="download" size={20} color={AP.primary} />
              <Text style={s.optionText}>Save QR as image</Text>
            </View>
            <Icon name="chevron-right" size={18} color={AP.mutedForeground} />
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: AP.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 },
  back: { width: 40, height: 40, borderRadius: radius.full, borderWidth: 1, borderColor: AP.border, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: AP.foreground },
  scroll: { paddingHorizontal: 20, alignItems: 'center', gap: 32, paddingTop: 20, paddingBottom: 24 },

  qrCard: { width: 280, maxWidth: '100%', backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, borderRadius: radius.xxxl, padding: 32, alignItems: 'center', marginTop: 12 },
  qrInner: { width: '100%', aspectRatio: 1, backgroundColor: '#fff', borderRadius: radius.xl, borderWidth: 1, borderColor: AP.border, alignItems: 'center', justifyContent: 'center' },
  tag: { position: 'absolute', bottom: -16, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: AP.secondary, borderRadius: radius.full },
  tagText: { color: AP.secondaryForeground, fontSize: 12, fontWeight: '700' },

  textBlock: { alignItems: 'center', gap: 8 },
  title: { fontSize: 18, fontWeight: '700', color: AP.foreground },
  subtitle: { fontSize: 14, color: AP.mutedForeground, textAlign: 'center', maxWidth: 240, lineHeight: 20 },

  optionBtn: { height: 56, backgroundColor: AP.card, borderWidth: 1, borderColor: AP.border, borderRadius: radius.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  optionLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  optionText: { fontSize: 14, fontWeight: '600', color: AP.foreground },
});
