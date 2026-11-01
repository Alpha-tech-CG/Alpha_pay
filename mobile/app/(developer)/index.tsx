// Espace développeur : clés API (création d'une clé de test, secret montré une seule fois),
// webhooks, journal des requêtes, documentation. La création de webhooks et la gestion
// fine restent sur le tableau de bord web.
import { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { Icon } from '@/components/Icon';
import { B, F, R } from '@/brand';
import { Divider, EmptyLine, ErrorLine, Hero, LineField, MenuRow, Pill, PrimaryButton, SectionHead, Spinner, Surface, Tag, useStatusBar } from '@/bank';
import { FadeIn, Pop, PressScale } from '@/motion';
import { API_URL, DASHBOARD_URL, developer, errorCode, errorMessage, type CreatedApiKey, type Mode } from '@/api';
import { ago } from '@/format';
import { useSession } from '@/session';
import { SpaceSwitcher } from '@/SpaceSwitcher';
import { useLoad } from '@/useLoad';

const locked = (e: unknown) => errorCode(e) === 'module_non_inclus';

export default function Developer() {
  useStatusBar('light');
  const { user, logout } = useSession();
  const m = user?.merchants?.find((x) => x.developer);
  const merchantId = m?.id ?? '';
  const [mode, setMode] = useState<Mode>('test');
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const keys = useLoad(() => developer.keys(merchantId), [merchantId]);
  const extra = useLoad(async () => {
    try {
      const [webhooks, logs] = await Promise.all([developer.webhooks(merchantId, mode), developer.logs(merchantId, mode)]);
      return { webhooks, logs, locked: false };
    } catch (e) {
      if (locked(e)) return { webhooks: [], logs: [], locked: true };
      throw e;
    }
  }, [merchantId, mode]);

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      setCreated(await developer.createKey(merchantId, name.trim() || 'Clé mobile'));
      setName('');
      keys.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setCreating(false);
    }
  };
  const secret = created?.secret ?? created?.key;

  const refresh = () => {
    keys.reload();
    extra.reload();
  };

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={keys.refreshing || extra.refreshing} onRefresh={refresh} tintColor={B.mustard} colors={[B.navy]} />}>
        <Hero title="Développeur" subtitle={m?.name}>
          <FadeIn style={s.modes}>
            {(['test', 'live'] as const).map((md) => <Pill key={md} label={md === 'test' ? 'Test' : 'Live'} active={mode === md} onPress={() => setMode(md)} />)}
          </FadeIn>
          <FadeIn index={1}>
            <View style={s.code}>
              <Text style={s.codeLine}><Text style={{ color: B.mustard }}>POST</Text> {API_URL.replace(/^https?:\/\//, '')}/v1/payments</Text>
              <Text style={s.codeDim}>Authorization: Bearer sk_{mode}_…  ·  Idempotency-Key</Text>
            </View>
          </FadeIn>
        </Hero>

        <View style={s.body}>
          <SpaceSwitcher index={0} />
          <ErrorLine message={keys.error ?? error} />

          <Surface index={1}>
            <SectionHead title="Clés API" />
            {keys.loading && !keys.data ? <Spinner rows={2} /> : null}
            {keys.data?.data.length === 0 && <EmptyLine icon="vpn-key" title="Aucune clé" body="Créez une clé de test pour essayer l’API sans argent réel." />}
            {keys.data?.data.map((k, i, all) => (
              <View key={k.id}>
                <View style={s.row}>
                  <View style={[s.keyIcon, k.mode === 'live' && { backgroundColor: B.burgundySoft }]}><Icon name="vpn-key" size={18} color={k.mode === 'live' ? B.burgundy : B.navy} /></View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={s.rowTitle}>{k.name}</Text>
                    <Text style={s.mono}>{k.prefix}…</Text>
                    <Text style={s.rowSub}>{k.lastUsedAt ? `Utilisée ${ago(k.lastUsedAt)}` : 'Jamais utilisée'}</Text>
                  </View>
                  <Tag label={k.revoked ? 'Révoquée' : k.mode} tone={k.revoked ? 'muted' : k.mode === 'live' ? 'bad' : 'ok'} />
                </View>
                {i < all.length - 1 && <Divider style={{ marginLeft: 52 }} />}
              </View>
            ))}
            {created && secret ? (
              <Pop>
                <View style={s.secret}>
                  <Text style={s.secretTitle}>Nouvelle clé : copiez-la maintenant</Text>
                  <Text style={s.secretText}>Elle ne sera plus jamais affichée.</Text>
                  <Text style={s.secretValue} selectable>{secret}</Text>
                  <PrimaryButton label={copied ? 'Clé copiée' : 'Copier la clé'} icon={copied ? 'check' : 'content-copy'} variant="navy" onPress={() => Clipboard.setStringAsync(secret).then(() => setCopied(true))} />
                  <Text style={s.close} onPress={() => { setCreated(null); setCopied(false); }}>J’ai copié la clé</Text>
                </View>
              </Pop>
            ) : (
              <View style={{ gap: 10, marginTop: 12 }}>
                <LineField label="Nom de la nouvelle clé de test" value={name} onChangeText={setName} placeholder="Boutique en ligne (test)" maxLength={60} />
                <PrimaryButton label="Créer une clé de test" icon="plus" busy={creating} onPress={create} />
              </View>
            )}
          </Surface>

          <Surface index={2}>
            <SectionHead title="Webhooks" />
            {extra.data?.locked && <EmptyLine icon="lock" title="Module Développeurs non inclus" body="Webhooks et journal des requêtes sont inclus dans le palier Développeurs (Facturation, sur le web)." />}
            {extra.loading && !extra.data ? <Spinner rows={2} /> : null}
            {extra.data && !extra.data.locked && extra.data.webhooks.length === 0 && <EmptyLine icon="public" title="Aucun webhook" body="Ajoutez l’adresse de votre serveur depuis le tableau de bord web." />}
            {extra.data?.webhooks.map((w) => (
              <View key={w.id} style={s.row}>
                <View style={s.keyIcon}><Icon name="public" size={18} color={B.navy} /></View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.mono} numberOfLines={1}>{w.url}</Text>
                  <Text style={s.rowSub}>{w.events.length} événement(s)</Text>
                </View>
                <Tag label={w.status.toLowerCase()} tone={w.status === 'ACTIVE' ? 'ok' : 'muted'} />
              </View>
            ))}
          </Surface>

          {!extra.data?.locked && (
            <Surface index={3}>
              <SectionHead title="Journal des requêtes" />
              <ErrorLine message={extra.error} />
              {extra.data && extra.data.logs.length === 0 && <EmptyLine icon="history" title="Aucune requête" body="Les appels faits avec vos clés apparaîtront ici." />}
              {extra.data?.logs.map((l, i, all) => (
                <View key={l.id}>
                  <View style={s.logRow}>
                    <Text style={[s.status, { color: l.status >= 400 ? B.burgundy : B.success }]}>{l.status}</Text>
                    <Text style={s.method}>{l.method}</Text>
                    <Text style={s.path} numberOfLines={1}>{l.path}</Text>
                    <Text style={s.ms}>{l.duration_ms} ms</Text>
                  </View>
                  {i < all.length - 1 && <Divider />}
                </View>
              ))}
            </Surface>
          )}

          <Surface index={4} style={{ paddingVertical: 4 }}>
            <MenuRow icon="code" label="Documentation de l’API" sub="Référence, exemples, codes d’erreur" onPress={() => Linking.openURL(`${API_URL}/docs`)} />
            <MenuRow icon="public" label="Tableau de bord web" sub="Webhooks, révocation et rotation des clés" onPress={() => Linking.openURL(DASHBOARD_URL)} />
            <MenuRow icon="log-out" tone="burgundy" label="Se déconnecter" onPress={() => Alert.alert('Se déconnecter ?', '', [{ text: 'Annuler', style: 'cancel' }, { text: 'Se déconnecter', style: 'destructive', onPress: logout }])} last />
          </Surface>
          <PressScale onPress={refresh} style={{ alignSelf: 'center' }} accessibilityRole="button"><Text style={s.refresh}>Actualiser</Text></PressScale>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: B.bg },
  modes: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  code: { backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: R.md, padding: 14, gap: 6 },
  codeLine: { fontFamily: F.mono, fontSize: 12, color: B.white },
  codeDim: { fontFamily: F.mono, fontSize: 11, color: B.onNavyMuted },
  body: { paddingHorizontal: 16, paddingTop: 18, gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  keyIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: B.navySoft, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontFamily: F.medium, fontSize: 15, color: B.ink },
  rowSub: { fontFamily: F.regular, fontSize: 12, color: B.muted },
  mono: { fontFamily: F.mono, fontSize: 12, color: B.inkSoft },
  secret: { marginTop: 12, gap: 8, backgroundColor: B.mustardSoft, borderRadius: R.md, padding: 14 },
  secretTitle: { fontFamily: F.bold, fontSize: 15, color: B.navy },
  secretText: { fontFamily: F.regular, fontSize: 13, color: B.inkSoft },
  secretValue: { fontFamily: F.mono, fontSize: 12, color: B.ink, backgroundColor: B.white, borderRadius: R.sm, padding: 10 },
  close: { fontFamily: F.semibold, fontSize: 14, color: B.navy3, textAlign: 'center', paddingVertical: 6 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  status: { fontFamily: F.bold, fontSize: 13, width: 34 },
  method: { fontFamily: F.semibold, fontSize: 12, color: B.navy3, width: 44 },
  path: { flex: 1, fontFamily: F.mono, fontSize: 12, color: B.inkSoft },
  ms: { fontFamily: F.regular, fontSize: 11, color: B.muted },
  refresh: { fontFamily: F.semibold, fontSize: 14, color: B.navy3, padding: 10 },
});
