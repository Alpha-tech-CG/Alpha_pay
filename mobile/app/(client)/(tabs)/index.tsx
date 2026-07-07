import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  ActivityIndicator, RefreshControl, Modal, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/auth';
import { getWalletBalance, walletCashIn, walletCashOut, walletP2P, WalletBalance } from '@/api';
import { C } from '@/theme';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];
type ModalKind = 'cash-in' | 'p2p' | 'cash-out';
type ModalPhase = 'form' | 'busy' | 'success' | 'error';
type Operator = 'MTN' | 'AIRTEL';

/* ─── helpers ─── */

function fmt(cents: number, currency = 'XAF') {
  return `${(cents / 100).toLocaleString('fr-CG', { minimumFractionDigits: 0 })} ${currency}`;
}

function parseCents(raw: string): number {
  const n = parseFloat(raw.replace(/\s/g, '').replace(',', '.'));
  return isNaN(n) || n <= 0 ? 0 : Math.round(n * 100);
}

/* ─── sub-components ─── */

function ActionBtn({ icon, label, onPress, color }: {
  icon: IconName; label: string; onPress: () => void; color?: string;
}) {
  return (
    <Pressable onPress={onPress} style={s.actionBtn}>
      <View style={[s.actionIcon, { backgroundColor: color ?? C.primary }]}>
        <MaterialIcons name={icon} size={22} color="#fff" />
      </View>
      <Text style={s.actionLabel}>{label}</Text>
    </Pressable>
  );
}

function Field({
  label, ...props
}: React.ComponentProps<typeof TextInput> & { label: string }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput placeholderTextColor={C.muted} style={s.input} {...props} />
    </View>
  );
}

