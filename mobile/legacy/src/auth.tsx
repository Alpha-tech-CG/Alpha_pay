import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { setApiKey, setBearerToken, registerPushToken } from './api';

const STORE_KEY   = 'paybrain_api_key';
const STORE_PHONE = 'paybrain_phone';
const STORE_ROLE  = 'paybrain_role';

export type UserRole = 'CLIENT' | 'MERCHANT' | 'MERCHANT_CASHIER' | 'ADMIN_STAFF';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: true,
  }),
});

interface AuthState {
  ready: boolean;
  // Marchand / développeur
  apiKey: string | null;
  // Client
  phone: string | null;
  // Commun
  role: UserRole | null;
  signInMerchant: (key: string, role?: UserRole) => Promise<void>;
  signInClient: (phone: string, token: string, role?: UserRole) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) return null;
  const { status: existing } = await Notifications.getPermissionsAsync();
  const { status } = existing === 'granted' ? { status: existing } : await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return null;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('payments', {
      name: 'Paiements',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0035c5',
    });
  }
  const projectId =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId
    ?? Constants.easConfig?.projectId;
  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  return token.data;
}

async function requireBiometric(): Promise<boolean> {
  const compatible = await LocalAuthentication.hasHardwareAsync();
  const enrolled   = await LocalAuthentication.isEnrolledAsync();
  if (!compatible || !enrolled) return true;
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Confirmer votre identité',
    fallbackLabel: 'Utiliser le code PIN',
    cancelLabel: 'Annuler',
    disableDeviceFallback: false,
  });
  return result.success;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [apiKey, setKeyState] = useState<string | null>(null);
  const [phone,  setPhone]    = useState<string | null>(null);
  const [role,   setRole]     = useState<UserRole | null>(null);
  const [ready,  setReady]    = useState(false);

  useEffect(() => {
    (async () => {
      const storedKey   = await SecureStore.getItemAsync(STORE_KEY);
      const storedPhone = await SecureStore.getItemAsync(STORE_PHONE);
      const storedRole  = await SecureStore.getItemAsync(STORE_ROLE) as UserRole | null;

      if (storedKey || storedPhone) {
        const ok = await requireBiometric();
        if (ok) {
          if (storedKey) {
            if (storedRole === 'CLIENT' || storedRole === 'MERCHANT_CASHIER') setBearerToken(storedKey);
            else setApiKey(storedKey);
            setKeyState(storedKey);
          }
          if (storedPhone) setPhone(storedPhone);
          if (storedRole)  setRole(storedRole);
        }
      }
      setReady(true);
    })();
  }, []);

  // Connexion marchand / développeur (clé API)
  const signInMerchant = async (key: string, r: UserRole = 'MERCHANT') => {
    await SecureStore.setItemAsync(STORE_KEY, key);
    await SecureStore.setItemAsync(STORE_ROLE, r);
    await SecureStore.deleteItemAsync(STORE_PHONE);
    setApiKey(key);
    setKeyState(key);
    setRole(r);
    setPhone(null);

    registerForPushNotifications()
      .then((token) => { if (token) return registerPushToken(token); })
      .catch(() => {});
  };

  // Connexion client / caissier (téléphone + token JWT renvoyé par l'API après vérification PIN)
  const signInClient = async (ph: string, token: string, r: UserRole = 'CLIENT') => {
    await SecureStore.setItemAsync(STORE_PHONE, ph);
    await SecureStore.setItemAsync(STORE_KEY, token);
    await SecureStore.setItemAsync(STORE_ROLE, r);
    setBearerToken(token);   // wallet endpoints → Authorization: Bearer
    setKeyState(token);
    setPhone(ph);
    setRole(r);
  };

  const signOut = async () => {
    await SecureStore.deleteItemAsync(STORE_KEY);
    await SecureStore.deleteItemAsync(STORE_PHONE);
    await SecureStore.deleteItemAsync(STORE_ROLE);
    setApiKey(null);
    setBearerToken(null);
    setKeyState(null);
    setPhone(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ ready, apiKey, phone, role, signInMerchant, signInClient, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
