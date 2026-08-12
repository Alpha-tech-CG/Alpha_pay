import { useEffect, useRef } from 'react';
import { useClerk } from '@clerk/clerk-react';
import { DEMO } from './session';

// Déconnexion automatique après 15 min d'inactivité (ALP-144 : session courte).
const IDLE_MS = 15 * 60 * 1000;

export function useIdleLogout() {
  // En démo, pas de Clerk : le hook `useClerk` n'est pas disponible → no-op.
  if (DEMO) return useIdleLogoutDemo();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { signOut } = useClerk();
  const timer = useRef(null);

  useEffect(() => {
    const reset = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => signOut(), IDLE_MS);
    };
    const events = ['mousemove', 'keydown', 'click', 'scroll'];
    events.forEach((e) => window.addEventListener(e, reset));
    reset();
    return () => {
      events.forEach((e) => window.removeEventListener(e, reset));
      if (timer.current) clearTimeout(timer.current);
    };
  }, [signOut]);
}

// Variante démo : aucune déconnexion automatique (pas de session Clerk).
function useIdleLogoutDemo() {
  /* no-op */
}