function OperatorPicker({ value, onChange }: { value: Operator; onChange: (v: Operator) => void }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.fieldLabel}>Opérateur</Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {(['MTN', 'AIRTEL'] as Operator[]).map((op) => (
          <Pressable
            key={op}
            onPress={() => onChange(op)}
            style={[s.opBtn, value === op && s.opBtnActive]}
          >
            <Text style={[s.opBtnText, value === op && s.opBtnTextActive]}>{op}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/* ─── modal config ─── */

const MODAL_CONFIG: Record<ModalKind, { title: string; icon: IconName; color: string; successLabel: string }> = {
  'cash-in':  { title: 'Recharger le wallet',  icon: 'add-circle',        color: C.primary,   successLabel: 'Rechargement en cours' },
  'p2p':      { title: 'Envoyer de l\'argent',  icon: 'send',              color: C.secondary, successLabel: 'Virement effectué' },
  'cash-out': { title: 'Retirer vers Mobile Money', icon: 'arrow-circle-down', color: '#7c3aed', successLabel: 'Retrait en cours' },
};

/* ─── main screen ─── */

export default function ClientHome() {
  const { phone, signOut } = useAuth();

  // Balance
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  // Modal state
  const [modalKind, setModalKind]   = useState<ModalKind | null>(null);
  const [phase, setPhase]           = useState<ModalPhase>('form');
  const [modalError, setModalError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');

  // Shared form fields
  const [amount, setAmount]         = useState('');
  const [operator, setOperator]     = useState<Operator>('MTN');
  const [opPhone, setOpPhone]       = useState('');   // phone for cash-in/cash-out
  const [toPhone, setToPhone]       = useState('');   // recipient for p2p
  const [description, setDescription] = useState('');

  /* ── balance loading ── */
  const load = useCallback(async () => {
    try {
      const data = await getWalletBalance();
      setBalance(data);
      setBalanceError(null);
    } catch {
      setBalanceError('Impossible de charger le solde');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  /* ── modal open/close ── */
  const openModal = (kind: ModalKind) => {
    setModalKind(kind);
    setPhase('form');
    setModalError(null);
    setSuccessMsg('');
    setAmount('');
    setOperator('MTN');
    setOpPhone(phone ?? '');
    setToPhone('');
    setDescription('');
  };

  const closeModal = () => {
    setModalKind(null);
    // Refresh balance after a successful op
    if (phase === 'success') load();
  };

  /* ── submit handlers ── */
  const handleSubmit = async () => {
    const cents = parseCents(amount);
    if (cents <= 0) { setModalError('Montant invalide'); return; }

    setPhase('busy'); setModalError(null);

    try {
      if (modalKind === 'cash-in') {
        if (!opPhone.trim()) { setPhase('form'); setModalError('Numéro obligatoire'); return; }
        await walletCashIn(cents, operator, opPhone.trim());
        setSuccessMsg(`Rechargement de ${fmt(cents)} en cours via ${operator}. Vous recevrez une confirmation par SMS.`);
      } else if (modalKind === 'p2p') {
        if (!toPhone.trim()) { setPhase('form'); setModalError('Numéro du destinataire obligatoire'); return; }
        await walletP2P(toPhone.trim(), cents, description.trim() || undefined);
        setSuccessMsg(`${fmt(cents)} envoyés au ${toPhone.trim()}.`);
      } else if (modalKind === 'cash-out') {
        if (!opPhone.trim()) { setPhase('form'); setModalError('Numéro obligatoire'); return; }
        await walletCashOut(cents, operator, opPhone.trim());
        setSuccessMsg(`Retrait de ${fmt(cents)} vers ${operator} en cours. Vous recevrez votre argent sous quelques minutes.`);
      }
      setPhase('success');
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Une erreur est survenue, réessayez.';
      setModalError(msg);
      setPhase('error');
    }
  };

  /* ── loading splash ── */
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: C.bg }}>
        <ActivityIndicator color={C.primary} />
      </View>
    );
  }

  const cfg = modalKind ? MODAL_CONFIG[modalKind] : null;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
      >
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.greeting}>Bonjour 👋</Text>
            <Text style={s.phone}>{balance?.fullName ?? phone}</Text>
          </View>
          <Pressable onPress={signOut} style={s.avatarBtn}>
            <MaterialIcons name="person" size={22} color={C.primary} />
          </Pressable>
        </View>

        {/* Balance card */}
        <View style={s.balanceCard}>
          <Text style={s.balanceLabel}>Solde disponible</Text>
          {balanceError ? (
            <Text style={{ color: '#fff', opacity: 0.7, marginTop: 4 }}>{balanceError}</Text>
          ) : (
            <Text style={s.balanceAmount}>
              {fmt(balance?.balanceCents ?? 0, balance?.currency)}
            </Text>
          )}
          <Text style={s.balanceCurrency}>Portefeuille PayBrain</Text>
        </View>

        {/* Quick actions */}
        <Text style={s.sectionTitle}>Actions rapides</Text>
        <View style={s.actions}>
          <ActionBtn icon="add-circle"        label="Recharger" onPress={() => openModal('cash-in')}  color={C.primary} />
          <ActionBtn icon="send"              label="Envoyer"   onPress={() => openModal('p2p')}       color={C.secondary} />
          <ActionBtn icon="arrow-circle-down" label="Retirer"   onPress={() => openModal('cash-out')} color="#7c3aed" />
          <ActionBtn icon="qr-code-scanner"   label="Scanner"   onPress={() => router.push('/(client)/(tabs)/scan')} color="#0891b2" />
        </View>

        {/* Promo / info */}
        <View style={s.infoCard}>
          <MaterialIcons name="security" size={20} color={C.secondary} />
          <Text style={s.infoText}>
            Vos fonds sont sécurisés et garantis par PayBrain.
          </Text>
        </View>
      </ScrollView>

      {/* ══════════════════════════════════════
          ACTION MODAL (Cash-In / P2P / Cash-Out)
      ══════════════════════════════════════ */}
      <Modal
        visible={modalKind !== null}
        transparent
        animationType="slide"
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <View style={s.modalBackdrop}>
            {/* tap outside to close */}
            <Pressable style={StyleSheet.absoluteFill} onPress={phase === 'busy' ? undefined : closeModal} />

            <View style={s.modalSheet}>
              {/* handle */}
              <View style={s.handle} />

              {/* ── FORM phase ── */}
              {(phase === 'form' || phase === 'busy') && cfg && (
                <>
                  <View style={[s.modalIconBox, { backgroundColor: cfg.color + '18' }]}>
                    <MaterialIcons name={cfg.icon} size={28} color={cfg.color} />
                  </View>
                  <Text style={s.modalTitle}>{cfg.title}</Text>

                  {/* Cash-In form */}
                  {modalKind === 'cash-in' && (
                    <>
                      <OperatorPicker value={operator} onChange={setOperator} />
                      <Field
                        label="Votre numéro Mobile Money"
                        value={opPhone} onChangeText={setOpPhone}
                        placeholder="+242 065 000 000"
                        keyboardType="phone-pad"
                      />
                      <Field
                        label="Montant (XAF)"
                        value={amount} onChangeText={setAmount}
                        placeholder="Ex : 5 000"
                        keyboardType="numeric"
                      />
                      <View style={s.infoBox}>
                        <MaterialIcons name="info-outline" size={14} color={C.primary} />
                        <Text style={s.infoText}>
                          Vous recevrez une demande de paiement sur votre téléphone. Validez avec votre code Mobile Money.
                        </Text>
                      </View>
                    </>
                  )}

                  {/* P2P form */}
                  {modalKind === 'p2p' && (
                    <>
                      <Field
                        label="Numéro du destinataire"
                        value={toPhone} onChangeText={setToPhone}
                        placeholder="+242 065 000 000"
                        keyboardType="phone-pad"
                      />
                      <Field
                        label="Montant (XAF)"
                        value={amount} onChangeText={setAmount}
                        placeholder="Ex : 2 000"
                        keyboardType="numeric"
                      />
                      <Field
                        label="Motif (optionnel)"
                        value={description} onChangeText={setDescription}
                        placeholder="Ex : remboursement"
                        maxLength={100}
                      />
                    </>
                  )}

                  {/* Cash-Out form */}
                  {modalKind === 'cash-out' && (
                    <>
                      <OperatorPicker value={operator} onChange={setOperator} />
                      <Field
                        label="Votre numéro Mobile Money"
                        value={opPhone} onChangeText={setOpPhone}
                        placeholder="+242 065 000 000"
                        keyboardType="phone-pad"
                      />
                      <Field
                        label="Montant à retirer (XAF)"
                        value={amount} onChangeText={setAmount}
                        placeholder="Ex : 10 000"
                        keyboardType="numeric"
                      />
                      <View style={s.infoBox}>
                        <MaterialIcons name="info-outline" size={14} color="#7c3aed" />
                        <Text style={[s.infoText, { color: '#7c3aed' }]}>
                          Le montant sera débité immédiatement de votre wallet et transféré vers votre Mobile Money.
                        </Text>
                      </View>
                    </>
                  )}

                  {modalError && (
                    <View style={s.errorRow}>
                      <MaterialIcons name="error-outline" size={14} color={C.error} />
                      <Text style={s.errorText}>{modalError}</Text>
                    </View>
                  )}

                  <View style={s.modalActions}>
                    <Pressable
                      onPress={phase === 'busy' ? undefined : closeModal}
                      style={[s.modalBtn, s.modalBtnCancel]}
                      disabled={phase === 'busy'}
                    >
                      <Text style={s.modalBtnCancelText}>Annuler</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleSubmit}
                      disabled={phase === 'busy' || parseCents(amount) <= 0}
                      style={[
                        s.modalBtn, s.modalBtnConfirm,
                        { backgroundColor: cfg.color },
                        (phase === 'busy' || parseCents(amount) <= 0) && s.modalBtnDisabled,
                      ]}
                    >
                      {phase === 'busy'
                        ? <ActivityIndicator color="#fff" />
                        : <Text style={s.modalBtnConfirmText}>Confirmer</Text>}
                    </Pressable>
                  </View>
                </>
              )}

              {/* ── SUCCESS phase ── */}
              {phase === 'success' && cfg && (
                <>
                  <View style={[s.modalIconBox, { backgroundColor: C.successBg }]}>
                    <MaterialIcons name="check-circle" size={36} color={C.success} />
                  </View>
                  <Text style={s.modalTitle}>{cfg.successLabel}</Text>
                  <Text style={s.modalDesc}>{successMsg}</Text>
                  <Pressable onPress={closeModal} style={[s.modalBtn, s.modalBtnConfirm, { alignSelf: 'stretch', marginTop: 8, backgroundColor: cfg.color }]}>
                    <Text style={s.modalBtnConfirmText}>Fermer</Text>
                  </Pressable>
                </>
              )}

              {/* ── ERROR phase ── */}
              {phase === 'error' && cfg && (
                <>
                  <View style={[s.modalIconBox, { backgroundColor: C.errorContainer }]}>
                    <MaterialIcons name="error-outline" size={36} color={C.error} />
                  </View>
                  <Text style={s.modalTitle}>Opération échouée</Text>
                  <Text style={[s.modalDesc, { color: C.error }]}>{modalError}</Text>
                  <View style={s.modalActions}>
                    <Pressable onPress={closeModal} style={[s.modalBtn, s.modalBtnCancel]}>
                      <Text style={s.modalBtnCancelText}>Fermer</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => { setPhase('form'); setModalError(null); }}
                      style={[s.modalBtn, s.modalBtnConfirm, { backgroundColor: cfg.color }]}
                    >
                      <Text style={s.modalBtnConfirmText}>Réessayer</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: 20, paddingBottom: 48 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  greeting: { fontSize: 13, color: C.muted, fontWeight: '600' },
  phone: { fontSize: 17, fontWeight: '800', color: C.text, marginTop: 2 },
  avatarBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.surfaceContainerLow, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: C.border },

  balanceCard: {
    backgroundColor: C.primary,
    borderRadius: 22, padding: 24, marginBottom: 28,
    shadowColor: C.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  balanceLabel: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  balanceAmount: { fontSize: 38, fontWeight: '900', color: '#fff', marginTop: 8, letterSpacing: -1 },
  balanceCurrency: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 6 },

  sectionTitle: { fontSize: 14, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 28 },
  actionBtn: { alignItems: 'center', gap: 8, flex: 1 },
  actionIcon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 12, fontWeight: '600', color: C.text, textAlign: 'center' },

  infoCard: { backgroundColor: C.surfaceContainerLow, borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: C.border },
  infoText: { fontSize: 13, color: C.primary, flex: 1, lineHeight: 18 },

  // Modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 40, alignItems: 'center', gap: 10,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, marginBottom: 8 },
  modalIconBox: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: C.text, textAlign: 'center' },
  modalDesc: { fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 20 },

  fieldLabel: { fontSize: 11, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  input: { backgroundColor: C.bg, borderWidth: 1.5, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, height: 50, fontSize: 15, color: C.text, alignSelf: 'stretch' },

  opBtn: { flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surfaceContainerLow, borderWidth: 1.5, borderColor: C.border },
  opBtnActive: { backgroundColor: C.primary, borderColor: C.primary },
  opBtnText: { fontSize: 14, fontWeight: '700', color: C.muted },
  opBtnTextActive: { color: '#fff' },

  infoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: C.surfaceContainerLow, borderRadius: 12, padding: 12, alignSelf: 'stretch', marginBottom: 4 },

  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'stretch' },
  errorText: { color: C.error, fontSize: 13, flex: 1 },

  modalActions: { flexDirection: 'row', gap: 12, alignSelf: 'stretch', marginTop: 4 },
  modalBtn: { flex: 1, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  modalBtnCancel: { backgroundColor: C.surfaceContainerLow, borderWidth: 1.5, borderColor: C.border },
  modalBtnCancelText: { fontSize: 15, fontWeight: '700', color: C.text },
  modalBtnConfirm: { shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.28, shadowRadius: 8, elevation: 4 },
  modalBtnConfirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  modalBtnDisabled: { opacity: 0.45, shadowOpacity: 0, elevation: 0 },
});
