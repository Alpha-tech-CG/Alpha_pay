import { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { Amount, BigTitle, HelpDot, PrimaryButton, useStatusBar } from '@/components/UcKit';
import { UC, ucFont } from '@/uc';
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
  const router = useRouter();
  useStatusBar(CameraView ? 'light' : 'dark');
  const [modal, setModal] = useState<ModalState>({ phase: 'idle' });

  const dismiss = () => setModal({ phase: 'idle' });

  if (!CameraView) {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: UC.bg }]} edges={['top']}>
        <View style={s.headerLight}>
          <Icon name="chevron-left" size={28} color={UC.ink} onPress={() => router.back()} />
          <HelpDot />
        </View>
        <View style={s.center}>
          <Icon name="qr-code-scanner" size={56} color={UC.muted} />
          <Text style={s.unavailableTitle}>Scanner non disponible</Text>
          <Text style={s.unavailableText}>
            La caméra n'est pas encore activée dans cette version de l'application.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleBarcode = ({ data }: { data: string }) => {
    if (modal.phase !== 'idle') return;

    const qr = parseQr(data);
    if (!qr) {
      setModal({ phase: 'error', message: 'QR code non reconnu. Assurez-vous de scanner un QR AlphaPay.' });
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
        <View style={s.headerTop}>
          <Icon name="chevron-left" size={28} color={UC.white} onPress={() => router.back()} />
          <HelpDot inverted />
        </View>
        <BigTitle color={UC.white} style={{ marginTop: 10 }}>Payer par QR code</BigTitle>
        <Text style={s.subtitle}>Pointez la caméra sur le QR code du marchand</Text>
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
                <ActivityIndicator color={UC.white} size="large" />
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
                <Text style={s.modalTitle}>Confirmer le paiement</Text>
                {modal.qr.description ? (
                  <Text style={s.modalDesc}>{modal.qr.description}</Text>
                ) : null}
                <View style={s.amountRow}>
                  <Text style={s.amountLabel}>MONTANT</Text>
                  <Amount cents={modal.qr.amountCents} size={30} forceShow />
                </View>
                <View style={s.modalActions}>
                  <PrimaryButton label="Payer" icon="lock" onPress={confirmPay} />
                  <Pressable onPress={dismiss} style={s.cancel}>
                    <Text style={s.cancelText}>Annuler</Text>
                  </Pressable>
                </View>
              </>
            )}

            {/* Success */}
            {modal.phase === 'success' && (
              <>
                <Icon name="check-circle" size={48} color={UC.green} />
                <Text style={s.modalTitle}>Paiement réussi</Text>
                <Amount cents={-modal.amountCents} size={26} color={UC.ink} forceShow />
                <View style={s.modalActions}>
                  <PrimaryButton label="Fermer" onPress={dismiss} />
                </View>
              </>
            )}

            {/* Error */}
            {modal.phase === 'error' && (
              <>
                <Icon name="alert-triangle" size={44} color={UC.red} />
                <Text style={s.modalTitle}>Paiement échoué</Text>
                <Text style={[s.modalDesc, { color: UC.red }]}>{modal.message}</Text>
                <View style={s.modalActions}>
                  <PrimaryButton label="Réessayer" variant="dark" onPress={dismiss} />
                </View>
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
  root: { flex: 1, backgroundColor: UC.dark },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  unavailableTitle: { fontFamily: ucFont.condensed, fontSize: 22, fontWeight: '700', color: UC.ink, marginTop: 16, textAlign: 'center' },
  unavailableText: { fontFamily: ucFont.regular, fontSize: 15, color: UC.muted, textAlign: 'center', marginTop: 8, lineHeight: 21 },
  headerLight: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12 },

  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 18, backgroundColor: UC.dark },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  subtitle: { fontFamily: ucFont.regular, fontSize: 15, color: 'rgba(255,255,255,0.7)', marginTop: 4 },

  scanArea: { flex: 1, position: 'relative' },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  finder: { width: FINDER, height: FINDER, position: 'relative' },

  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: UC.white, borderWidth: THICKNESS },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 6 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 6 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 6 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 6 },

  busyOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 6 },

  footer: { padding: 20, backgroundColor: UC.dark, alignItems: 'center' },
  footerText: { fontFamily: ucFont.regular, fontSize: 14, color: 'rgba(255,255,255,0.6)' },

  // Feuille modale
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: UC.bg, borderTopLeftRadius: 12, borderTopRightRadius: 12, padding: 20, paddingBottom: 28, alignItems: 'center', gap: 8 },
  modalTitle: { fontFamily: ucFont.condensed, fontSize: 26, fontWeight: '700', color: UC.ink, textAlign: 'center' },
  modalDesc: { fontFamily: ucFont.regular, fontSize: 15, color: UC.muted, textAlign: 'center', lineHeight: 21 },
  amountRow: { alignSelf: 'stretch', alignItems: 'center', gap: 4, borderTopWidth: 1, borderBottomWidth: 1, borderColor: UC.line, paddingVertical: 16, marginTop: 8 },
  amountLabel: { fontFamily: ucFont.condensed, fontSize: 13, fontWeight: '700', color: UC.inkSoft, letterSpacing: 0.6 },
  modalActions: { alignSelf: 'stretch', gap: 6, marginTop: 12 },
  cancel: { height: 48, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontFamily: ucFont.condensed, fontSize: 17, fontWeight: '700', color: UC.teal },
});
