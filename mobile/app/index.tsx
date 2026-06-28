import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/auth';
import { verifyKey } from '@/api';
import { C } from '@/theme';

export default function Login() {
  const { ready, apiKey, signIn } = useAuth();
  const [key, setKeyInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: C.bg }}>
        <ActivityIndicator color={C.primary} />
      </View>
    );
  }
  if (apiKey) return <Redirect href="/(tabs)" />;

  const submit = async () => {
    if (!key.trim()) return;
    setBusy(true);
    setError(null);
    const ok = await verifyKey(key.trim());
    if (ok) await signIn(key.trim());
    else {
      setError('Clé API invalide ou serveur injoignable');
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <View style={{ alignItems: 'center', marginBottom: 28 }}>
          <View style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <Text style={{ color: '#fff', fontSize: 28, fontWeight: '800' }}>P</Text>
          </View>
          <Text style={{ fontSize: 24, fontWeight: '800', color: C.text }}>PayBrain</Text>
          <Text style={{ fontSize: 14, color: C.muted, marginTop: 4 }}>Espace marchand</Text>
        </View>

        <Text style={{ fontSize: 12, fontWeight: '600', color: C.muted, marginBottom: 6 }}>Clé API marchand</Text>
        <TextInput
          value={key}
          onChangeText={setKeyInput}
          placeholder="pk_live_…"
          placeholderTextColor={C.muted}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          style={{
            backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10,
            paddingHorizontal: 14, height: 50, fontSize: 15, color: C.text, marginBottom: 16,
          }}
        />
        {error && <Text style={{ color: C.error, fontSize: 13, marginBottom: 12 }}>⚠️ {error}</Text>}
        <Pressable
          onPress={submit}
          disabled={busy}
          style={{ backgroundColor: busy ? '#9ad9c0' : C.primary, height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Se connecter</Text>}
        </Pressable>
        <Text style={{ fontSize: 11, color: C.muted, textAlign: 'center', marginTop: 16 }}>
          🔒 Clé stockée chiffrée sur l'appareil (SecureStore)
        </Text>
      </View>
    </SafeAreaView>
  );
}
