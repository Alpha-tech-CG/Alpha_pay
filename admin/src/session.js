import { useUser as useClerkUser } from '@clerk/clerk-react';

// Mode démo : contourne l'authentification Clerk pour présenter le back-office
// sans compte, en rôle « admin ». Activé par VITE_DEMO_ADMIN=1 (admin/.env).
// NE JAMAIS activer en production — aucune vérification d'identité n'est faite.
export const DEMO = import.meta.env.VITE_DEMO_ADMIN === '1';

const DEMO_USER = {
  publicMetadata: { role: 'admin' },
  primaryEmailAddress: { emailAddress: 'demo-admin@paybrain.cg' },
};

// Renvoie l'utilisateur courant, façon Clerk `useUser()`. En démo, un admin fictif.
export function useSessionUser() {
  if (DEMO) return { user: DEMO_USER, isSignedIn: true, isLoaded: true };
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useClerkUser();
}
