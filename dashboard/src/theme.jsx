import { createContext, useContext, useEffect, useMemo, useState } from 'react'

// Identité « Lumina Finance » (design Stitch) : émeraude sur fond clair.
// Thème clair par défaut (cf. ALP-134), dark optionnel.
const LIGHT = {
  mode: 'light',
  bg: '#f7f9f8',
  surface: '#ffffff',
  surfaceAlt: '#ecf6f1',
  border: '#e6ece9',
  text: '#151c27',
  textMuted: '#5c6b63',
  primary: '#059669',
  primaryText: '#ffffff',
  shadow: '0 4px 6px rgba(16,24,40,0.03)',
}
const DARK = {
  mode: 'dark',
  bg: '#0c1512',
  surface: '#11201b',
  surfaceAlt: '#0e1a16',
  border: '#1f3a30',
  text: '#e7f1ec',
  textMuted: '#7e948a',
  primary: '#10b981',
  primaryText: '#04140d',
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
