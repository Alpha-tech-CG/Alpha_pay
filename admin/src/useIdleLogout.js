import { useEffect, useRef } from 'react';
import { useClerk } from '@clerk/clerk-react';

// Déconnexion automatique après 15 min d'inactivité (ALP-144 : session courte).
const IDLE_MS = 15 * 60 * 1000;

export function useIdleLogout() {
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
