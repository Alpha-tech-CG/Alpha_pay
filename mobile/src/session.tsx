// Session de l'app marchand : utilisateur connecté, marchand courant, rôle et
// mode test/live (§4.6). Miroir de dashboard/src/auth/session.jsx et merchant.js.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { getMe, logout as apiLogout, restoreSession, setSessionLostHandler, verifyCode, type Me, type Mode, type Role } from '@/api';

const MODE_KEY = 'alphapay_mode';
const SPACE_KEY = 'alphapay_space';

export type Space = 'merchant' | 'personal';

// Miroir CLIENT de la matrice serveur (apps/api/.../permissions.ts) : sert à
// masquer des actions ; le serveur revérifie chaque requête.
const CAN: Record<string, Role[]> = {
  'payments:view': ['OWNER', 'ADMIN', 'ACCOUNTANT'],
  'payments:refund': ['OWNER', 'ADMIN'],
  'paylinks:write': ['OWNER', 'ADMIN'],
  'team:view': ['OWNER', 'ADMIN', 'ACCOUNTANT', 'CASHIER'],
};

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'Propriétaire',
  ADMIN: 'Administrateur',
  ACCOUNTANT: 'Comptable',
  CASHIER: 'Caissier',
};

type Status = 'loading' | 'anonymous' | 'authenticated';

interface SessionState {
  status: Status;
  user: Me | null;
  /** Étape 2 de la connexion : le code ouvre la session. */
  verify: (challenge: string, code: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
  storedMode: Mode | null;
  setStoredMode: (m: Mode) => void;
  /** Espace affiché quand le compte a les deux (particulier et commerce). */
  space: Space | null;
  setSpace: (s: Space) => void;
}

const Ctx = createContext<SessionState | null>(null);

/** Déverrouillage par empreinte ou code de l'appareil quand une session est enregistrée. */
async function unlockDevice(): Promise<boolean> {
  const [hardware, enrolled] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()]);
  if (!hardware || !enrolled) return true;
  const res = await LocalAuthentication.authenticateAsync({ promptMessage: 'Déverrouiller AlphaPay', cancelLabel: 'Annuler' });
  return res.success;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<Me | null>(null);
  const [storedMode, setMode] = useState<Mode | null>(null);
  const [storedSpace, setStoredSpace] = useState<Space | null>(null);

  useEffect(() => {
    setSessionLostHandler(() => {
      setUser(null);
      setStatus('anonymous');
    });
    (async () => {
      setMode(((await SecureStore.getItemAsync(MODE_KEY)) as Mode | null) ?? null);
      setStoredSpace(((await SecureStore.getItemAsync(SPACE_KEY)) as Space | null) ?? null);
      try {
        const hasSession = !!(await SecureStore.getItemAsync('alphapay_refresh_token'));
        if (hasSession && !(await unlockDevice())) throw new Error('verrouillé');
        const me = await restoreSession();
        setUser(me);
        setStatus(me ? 'authenticated' : 'anonymous');
      } catch {
        setStatus('anonymous');
      }
    })();
  }, []);

  const verify = useCallback(async (challenge: string, code: string) => {
    const me = await verifyCode(challenge, code);
    setUser(me);
    setStatus('authenticated');
  }, []);

  const refreshUser = useCallback(async () => {
    setUser(await getMe());
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  const setStoredMode = useCallback((m: Mode) => {
    setMode(m);
    SecureStore.setItemAsync(MODE_KEY, m).catch(() => {});
  }, []);

  const setSpace = useCallback((sp: Space) => {
    setStoredSpace(sp);
    SecureStore.setItemAsync(SPACE_KEY, sp).catch(() => {});
  }, []);

  // Espace effectif : celui choisi s'il existe pour ce compte, sinon celui qui existe.
  const hasMerchant = !!user?.merchants?.length;
  const hasPersonal = !!user?.personal;
  const space: Space | null = storedSpace === 'personal' && hasPersonal ? 'personal' : hasMerchant ? 'merchant' : hasPersonal ? 'personal' : null;

  const value = useMemo(
    () => ({ status, user, verify, refreshUser, logout, storedMode, setStoredMode, space, setSpace }),
    [status, user, verify, refreshUser, logout, storedMode, setStoredMode, space, setSpace],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSession hors de SessionProvider');
  return ctx;
}

/** Marchand courant, rôle et mode. Le live n'est proposé qu'une fois le dossier approuvé. */
export function useMerchant() {
  const { user, storedMode, setStoredMode } = useSession();
  const m = user?.merchants?.[0];
  const canLive = m?.kybStatus === 'APPROVED';
  const mode: Mode = canLive ? (storedMode === 'test' ? 'test' : 'live') : 'test';
  return {
    membership: m,
    merchantId: m?.id ?? '',
    role: m?.role,
    mode,
    canLive,
    setMode: setStoredMode,
    can: (action: string) => !!m && (CAN[action] ?? []).includes(m.role),
  };
}
