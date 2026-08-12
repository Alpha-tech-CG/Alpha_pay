'use client';
import { createContext, useContext, useEffect, useState } from 'react';

export type Theme = 'dark' | 'green' | 'blue';
export const THEMES: { key: Theme; label: string; swatch: string; bg: string }[] = [
  { key: 'dark', label: 'Dark corail', swatch: '#e94560', bg: '#0f0f1a' },
  { key: 'green', label: 'Vert / Blanc', swatch: '#00b589', bg: '#ffffff' },
  { key: 'blue', label: 'Bleu / Blanc', swatch: '#2563eb', bg: '#ffffff' },
];

const ThemeCtx = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({ theme: 'dark', setTheme: () => {} });
export const useTheme = () => useContext(ThemeCtx);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');

  useEffect(() => {
    const saved = (localStorage.getItem('alphapay_theme') as Theme | null) ?? 'dark';
    setThemeState(saved);
    document.documentElement.dataset.theme = saved;
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    document.documentElement.dataset.theme = t;
    localStorage.setItem('alphapay_theme', t);
  };

  return <ThemeCtx.Provider value={{ theme, setTheme }}>{children}</ThemeCtx.Provider>;
}
