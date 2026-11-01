// Alertes : budget à 80 % et épuisé, dépense inhabituelle, paliers d'objectif, envois.
import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { B, F, R } from '@/brand';
import { EmptyLine, ErrorLine, Spinner, Surface, TopBar, useStatusBar } from '@/bank';
import { FadeIn } from '@/motion';
import { personal, type PAlert } from '@/api';
import { ago } from '@/format';
import { useLoad } from '@/useLoad';

const KIND: Record<string, { icon: string; bg: string; fg: string }> = {
  budget: { icon: 'alert-triangle', bg: B.mustardSoft, fg: B.warning },
  unusual: { icon: 'error-outline', bg: B.burgundySoft, fg: B.burgundy },
  goal: { icon: 'piggy-bank', bg: B.successSoft, fg: B.success },
  transfer: { icon: 'swap-horiz', bg: B.navySoft, fg: B.navy },
};

export default function Alerts() {
  const router = useRouter();
  useStatusBar('dark');
  const list = useLoad(() => personal.alerts(), []);
  // Ouvrir la liste vaut lecture : le badge de l'accueil s'efface.
  useEffect(() => {
    personal.readAlerts().catch(() => {});
  }, []);

  return (
    <View style={s.root}>
      <TopBar onBack={() => (router.canGoBack() ? router.back() : router.replace('/(personal)'))} title="Alertes" />
      <ScrollView contentContainerStyle={s.body}>
        <ErrorLine message={list.error} />
        {list.loading && !list.data ? <Surface><Spinner /></Surface> : null}
        {list.data?.length === 0 && <Surface><EmptyLine icon="notifications-none" title="Aucune alerte" body="Vous serez prévenu à 80 % d’une enveloppe, à chaque palier d’objectif et à chaque envoi." /></Surface>}
        {list.data?.map((a: PAlert, i) => {
          const k = KIND[a.kind] ?? KIND.transfer;
          return (
            <FadeIn key={a.id} index={i}>
              <View style={[s.card, !a.read && s.unread]}>
                <View style={[s.icon, { backgroundColor: k.bg }]}><Icon name={k.icon} size={20} color={k.fg} /></View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={s.title}>{a.title}</Text>
                  <Text style={s.text}>{a.body}</Text>
                  <Text style={s.time}>{ago(a.created_at)}</Text>
                </View>
              </View>
            </FadeIn>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: B.bg },
  body: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32, gap: 10 },
  card: { flexDirection: 'row', gap: 12, backgroundColor: B.surface, borderRadius: R.lg, padding: 14 },
  unread: { borderLeftWidth: 4, borderLeftColor: B.mustard },
  icon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: F.semibold, fontSize: 15, color: B.ink },
  text: { fontFamily: F.regular, fontSize: 14, color: B.inkSoft, lineHeight: 20 },
  time: { fontFamily: F.regular, fontSize: 12, color: B.muted },
});
