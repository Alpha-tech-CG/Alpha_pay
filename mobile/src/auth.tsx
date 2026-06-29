import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { setApiKey, registerPushToken } from './api';

const KEY_STORE = 'paybrain_api_key';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

interface AuthState {
  ready: boolean;
  apiKey: string | null;
  signIn: (key: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  const { status } = existing === 'granted'
    ? { status: existing }
    : await Notifications.requestPermissionsAsync();

  if (status !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('payments', {
      name: 'Paiements',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0F6E56',
    });
  }

  const token = await Notifications.getExpoPushTokenAsync();
  return token.data;
}

async function requireBiometric(): Promise<boolean> {
  const compatible = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  if (!compatible || !enrolled) return true; // pas de biométrie dispo → on laisse passer

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Confirmer votre identité',
    fallbackLabel: 'Utiliser le code PIN',
    cancelLabel: 'Annuler',
    disableDeviceFallback: false,
  });
  return result.success;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [apiKey, setKey] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await SecureStore.getItemAsync(KEY_STORE);
      if (stored) {
        const ok = await requireBiometric();
        if (ok) {
          setApiKey(stored);
          setKey(stored);
        }
        // Si biométrie refusée, on reste déconnecté → l'utilisateur devra resaisir sa clé
      }
      setReady(true);
    })();
  }, []);

  const signIn = async (key: string) => {
    await SecureStore.setItemAsync(KEY_STORE, key);
    setApiKey(key);
    setKey(key);

    // Enregistrement push en arrière-plan, non bloquant
    registerForPushNotifications()
      .then((token) => { if (token) return registerPushToken(token); })
      .catch(() => { /* silencieux — non critique */ });
  };

  const signOut = async () => {
    await SecureStore.deleteItemAsync(KEY_STORE);
    setApiKey(null);
    setKey(null);
  };

  return (
    <AuthContext.Provider value={{ ready, apiKey, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
