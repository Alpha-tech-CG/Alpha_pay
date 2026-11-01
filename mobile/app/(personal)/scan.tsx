// Scanner un QR AlphaPay (identifiant ou demande de paiement) puis ouvrir l'envoi.
import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { B, F, R } from '@/brand';
import { PrimaryButton, TopBar, useStatusBar } from '@/bank';
import { Pulse } from '@/motion';

/** « alphapay:@marie.alphapay?request=ab12cd » → identifiant et code de demande. */
export function parseAlphaPayQr(data: string): { to: string; request?: string } | null {
  const m = /^alphapay:(@[a-z0-9._-]+)(?:\?request=([a-f0-9]+))?$/i.exec(data.trim());
  return m ? { to: m[1].toLowerCase(), request: m[2] } : null;
}

export default function Scan() {
  const router = useRouter();
  useStatusBar('light');
  const [permission, requestPermission] = useCameraPermissions();
  const [invalid, setInvalid] = useState(false);
  const handled = useRef(false);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/(personal)/alphapay'));

  const onScan = ({ data }: { data: string }) => {
    if (handled.current) return;
    const parsed = parseAlphaPayQr(data);
    if (!parsed) return setInvalid(true);
    handled.current = true;
    router.replace({ pathname: '/(personal)/send', params: parsed.request ? { request: parsed.request } : { to: parsed.to } });
  };

  if (!permission?.granted) {
    return (
      <View style={[s.root, { backgroundColor: B.bg }]}>
        <TopBar onBack={back} title="Scanner" />
        <View style={s.ask}>
          <Text style={s.askTitle}>Autoriser la caméra</Text>
          <Text style={s.askText}>AlphaPay utilise la caméra uniquement pour lire les QR codes AlphaPay.</Text>
          <PrimaryButton label="Autoriser" onPress={requestPermission} />
        </View>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={onScan} />
      <View style={s.overlay}>
        <TopBar onBack={back} title="Scanner un QR AlphaPay" light />
        <View style={s.center}>
          <View style={s.frame}>
            <Pulse size={240} color={B.mustard} />
          </View>
          <Text style={s.hint}>{invalid ? 'Ce QR n’est pas un QR AlphaPay.' : 'Placez le QR AlphaPay dans le cadre'}</Text>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  overlay: { ...StyleSheet.absoluteFillObject, paddingTop: 36 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 },
  frame: { width: 250, height: 250, borderRadius: R.xl, borderWidth: 3, borderColor: B.mustard, alignItems: 'center', justifyContent: 'center' },
  hint: { fontFamily: F.semibold, fontSize: 15, color: B.white, backgroundColor: 'rgba(11,31,58,0.7)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: R.pill },
  ask: { padding: 24, gap: 14 },
  askTitle: { fontFamily: F.bold, fontSize: 22, color: B.ink },
  askText: { fontFamily: F.regular, fontSize: 15, color: B.muted, lineHeight: 22 },
});
