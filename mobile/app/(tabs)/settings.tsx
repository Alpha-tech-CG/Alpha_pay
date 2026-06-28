import { View, Text, Pressable, ScrollView } from 'react-native';
import Constants from 'expo-constants';
import { Screen, Card } from '@/ui';
import { useAuth } from '@/auth';
import { C } from '@/theme';

export default function Settings() {
  const { apiKey, signOut } = useAuth();
  const masked = apiKey ? `${apiKey.slice(0, 12)}…` : '—';
  const apiBaseUrl = (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl;

  return (
    <Screen title="Réglages">
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Card style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: C.muted, marginBottom: 8 }}>SESSION</Text>
          <Row label="Clé API" value={masked} />
          <Row label="Serveur" value={apiBaseUrl ?? '—'} />
          <Row label="Version" value={Constants.expoConfig?.version ?? '1.0.0'} last />
        </Card>

        <Pressable onPress={signOut} style={{ backgroundColor: C.errorBg, height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: C.error, fontWeight: '700', fontSize: 15 }}>Se déconnecter</Text>
        </Pressable>
        <Text style={{ fontSize: 11, color: C.muted, textAlign: 'center', marginTop: 14 }}>
          La clé est effacée du stockage chiffré à la déconnexion.
        </Text>
      </ScrollView>
    </Screen>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 11, borderBottomWidth: last ? 0 : 1, borderBottomColor: C.border }}>
      <Text style={{ fontSize: 14, color: C.muted }}>{label}</Text>
      <Text style={{ fontSize: 14, color: C.text, fontWeight: '600' }}>{value}</Text>
    </View>
  );
}
