import { useUser as useClerkUser } from '@clerk/clerk-react';

const rawDemoFlag = import.meta.env.VITE_DEMO_ADMIN === '1';

// Garde-fou étape F (docs/AVANT_PROD.md §0.3), en plus de celui dans
// vite.config.js (qui fait déjà échouer `vite build --mode production`) :
// si ce module s'exécute quand même dans un bundle de prod avec le flag posé
// (autre pipeline de build, variable injectée après coup...), on préfère un
// crash bruyant à un bypass d'authentification silencieux.
if (import.meta.env.PROD && rawDemoFlag) {
  throw new Error(
    "VITE_DEMO_ADMIN=1 est interdit en production — ce flag contourne entierement " +
    "l'authentification Clerk du back-office admin.",
  );
}

// Mode démo : contourne l'authentification Clerk pour présenter le back-office
// sans compte, en rôle « admin ». Activé par VITE_DEMO_ADMIN=1 (admin/.env).
// Actif UNIQUEMENT en dev (garde-fou ci-dessus) — jamais en production.
export const DEMO = !import.meta.env.PROD && rawDemoFlag;

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
