import { useState } from 'react'
import { authApi, useAuth } from './auth/session'

// Miroir CLIENT de la matrice serveur (apps/api/.../permissions.ts) : sert à
// masquer des actions ; le serveur revérifie chaque requête.
const CAN = {
  'payments:view': ['OWNER', 'ADMIN', 'ACCOUNTANT'],
  'stores:manage': ['OWNER', 'ADMIN'],
  'paylinks:write': ['OWNER', 'ADMIN'],
  'cash:declare': ['OWNER', 'ADMIN', 'CASHIER'],
  'reconciliation:view': ['OWNER', 'ADMIN', 'ACCOUNTANT'],
  'reconciliation:write': ['OWNER', 'ADMIN', 'ACCOUNTANT'],
  'exports:create': ['OWNER', 'ADMIN', 'ACCOUNTANT'],
  'invoices:view': ['OWNER', 'ADMIN', 'ACCOUNTANT'],
  'invoices:write': ['OWNER', 'ADMIN'],
  'school:view': ['OWNER', 'ADMIN', 'ACCOUNTANT'],
  'school:manage': ['OWNER', 'ADMIN'],
}

const MODE_KEY = 'ap_mode'

/**
 * Marchand courant, rôle et mode test/live (§4.6). Le live n'est proposé
 * qu'une fois le dossier approuvé ; le choix est mémorisé sur l'appareil.
 */
export function useMerchant() {
  const { user } = useAuth()
  const m = user?.merchants?.[0]
  const canLive = m?.kybStatus === 'APPROVED'
  const [stored, setStored] = useState(() => {
    try {
      return localStorage.getItem(MODE_KEY)
    } catch {
      return null
    }
  })
  const mode = canLive ? (stored === 'test' ? 'test' : 'live') : 'test'
  const setMode = (next) => {
    try {
      localStorage.setItem(MODE_KEY, next)
    } catch {
      /* stockage indisponible : le choix vaut pour la page */
    }
    setStored(next)
  }
  return {
    membership: m,
    merchantId: m?.id,
    role: m?.role,
    base: m ? `/v1/merchants/${m.id}` : null,
    mode,
    canLive,
    setMode,
    can: (action) => (CAN[action] ?? []).includes(m?.role),
  }
}

/** Remplace {nom} dans un libellé traduit. */
export function fmt(text, vars = {}) {
  return text.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`))
}

export function money(amount, currency = 'XAF') {
  return `${Number(amount ?? 0).toLocaleString('fr-FR')} ${currency}`
}

export function day(iso) {
  return iso ? new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('fr-FR') : '—'
}

export function dateTime(iso) {
  return iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}

/** Date du jour à Brazzaville (UTC+1), au format AAAA-MM-JJ. */
export function todayBzv() {
  return new Date(Date.now() + 3_600_000).toISOString().slice(0, 10)
}

/** Téléchargement authentifié (PDF, CSV, Excel) : le jeton ne passe jamais dans l'URL. */
export async function download(path, filename, params) {
  const res = await authApi.get(path, { params, responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Ouvre un PDF authentifié dans un nouvel onglet. */
export async function openPdf(path, params) {
  const tab = window.open('', '_blank')
  const res = await authApi.get(path, { params, responseType: 'blob' })
  const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
  if (tab) tab.location.href = url
  else window.location.href = url
}

/** Module non inclus dans le palier (403 module_non_inclus) : visible mais verrouillé (§M11). */
export function isLocked(err) {
  return err?.response?.status === 403 && ['module_non_inclus'].includes(err?.response?.data?.error?.code)
}
