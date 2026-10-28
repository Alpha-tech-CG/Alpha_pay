import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, setStaffToken } from './api';

// Session du personnel AlphaPay (§M12) : mot de passe puis code TOTP, toujours.
// Le jeton vit en sessionStorage (effacé à la fermeture de l'onglet) et la
// session se ferme après 15 minutes d'inactivité.
const STORAGE_KEY = 'alphapay_staff_session';
const IDLE_MS = 15 * 60 * 1000;

const StaffContext = createContext(null);

function readStored() {
  try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) ?? null; } catch { return null; }
}

export function StaffProvider({ children }) {
  const [session, setSession] = useState(() => readStored());
  const timer = useRef(null);

  const save = useCallback((value) => {
    setSession(value);
    try {
      if (value) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch { /* stockage indisponible : session en mémoire seulement */ }
  }, []);

  setStaffToken(session?.token ?? null, () => save(null));

  const logout = useCallback(async () => {
    try { await api.post('/internal/staff/logout'); } catch { /* déjà expirée */ }
    save(null);
  }, [save]);

  // Déconnexion automatique après inactivité.
  useEffect(() => {
    if (!session) return undefined;
    const reset = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(logout, IDLE_MS);
    };
    const events = ['mousemove', 'keydown', 'click', 'scroll'];
    events.forEach((e) => window.addEventListener(e, reset));
    reset();
    return () => {
      events.forEach((e) => window.removeEventListener(e, reset));
      clearTimeout(timer.current);
    };
  }, [session, logout]);

  const value = useMemo(() => ({
    staff: session?.staff ?? null,
    role: session?.staff?.role ?? null,
    signedIn: !!session?.token,
    /** Étape 1 : renvoie { step: 'otp' | 'enroll', … }. */
    passwordStep: async (email, password) => (await api.post('/internal/staff/login', { email, password })).data,
    /** Étape 2 : code TOTP (connexion habituelle) ou premier code (enrôlement). */
    codeStep: async (kind, token, code) => {
      const { data } = await api.post(kind === 'enroll' ? '/internal/staff/login/enroll' : '/internal/staff/login/otp', { token, code });
      save({ token: data.token, staff: data.staff, expires_at: data.expires_at });
    },
    logout,
  }), [session, save, logout]);

  return <StaffContext.Provider value={value}>{children}</StaffContext.Provider>;
}

export function useStaff() {
  return useContext(StaffContext);
}
