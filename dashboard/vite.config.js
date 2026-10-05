import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const merchantKey = env.MERCHANT_API_KEY

  return {
    plugins: [react()],
    server: {
      port: parseInt(process.env.PORT || '5174'),
      strictPort: false,
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          rewrite: path => path.replace(/^\/api/, ''),
          // Sécurité (charte AuthN) : la clé API marchand est injectée CÔTÉ SERVEUR
          // par le proxy, jamais exposée au navigateur. En prod, un BFF jouera ce rôle.
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (merchantKey) proxyReq.setHeader('X-API-Key', merchantKey)
            })
          },
        },
        '/ws': {
          target: 'ws://localhost:3000',
          ws: true,
          changeOrigin: true,
          rewrite: path => path.replace(/^\/ws/, ''),
          // Le WebSocket est authentifié par la même clé API marchand, injectée
          // côté serveur sur la requête d'upgrade (jamais exposée au navigateur).
          configure: (proxy) => {
            proxy.on('proxyReqWs', (proxyReq) => {
              if (merchantKey) proxyReq.setHeader('X-API-Key', merchantKey)
            })
          },
        },
      },
    },
  }
})
