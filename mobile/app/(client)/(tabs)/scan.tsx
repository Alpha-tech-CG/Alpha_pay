import { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { C } from '@/theme';
import { genIdemKey, walletPay } from '@/api';

// CameraView from expo-camera — imported lazily so build doesn't fail if not installed
let CameraView: React.ComponentType<{
  style: object;
  facing: string;
  onBarcodeScanned?: (e: { data: string }) => void;
  barcodeScannerSettings?: object;
}> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  CameraView = require('expo-camera').CameraView;
} catch {}

interface QrPreview {
  raw: string;
  amountCents: number;
  description?: string;
  /** Clé d'idempotence figée au moment du scan — un retry renvoie la même transaction. */
  idemKey: string;
}

type ModalState =
  | { phase: 'idle' }
  | { phase: 'preview'; qr: QrPreview }
  | { phase: 'paying' }
  | { phase: 'success'; amountCents: number }
  | { phase: 'error'; message: string };

function formatXAF(cents: number) {
  return `${(cents / 100).toLocaleString('fr-CG')} XAF`;
}

function parseQr(data: string): QrPreview | null {
  try {
    const obj = JSON.parse(data) as Record<string, unknown>;
    if (typeof obj.merchantId !== 'string' || !obj.merchantId) return null;
    if (typeof obj.amountCents !== 'number' || obj.amountCents <= 0 || !Number.isInteger(obj.amountCents)) return null;
    // QR signé obligatoire (ALP-172) — un QR sans signature serait rejeté par l'API.
    if (typeof obj.sig !== 'string' || !obj.sig) return null;
    return {
      raw: data,
      amountCents: obj.amountCents,
      description: typeof obj.description === 'string' ? obj.description : undefined,
      idemKey: genIdemKey(),
    };
  } catch {
    return null;
  }
}

