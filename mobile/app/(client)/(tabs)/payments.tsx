import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, type Href } from 'expo-router';
import { Icon } from '@/components/Icon';
import { AvatarBadge, BigTitle, useStatusBar } from '@/components/UcKit';
import { UC, ucFont } from '@/uc';
import { useWallet } from '@/wallet-store';

// « Découvrez le monde des paiements » : grandes tuiles grises dégradées,
// titre en haut à gauche, illustration en bas à droite.
const ITEMS: { title: string; icon: string; accent: string; href: Href }[] = [
  { title: 'Faire un paiement', icon: 'send', accent: '#2F6FB0', href: '/(client)/send' },
  { title: 'Payer par QR code', icon: 'qr-code-scanner', accent: UC.ink, href: '/(client)/scan' },
  { title: 'Recharger mon compte', icon: 'smartphone', accent: '#C9A400', href: '/(client)/top-up' },
  { title: 'Archives et gestion\ndes paiements', icon: 'archive', accent: UC.inkSoft, href: '/(client)/(tabs)/history' },
];

export default function Payments() {
  const router = useRouter();
  useStatusBar('dark');
  const { user } = useWallet();
  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <BigTitle style={{ flex: 1 }}>Découvrez le monde{'\n'}des paiements</BigTitle>
          <AvatarBadge uri={user.avatar} count={3} onPress={() => router.push('/(client)/profile')} />
        </View>

        <View style={{ gap: 12 }}>
          {ITEMS.map((it) => (
            <Pressable key={it.title} onPress={() => router.push(it.href)} style={({ pressed }) => pressed && { opacity: 0.85 }}>
              <LinearGradient colors={['#EDEDED', '#C9C9C9']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.tile}>
                <Text style={s.tileTitle}>{it.title}</Text>
                <View style={s.art}>
                  <View style={s.artDisk} />
                  <Icon name={it.icon} size={56} color={it.accent} />
                </View>
              </LinearGradient>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: UC.bg },
  scroll: { paddingHorizontal: 16, paddingBottom: 24 },
  header: { flexDirection: 'row', alignItems: 'flex-start', paddingTop: 8, paddingBottom: 24, gap: 12 },
  tile: { height: 125, borderRadius: 10, padding: 16, overflow: 'hidden' },
  tileTitle: { fontFamily: ucFont.condensed, fontSize: 19, fontWeight: '700', color: UC.ink, lineHeight: 24 },
  art: { position: 'absolute', right: 6, bottom: -8, width: 110, height: 100, alignItems: 'center', justifyContent: 'center' },
  artDisk: { position: 'absolute', width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.45)' },
});
