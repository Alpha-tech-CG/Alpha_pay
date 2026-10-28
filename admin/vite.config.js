import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Le back-office appelle les routes /internal de l'API avec la session du
// personnel (mot de passe + TOTP, §M12). Le proxy ne fait que relayer : il
// n'injecte aucun secret. En production, servir le back-office et l'API derrière
// le même reverse-proxy, accès restreint au réseau d'AlphaPay.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Cible de l'API : localhost en dev natif, service `api` dans docker compose.
  const apiTarget = process.env.API_PROXY_TARGET ?? env.API_PROXY_TARGET ?? 'http://localhost:3000';

  return {
    plugins: [react()],
    server: {
      port: 5180,
      strictPort: false,
      proxy: {
        '/admin-api': {
          target: apiTarget,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/admin-api/, ''),
        },
      },
    },
  };
});
