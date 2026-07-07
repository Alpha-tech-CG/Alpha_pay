import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { useAuth } from '@/auth';
import { C } from '@/theme';

function parseCents(raw: string): number {
  const n = parseFloat(raw.replace(/\s/g, '').replace(',', '.'));
  return isNaN(n) || n <= 0 ? 0 : Math.round(n * 100);
}

function fmt(cents: number) {
  return `${(cents / 100).toLocaleString('fr-CG', { minimumFractionDigits: 0 })} XAF`;
}

export default function CashierEncaisser() {
  const { phone, signOut } = useAuth();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [qrPayload, setQrPayload] = useState<string | null>(null);

  const amountCents = parseCents(amount);
  const canGenerate = amountCents > 0;

  const generate = () => {
    if (!canGenerate) return;
    // Le payload reprend le format attendu par le scanner client (parseQr).
    // Note : merchantId est provisoirement le numéro de téléphone du caissier.
    // En production, lier le caissier à un Merchant via un champ merchantId sur Wallet.
    const payload = JSON.stringify({
      merchantId: phone ?? 'cashier',
      amountCents,
      ...(description.trim() ? { description: description.trim() } : {}),
    });
    setQrPayload(payload);
  };

  const reset = () => {
    setQrPayload(null);
    setAmount('');
    setDescription('');
  };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Header */}
          <View style={s.header}>
            <View>
              <Text style={s.title}>Encaisser</Text>
              <View style={s.badge}>
                <MaterialIcons name="store" size={12} color={C.secondary} />
                <Text style={s.badgeText}>Compte caissier</Text>
              </View>
            </View>
            <Pressable onPress={signOut} style={s.avatarBtn}>
              <MaterialIcons name="logout" size={20} color={C.muted} />
            </Pressable>
          </View>

          {!qrPayload ? (
            /* ── Form ── */
            <View style={s.card}>
              <Text style={s.cardTitle}>Nouveau encaissement</Text>

              <Text style={s.fieldLabel}>Montant (XAF) *</Text>
              <TextInput
                style={s.input}
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                placeholder="Ex : 5 000"
                placeholderTextColor={C.muted}
              />

              <Text style={s.fieldLabel}>Description (optionnel)</Text>
              <TextInput
                style={s.input}
                value={description}
                onChangeText={setDescription}
                placeholder="Ex : Achat tissu"
                placeholderTextColor={C.muted}
                maxLength={100}
              />

              <View style={s.infoBox}>
                <MaterialIcons name="info-outline" size={14} color={C.primary} />
                <Text style={s.infoText}>
                  Un QR code sera généré. Faites-le scanner par votre client avec l'app PayBrain.
                </Text>
              </View>

              <Pressable
                onPress={generate}
                disabled={!canGenerate}
                style={[s.btn, !canGenerate && s.btnDisabled]}
              >
                <MaterialIcons name="qr-code" size={20} color="#fff" />
                <Text style={s.btnText}>Générer le QR</Text>
              </Pressable>
            </View>
          ) : (
            /* ── QR display ── */
            <View style={s.card}>
              <Text style={s.cardTitle}>QR code à scanner</Text>
              <Text style={s.amountDisplay}>{fmt(amountCents)}</Text>
              {description.trim() ? (
                <Text style={s.descDisplay}>{description}</Text>
              ) : null}

              <View style={s.qrBox}>
                <QRCode value={qrPayload} size={200} color={C.primary} />
              </View>

              <Text style={s.qrHint}>
                Montrez ce QR à votre client — il le scanne depuis l'app PayBrain
              </Text>

              <Pressable onPress={reset} style={[s.btn, { backgroundColor: C.secondary, marginTop: 8 }]}>
                <MaterialIcons name="refresh" size={20} color="#fff" />
                <Text style={s.btnText}>Nouvel encaissement</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: 20, paddingBottom: 48 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 26, fontWeight: '800', color: C.text, letterSpacing: -0.5 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  badgeText: { fontSize: 12, fontWeight: '600', color: C.secondary },
  avatarBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surfaceContainerLow, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: C.border },

  card: { backgroundColor: C.surface, borderRadius: 20, padding: 20, shadowColor: '#0035c5', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 20 },

  fieldLabel: { fontSize: 11, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 7 },
  input: { backgroundColor: C.bg, borderWidth: 1.5, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, height: 50, fontSize: 15, color: C.text, marginBottom: 16 },

  infoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: C.surfaceContainerLow, borderRadius: 12, padding: 12, marginBottom: 20 },
  infoText: { fontSize: 13, color: C.primary, flex: 1, lineHeight: 18 },

  btn: { backgroundColor: C.primary, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, shadowColor: C.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.28, shadowRadius: 8, elevation: 4 },
  btnDisabled: { backgroundColor: C.surfaceContainerHigh, shadowOpacity: 0, elevation: 0 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  amountDisplay: { fontSize: 36, fontWeight: '900', color: C.primary, textAlign: 'center', letterSpacing: -1, marginBottom: 4 },
  descDisplay: { fontSize: 14, color: C.muted, textAlign: 'center', marginBottom: 16 },
  qrBox: { backgroundColor: '#fff', padding: 20, borderRadius: 20, borderWidth: 1.5, borderColor: C.border, alignSelf: 'center', marginVertical: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  qrHint: { fontSize: 13, color: C.muted, textAlign: 'center', lineHeight: 20, marginBottom: 8 },
});
