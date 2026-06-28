import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { setApiKey } from './api';

const KEY_STORE = 'paybrain_api_key';

interface AuthState {
  ready: boolean;
  apiKey: string | null;
  signIn: (key: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [apiKey, setKey] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await SecureStore.getItemAsync(KEY_STORE);
      if (stored) {
        setApiKey(stored);
        setKey(stored);
      }
      setReady(true);
    })();
  }, []);

  const signIn = async (key: string) => {
    await SecureStore.setItemAsync(KEY_STORE, key);
    setApiKey(key);
    setKey(key);
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
