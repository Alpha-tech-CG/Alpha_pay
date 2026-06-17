import { createContext, useContext, useEffect, useMemo, useState } from 'react'

// Thème clair par défaut (cf. ALP-134), dark optionnel.
const LIGHT = {
  mode: 'light',
  bg: '#f6f7fb',
  surface: '#ffffff',
  surfaceAlt: '#f1f3f9',
  border: '#e2e6ef',
  text: '#1a2133',
  textMuted: '#64748b',
  primary: '#3b56f0',
  primaryText: '#ffffff',
  shadow: '0 1px 3px rgba(20,30,60,0.08)',
}
const DARK = {
  mode: 'dark',
  bg: '#0f1117',
  surface: '#1e2433',
  surfaceAlt: '#161b2a',
  border: '#2d3748',
  text: '#e2e8f0',
  textMuted: '#64748b',
  primary: '#3b82f6',
  primaryText: '#ffffff',
  shadow: '0 1px 3px rgba(0,0,0,0.4)',
}

const STATUS = {
  PENDING: '#d97706',
  SUCCESSFUL: '#16a34a',
  FAILED: '#dc2626',
  REJECTED: '#dc2626',
}

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() => localStorage.getItem('pb_theme') || 'light')

  useEffect(() => {
    localStorage.setItem('pb_theme', mode)
    document.body.style.background = (mode === 'dark' ? DARK : LIGHT).bg
    document.body.style.color = (mode === 'dark' ? DARK : LIGHT).text
  }, [mode])

  const value = useMemo(() => {
    const tokens = mode === 'dark' ? DARK : LIGHT
    return {
      t: tokens,
      status: STATUS,
      mode,
      toggle: () => setMode((m) => (m === 'dark' ? 'light' : 'dark')),
    }
  }, [mode])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
