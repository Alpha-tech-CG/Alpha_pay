// Vue financière unifiée : tout l'argent suivi au même endroit, dépensé, épargné, reste à dépenser.
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Icon } from '@/components/Icon';
import { B, F, R, shadow } from '@/brand';
import { Amount, EmptyLine, ErrorLine, Hero, PrimaryButton, SectionHead, Spinner, Surface, useAmountsHidden, useStatusBar } from '@/bank';
import { FadeIn, PressScale, useCountUp } from '@/motion';
import { AccountTile, CategoryTile, envelopeColor, fcfa, Gauge, HeroStat } from '@/personalUi';
import { personal } from '@/api';
import { demoLast4 } from '@/CardArt';
import { useSession } from '@/session';
import { useLoad } from '@/useLoad';

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
}

function Quick({ icon, label, onPress, primary, index }: { icon: string; label: string; onPress: () => void; primary?: boolean; index: number }) {
  return (
    <FadeIn index={index} delay={150} style={{ flex: 1 }}>
      <PressScale onPress={onPress} style={s.qa} accessibilityRole="button" accessibilityLabel={label}>
        <View style={[s.qaIcon, primary && { backgroundColor: B.mustard }]}><Icon name={icon} size={22} color={primary ? B.navy : B.white} /></View>
        <Text style={s.qaLabel} numberOfLines={1}>{label}</Text>
      </PressScale>
    </FadeIn>
  );
}

