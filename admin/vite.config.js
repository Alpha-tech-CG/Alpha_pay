import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Le back-office consomme les endpoints /internal protégés par X-Internal-Token.
// Le token n'est JAMAIS exposé au navigateur : le proxy Vite (dev) l'injecte
// côté serveur. En prod, un BFF/reverse-proxy équivalent l'injecte après avoir
// vérifié la session Clerk + le rôle + l'IP allowlist (cf. README admin).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const internalToken = process.env.INTERNAL_API_TOKEN ?? env.INTERNAL_API_TOKEN;
  if (!internalToken) {
    throw new Error('INTERNAL_API_TOKEN requis pour demarrer le proxy admin.');
  }

  return {
    plugins: [react()],
    server: {
      port: 5180,
      strictPort: false,
      proxy: {
        '/admin-api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/admin-api/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('X-Internal-Token', internalToken);
            });
          },
        },
      },
    },
  };
});
