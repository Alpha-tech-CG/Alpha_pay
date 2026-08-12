import { useState, useMemo } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import { Icon } from '@/components/Icon';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createPaylink } from '@/api';
import { useTheme, type Palette } from '@/theme';

interface Result { url: string; code: string; ussd: string; qrPayload: string }

function CopyRow({ label, value }: { label: string; value: string }) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await Clipboard.setStringAsync(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.copyLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={s.copyValue} numberOfLines={1}>{value}</Text>
        <Pressable onPress={copy} style={[s.copyBtn, copied && { backgroundColor: C.secondaryContainer, borderColor: C.secondaryContainer }]}>
          <Icon name={copied ? 'check' : 'content-copy'} size={16} color={copied ? C.onSecondaryContainer : C.muted} />
        </Pressable>
      </View>
    </View>
  );
}

export default function Payments() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
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

  const canGenerate = !busy && !!amount && !!description;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <View style={s.topBar}>
        <Text style={s.pageTitle}>Paiements</Text>
        <Text style={s.pageSubtitle}>Créez un lien ou QR code pour encaisser</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {/* Form card */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Nouveau paiement</Text>

          {/* Amount + currency */}
          <Text style={s.fieldLabel}>Montant</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
            <TextInput
              style={[s.input, { flex: 2 }]}
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              placeholder="Ex: 5 000"
              placeholderTextColor={C.muted}
            />
            <View style={{ flex: 1, flexDirection: 'row', gap: 4 }}>
              {(['XAF', 'USD', 'EUR'] as const).map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setCurrency(c)}
                  style={[s.currencyBtn, currency === c && s.currencyBtnActive]}
                >
                  <Text style={[s.currencyText, currency === c && s.currencyTextActive]}>{c}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Description */}
          <Text style={s.fieldLabel}>Description</Text>
          <TextInput
            style={[s.input, { marginBottom: 20 }]}
            value={description}
            onChangeText={setDescription}
            placeholder="Ex: Achat tissu"
            placeholderTextColor={C.muted}
          />

          {/* Submit */}
          <Pressable
            onPress={generate}
            disabled={!canGenerate}
            style={[s.generateBtn, !canGenerate && s.generateBtnDisabled]}
          >
            {busy
              ? <ActivityIndicator color="#fff" />
              : <>
                  <Icon name="qr-code" size={20} color="#fff" />
                  <Text style={s.generateBtnText}>Générer les supports</Text>
                </>
            }
          </Pressable>

          {error && (
            <View style={s.errorBanner}>
              <Icon name="error-outline" size={16} color={C.error} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}
        </View>

        {/* Result */}
        {result && (
          <View style={[s.card, { marginTop: 16 }]}>
            <Text style={s.cardTitle}>Supports de paiement</Text>

            {/* QR code */}
            <View style={s.qrWrap}>
              <View style={s.qrBox}>
                <QRCode value={result.qrPayload} size={160} color={C.primary} />
              </View>
              <Text style={s.qrHint}>Faites scanner ce QR code avec l'app AlphaPay</Text>
            </View>

            <View style={{ height: 1, backgroundColor: C.border, marginVertical: 16 }} />

            <CopyRow label="Lien de paiement" value={result.url} />
            <CopyRow label="Code USSD" value={result.ussd} />
            <CopyRow label="Code seul" value={result.code} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  topBar: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  pageTitle: { fontSize: 26, fontWeight: '700', color: C.text, letterSpacing: -0.5 },
  pageSubtitle: { fontSize: 14, color: C.muted, marginTop: 2 },

  card: { backgroundColor: C.surface, borderRadius: 20, padding: 20, shadowColor: '#0035c5', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 18 },

  fieldLabel: { fontSize: 12, fontWeight: '600', color: C.muted, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 },
  input: { backgroundColor: C.bg, borderWidth: 1.5, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, height: 50, fontSize: 15, color: C.text },

  currencyBtn: { flex: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surfaceContainerLow, height: 50 },
  currencyBtnActive: { backgroundColor: C.primary },
  currencyText: { fontSize: 11, fontWeight: '700', color: C.muted },
  currencyTextActive: { color: '#fff' },

  generateBtn: { backgroundColor: C.primary, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, shadowColor: C.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  generateBtnDisabled: { backgroundColor: C.surfaceContainerHigh, shadowOpacity: 0 },
  generateBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.errorContainer, borderRadius: 10, padding: 12, marginTop: 12 },
  errorText: { color: C.error, fontSize: 13, flex: 1 },

  qrWrap: { alignItems: 'center', paddingVertical: 8 },
  qrBox: { backgroundColor: '#fff', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: C.border, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  qrHint: { marginTop: 12, fontSize: 13, color: C.muted, textAlign: 'center' },

  copyLabel: { fontSize: 11, fontWeight: '600', color: C.muted, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 },
  copyValue: { flex: 1, backgroundColor: C.bg, borderRadius: 10, padding: 12, fontSize: 13, color: C.text, borderWidth: 1, borderColor: C.border },
  copyBtn: { width: 44, height: 44, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface },
});
