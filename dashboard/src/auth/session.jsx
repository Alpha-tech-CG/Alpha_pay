import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'

/**
 * Session du tableau de bord (§M1).
 * - Le jeton d'accès (15 min) vit UNIQUEMENT en mémoire : jamais dans le
 *   localStorage, donc illisible par un script injecté après rechargement.
 * - Le jeton de rafraîchissement est un cookie HttpOnly posé par l'API : la
 *   page ne le voit jamais. Le renouvellement exige l'en-tête anti-CSRF.
 */
const CSRF = { 'X-AlphaPay-CSRF': '1' }

/** Client des routes publiques d'authentification (pas de jeton). */
const publicApi = axios.create({ baseURL: '/api', withCredentials: true })

/** Client des routes protégées : jeton ajouté, renouvelé une fois sur 401. */
export const authApi = axios.create({ baseURL: '/api', withCredentials: true })

let accessToken = null
let refreshing = null

async function refreshAccessToken() {
  refreshing ??= publicApi
    .post('/v1/auth/refresh', {}, { headers: CSRF })
    .then((res) => {
      accessToken = res.data.access_token
      return accessToken
    })
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

authApi.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`
  return config
})

let onSessionLost = () => {}

authApi.interceptors.response.use(undefined, async (error) => {
  const original = error.config
  if (error.response?.status === 401 && original && !original._retried) {
    original._retried = true
    try {
      await refreshAccessToken()
      original.headers.Authorization = `Bearer ${accessToken}`
      return authApi(original)
    } catch {
      accessToken = null
      onSessionLost()
    }
  }
  return Promise.reject(error)
})

/** Message d'erreur lisible depuis le format d'erreur unique de l'API (§7). */
export function errorMessage(error, fallback) {
  return error?.response?.data?.error?.message ?? fallback
}

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null })
  const mounted = useRef(true)

  const loadMe = useCallback(async () => {
    const me = await authApi.get('/v1/auth/me')
    if (mounted.current) setState({ status: 'authenticated', user: me.data })
    return me.data
  }, [])

  useEffect(() => {
    mounted.current = true
    onSessionLost = () => mounted.current && setState({ status: 'anonymous', user: null })
    // Au chargement : une session existe-t-elle encore (cookie) ?
    refreshAccessToken()
      .then(loadMe)
      .catch(() => mounted.current && setState({ status: 'anonymous', user: null }))
    return () => {
      mounted.current = false
    }
  }, [loadMe])

  const value = useMemo(
    () => ({
      ...state,
      /** Inscription : renvoie le défi (code envoyé). */
      register: async (form) => (await publicApi.post('/v1/auth/register', form)).data,
      /** Connexion, étape 1 : mot de passe ; renvoie le défi. */
      login: async (form) => (await publicApi.post('/v1/auth/login', form)).data,
      /** Étape 2 (inscription ou connexion) : le code ouvre la session. */
      verify: async (challenge, code) => {
        const res = await publicApi.post('/v1/auth/verify', { challenge, code })
        accessToken = res.data.access_token
        setState({ status: 'authenticated', user: res.data.user })
        return res.data.user
      },
      forgot: async (form) => (await publicApi.post('/v1/auth/password/forgot', form)).data,
      reset: async (form) => (await publicApi.post('/v1/auth/password/reset', form)).data,
      refreshUser: loadMe,
      logout: async (everywhere = false) => {
        try {
          await authApi.post(everywhere ? '/v1/auth/logout-all' : '/v1/auth/logout')
        } finally {
          accessToken = null
          setState({ status: 'anonymous', user: null })
        }
      },
    }),
    [state, loadMe],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé dans AuthProvider')
  return ctx
}
