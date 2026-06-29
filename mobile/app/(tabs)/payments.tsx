import { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import { Screen, Card } from '@/ui';
import { createPaylink } from '@/api';
import { C } from '@/theme';

interface Result {
  url: string;
  code: string;
  ussd: string;
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: 11, fontWeight: '600', color: C.muted, marginBottom: 4 }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ flex: 1, backgroundColor: C.surfaceAlt, borderRadius: 8, padding: 10, fontSize: 13, color: C.text }} numberOfLines={1}>{value}</Text>
        <Pressable
          onPress={async () => { await Clipboard.setStringAsync(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          style={{ borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9 }}
        >
          <Text style={{ color: copied ? C.primary : C.muted, fontWeight: '700', fontSize: 12 }}>{copied ? 'Copié ✓' : 'Copier'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const input = {
  backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10,
  paddingHorizontal: 12, height: 46, fontSize: 15, color: C.text,
} as const;

export default function Payments() {
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('XAF');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const generate = async () => {
    setBusy(true); setError(null); setResult(null);
    try {
      const r = await createPaylink({ amount: Number(amount), currency, description, expiresInMinutes: 60 });
      setResult(r as Result);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Échec de la génération');
    } finally { setBusy(false); }
  };

  return (
    <Screen title="Paiements">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Card style={{ marginBottom: 16 }}>
          <Text style={{ fontWeight: '700', fontSize: 15, marginBottom: 14, color: C.text }}>Nouveau paiement</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
            <TextInput style={[input, { flex: 2 }]} value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="Montant" placeholderTextColor={C.muted} />
            <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}>
              {(['XAF', 'USD', 'EUR'] as const).map((c) => (
                <Pressable key={c} onPress={() => setCurrency(c)} style={{ flex: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: currency === c ? C.primary : C.surfaceAlt }}>
                  <Text style={{ color: currency === c ? '#fff' : C.muted, fontWeight: '700', fontSize: 12 }}>{c}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <TextInput style={[input, { marginBottom: 14 }]} value={description} onChangeText={setDescription} placeholder="Description" placeholderTextColor={C.muted} />
          <Pressable onPress={generate} disabled={busy || !amount || !description} style={{ backgroundColor: busy || !amount || !description ? '#9ad9c0' : C.primary, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Générer les supports</Text>}
          </Pressable>
          {error && <Text style={{ color: C.error, fontSize: 13, marginTop: 12 }}>⚠️ {error}</Text>}
        </Card>

        {result && (
          <Card>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View style={{ backgroundColor: '#fff', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.border }}>
                <QRCode value={result.url} size={150} color="#0F6E56" />
              </View>
            </View>
            <CopyRow label="📱 Lien de paiement (sans compte)" value={result.url} />
            <CopyRow label="📞 Code USSD (téléphone à touches)" value={result.ussd} />
            <CopyRow label="# Code à composer seul" value={result.code} />
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}