export default function ScanScreen() {
  const [modal, setModal] = useState<ModalState>({ phase: 'idle' });

  const dismiss = () => setModal({ phase: 'idle' });

  if (!CameraView) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <View style={s.center}>
          <MaterialIcons name="qr-code-scanner" size={56} color={C.muted} />
          <Text style={s.unavailableTitle}>Scanner non disponible</Text>
          <Text style={s.unavailableText}>
            Installez expo-camera pour activer cette fonctionnalité.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleBarcode = ({ data }: { data: string }) => {
    if (modal.phase !== 'idle') return;

    const qr = parseQr(data);
    if (!qr) {
      setModal({ phase: 'error', message: 'QR code non reconnu. Assurez-vous de scanner un QR PayBrain.' });
      return;
    }
    setModal({ phase: 'preview', qr });
  };

  const confirmPay = async () => {
    if (modal.phase !== 'preview') return;
    const { qr } = modal;
    setModal({ phase: 'paying' });
    try {
      await walletPay(qr.raw, qr.idemKey);
      setModal({ phase: 'success', amountCents: qr.amountCents });
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Paiement échoué, réessayez.';
      setModal({ phase: 'error', message: msg });
    }
  };

  const scanning = modal.phase === 'idle';

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <Text style={s.title}>Scanner QR</Text>
        <Text style={s.subtitle}>Pointez sur le QR code du marchand</Text>
      </View>

      <View style={s.scanArea}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          onBarcodeScanned={scanning ? handleBarcode : undefined}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        />
        {/* Viewfinder overlay */}
        <View style={s.overlay}>
          <View style={s.finder}>
            <View style={[s.corner, s.cornerTL]} />
            <View style={[s.corner, s.cornerTR]} />
            <View style={[s.corner, s.cornerBL]} />
            <View style={[s.corner, s.cornerBR]} />
            {!scanning && modal.phase === 'paying' && (
              <View style={s.busyOverlay}>
                <ActivityIndicator color="#fff" size="large" />
              </View>
            )}
          </View>
        </View>
      </View>

      <View style={s.footer}>
        <Text style={s.footerText}>Les paiements QR sont traités instantanément</Text>
      </View>

      {/* ── Confirmation / résultat modal ── */}
      <Modal
        visible={modal.phase !== 'idle' && modal.phase !== 'paying'}
        transparent
        animationType="slide"
        onRequestClose={dismiss}
      >
        <View style={s.modalBackdrop}>
          <View style={s.modalSheet}>

            {/* Preview — confirmer le paiement */}
            {modal.phase === 'preview' && (
              <>
                <View style={s.modalIcon}>
                  <MaterialIcons name="qr-code" size={32} color={C.primary} />
                </View>
                <Text style={s.modalTitle}>Confirmer le paiement</Text>
                {modal.qr.description ? (
                  <Text style={s.modalDesc}>{modal.qr.description}</Text>
                ) : null}
                <View style={s.amountRow}>
                  <Text style={s.amountLabel}>Montant</Text>
                  <Text style={s.amountValue}>{formatXAF(modal.qr.amountCents)}</Text>
                </View>
                <View style={s.modalActions}>
                  <Pressable onPress={dismiss} style={[s.modalBtn, s.modalBtnCancel]}>
                    <Text style={s.modalBtnCancelText}>Annuler</Text>
                  </Pressable>
                  <Pressable onPress={confirmPay} style={[s.modalBtn, s.modalBtnConfirm]}>
                    <MaterialIcons name="lock" size={16} color="#fff" />
                    <Text style={s.modalBtnConfirmText}>Payer</Text>
                  </Pressable>
                </View>
              </>
            )}

            {/* Success */}
            {modal.phase === 'success' && (
              <>
                <View style={[s.modalIcon, { backgroundColor: '#e6f9f3' }]}>
                  <MaterialIcons name="check-circle" size={36} color={C.secondary} />
                </View>
                <Text style={s.modalTitle}>Paiement réussi</Text>
                <Text style={s.modalDesc}>{formatXAF(modal.amountCents)} débités</Text>
                <Pressable onPress={dismiss} style={[s.modalBtn, s.modalBtnConfirm, { alignSelf: 'stretch', marginTop: 8 }]}>
                  <Text style={s.modalBtnConfirmText}>Fermer</Text>
                </Pressable>
              </>
            )}

            {/* Error */}
            {modal.phase === 'error' && (
              <>
                <View style={[s.modalIcon, { backgroundColor: '#fdecea' }]}>
                  <MaterialIcons name="error-outline" size={36} color={C.error} />
                </View>
                <Text style={s.modalTitle}>Paiement échoué</Text>
                <Text style={[s.modalDesc, { color: C.error }]}>{modal.message}</Text>
                <Pressable onPress={dismiss} style={[s.modalBtn, s.modalBtnCancel, { alignSelf: 'stretch', marginTop: 8 }]}>
                  <Text style={s.modalBtnCancelText}>Réessayer</Text>
                </Pressable>
              </>
            )}

          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const FINDER = 240;
const CORNER = 24;
const THICKNESS = 3;

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: C.bg },
  unavailableTitle: { fontSize: 18, fontWeight: '700', color: C.text, marginTop: 16, textAlign: 'center' },
  unavailableText: { fontSize: 14, color: C.muted, textAlign: 'center', marginTop: 8, lineHeight: 20 },

  header: { padding: 20, paddingBottom: 12, backgroundColor: '#000' },
  title: { fontSize: 22, fontWeight: '800', color: '#fff' },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 },

  scanArea: { flex: 1, position: 'relative' },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  finder: { width: FINDER, height: FINDER, position: 'relative' },

  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: '#57fae9', borderWidth: THICKNESS },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 4 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 4 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 4 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 4 },

  busyOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 4 },

  footer: { padding: 20, backgroundColor: '#000', alignItems: 'center' },
  footerText: { fontSize: 12, color: 'rgba(255,255,255,0.5)' },

  // Modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 28, paddingBottom: 40, alignItems: 'center', gap: 8,
  },
  modalIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#eaf0ff', alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: C.text, textAlign: 'center' },
  modalDesc: { fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 20 },
  amountRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: C.bg, borderRadius: 14, padding: 16,
    alignSelf: 'stretch', marginTop: 8,
  },
  amountLabel: { fontSize: 13, color: C.muted, fontWeight: '600' },
  amountValue: { fontSize: 22, fontWeight: '900', color: C.primary },
  modalActions: { flexDirection: 'row', gap: 12, alignSelf: 'stretch', marginTop: 8 },
  modalBtn: { flex: 1, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  modalBtnCancel: { backgroundColor: C.surfaceContainerLow, borderWidth: 1.5, borderColor: C.border },
  modalBtnCancelText: { fontSize: 15, fontWeight: '700', color: C.text },
  modalBtnConfirm: { backgroundColor: C.primary, shadowColor: C.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.28, shadowRadius: 8, elevation: 4 },
  modalBtnConfirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