export default function PersonalHome() {
  const router = useRouter();
  useStatusBar('light');
  const { user } = useSession();
  const [hidden, toggleHidden] = useAmountsHidden();
  const ov = useLoad(() => personal.overview(), [], { pollMs: 30000 });
  const total = useCountUp(ov.data?.total_balance ?? 0);
  const d = ov.data;
  const mask = (v: number) => (hidden ? '••••' : fcfa(v));

  if (d && !d.profile.onboarded) return <Redirect href="/(personal)/setup" />;

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={ov.refreshing} onRefresh={ov.reload} tintColor={B.mustard} colors={[B.navy]} />}>
        <Hero
          title={`${greeting()}, ${(user?.fullName ?? '').split(' ')[0]}`}
          right={
            <>
              <PressScale onPress={toggleHidden} hitSlop={8} style={s.round} accessibilityRole="button" accessibilityLabel={hidden ? 'Afficher les montants' : 'Masquer les montants'}>
                <Icon name={hidden ? 'eye-off' : 'eye'} size={18} color={B.white} />
              </PressScale>
              <PressScale onPress={() => router.push('/(personal)/alerts')} hitSlop={8} style={s.round} accessibilityRole="button" accessibilityLabel="Alertes">
                <Icon name="notifications-none" size={20} color={B.white} />
                {d?.unread_alerts ? <View style={s.badge}><Text style={s.badgeText}>{d.unread_alerts > 9 ? '9+' : d.unread_alerts}</Text></View> : null}
              </PressScale>
            </>
          }
        >
          {d && (
            <FadeIn>
              <PressScale onPress={() => Clipboard.setStringAsync(d.profile.alphapay_id)} style={s.handle} accessibilityRole="button" accessibilityLabel="Copier mon identifiant AlphaPay">
                <Icon name="content-copy" size={13} color={B.mustard} />
                <Text style={s.handleText}>{d.profile.alphapay_id}</Text>
              </PressScale>
              <Text style={s.heroLabel}>Solde total suivi</Text>
              <Amount value={total} currency="FCFA" size={38} color={B.white} />
              <View style={s.stats}>
                <HeroStat label="Dépensé" value={mask(d.spent_this_month)} />
                <HeroStat label="Épargné" value={mask(d.saved_this_month)} tone="mustard" />
                <HeroStat label="Reste" value={mask(d.remaining_to_spend)} tone={d.remaining_to_spend < 0 ? 'burgundy' : undefined} />
              </View>
            </FadeIn>
          )}
          <View style={s.qaRow}>
            <Quick index={0} icon="send" label="Envoyer" primary onPress={() => router.push('/(personal)/send')} />
            <Quick index={1} icon="qr-code" label="Recevoir" onPress={() => router.push('/(personal)/alphapay')} />
            <Quick index={2} icon="plus" label="Dépense" onPress={() => router.push('/(personal)/entry')} />
            <Quick index={3} icon="receipt-long" label="Rapport" onPress={() => router.push('/(personal)/report')} />
          </View>
        </Hero>

        <View style={s.body}>
          <ErrorLine message={ov.error} />
          {ov.loading && !d ? <Surface><Spinner /></Surface> : null}
          {d && (
            <>
              <FadeIn index={1}>
                <PressScale onPress={() => router.push('/(personal)/card')} style={s.cardRow} accessibilityRole="button" accessibilityLabel="Ma carte Visa">
                  <View style={s.miniCard}>
                    <View style={s.miniGlow} />
                    <View style={s.miniChip} />
                    <Text style={s.miniVisa}>VISA</Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={s.cardTitle}>Ma carte Visa AlphaPay</Text>
                    <Text style={s.cardSub}>•••• {demoLast4(user?.id ?? 'alphapay')} · carte virtuelle</Text>
                  </View>
                  <Icon name="chevron-right" size={20} color={B.muted} />
                </PressScale>
              </FadeIn>
              <Surface index={2}>
                <SectionHead title="Mes comptes" onPress={() => router.push('/(personal)/more')} action="Gérer" />
                {d.accounts.length === 0 && <EmptyLine icon="account-balance" title="Aucun compte suivi" body="Ajoutez votre MoMo, votre banque ou vos espèces pour tout voir au même endroit." />}
                {d.accounts.map((a) => (
                  <View key={a.id} style={s.row}>
                    <AccountTile kind={a.kind} />
                    <Text style={s.rowLabel} numberOfLines={1}>{a.label}</Text>
                    <Amount value={a.balance} currency="FCFA" size={16} />
                  </View>
                ))}
              </Surface>

              <Surface index={3}>
                <SectionHead title="Enveloppes du mois" onPress={() => router.push('/(personal)/budget')} />
                {d.envelopes.slice(0, 4).map((e) => (
                  <View key={e.id} style={s.env}>
                    <CategoryTile category={e.key ?? 'other'} size={36} />
                    <View style={{ flex: 1, gap: 6 }}>
                      <View style={s.envHead}>
                        <Text style={s.envName} numberOfLines={1}>{e.name}</Text>
                        <Text style={[s.envLeft, e.remaining < 0 && { color: B.burgundy }]}>{hidden ? '••••' : e.remaining < 0 ? `-${fcfa(-e.remaining)}` : `${fcfa(e.remaining)} restants`}</Text>
                      </View>
                      <Gauge progress={e.progress} color={envelopeColor(e)} />
                    </View>
                  </View>
                ))}
              </Surface>

              {d.goals[0] && (
                <FadeIn index={3}>
                  <PressScale onPress={() => router.push('/(personal)/savings')} style={s.goal} accessibilityRole="button">
                    <Text style={s.goalEmoji}>{d.goals[0].emoji}</Text>
                    <View style={{ flex: 1, gap: 6 }}>
                      <Text style={s.goalName}>{d.goals[0].name}</Text>
                      <Gauge progress={d.goals[0].progress} color={B.mustard} />
                      <Text style={s.goalSub}>{hidden ? '••••' : `${fcfa(d.goals[0].saved)} sur ${fcfa(d.goals[0].target)}`} · {d.goals[0].progress} %</Text>
                    </View>
                  </PressScale>
                </FadeIn>
              )}
              <PrimaryButton label="Ajouter une dépense ou une entrée" icon="plus" variant="outline" onPress={() => router.push('/(personal)/entry')} />
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: B.bg },
  round: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: B.burgundy, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { fontFamily: F.bold, fontSize: 9, color: B.white },
  handle: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: 'rgba(212,160,23,0.15)', borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 14 },
  handleText: { fontFamily: F.semibold, fontSize: 13, color: B.mustard },
  heroLabel: { fontFamily: F.medium, fontSize: 14, color: B.onNavyMuted, marginBottom: 2 },
  stats: { flexDirection: 'row', gap: 8, marginTop: 16 },
  qaRow: { flexDirection: 'row', gap: 8, marginTop: 20 },
  qa: { alignItems: 'center', gap: 8, minHeight: 72 },
  qaIcon: { width: 52, height: 52, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  qaLabel: { fontFamily: F.medium, fontSize: 12, color: B.white },
  body: { paddingHorizontal: 16, paddingTop: 18, gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  rowLabel: { flex: 1, fontFamily: F.medium, fontSize: 15, color: B.ink },
  env: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  envHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  envName: { flex: 1, fontFamily: F.medium, fontSize: 14, color: B.ink },
  envLeft: { fontFamily: F.semibold, fontSize: 12, color: B.muted },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: B.surface, borderRadius: R.lg, padding: 14, ...shadow(1) },
  miniCard: { width: 72, height: 46, borderRadius: 7, backgroundColor: B.navy, overflow: 'hidden', padding: 6, justifyContent: 'space-between' },
  miniGlow: { position: 'absolute', width: 60, height: 60, borderRadius: 30, backgroundColor: B.burgundy, opacity: 0.7, right: -22, bottom: -30 },
  miniChip: { width: 14, height: 10, borderRadius: 2, backgroundColor: B.mustard },
  miniVisa: { fontFamily: F.bold, fontStyle: 'italic', fontSize: 11, color: B.white, alignSelf: 'flex-end' },
  cardTitle: { fontFamily: F.semibold, fontSize: 15, color: B.ink },
  cardSub: { fontFamily: F.regular, fontSize: 13, color: B.muted },
  goal: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: B.navy, borderRadius: R.lg, padding: 16 },
  goalEmoji: { fontSize: 34 },
  goalName: { fontFamily: F.semibold, fontSize: 16, color: B.white },
  goalSub: { fontFamily: F.regular, fontSize: 12, color: B.onNavyMuted },
});
