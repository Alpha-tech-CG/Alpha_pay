// Design « AlphaPay » — système de thèmes commutables (dark corail / vert-blanc / bleu-blanc).
// `C` reste l'export par défaut (dark) pour compat ; les écrans convertis utilisent useTheme().
import { createContext, useContext, useEffect, useState, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Palette = {
  bg: string; surface: string; surfaceAlt: string;
  surfaceContainer: string; surfaceContainerLow: string; surfaceContainerHigh: string; surfaceContainerHighest: string;
  border: string; text: string; textVariant: string; muted: string;
  primary: string; primaryDark: string; primarySoft: string; onPrimary: string;
  secondary: string; onSecondary: string; secondaryContainer: string; onSecondaryContainer: string;
  error: string; errorContainer: string; success: string; successBg: string; pending: string; pendingBg: string;
};

export type ThemeName = 'dark' | 'green' | 'blue';

const dark: Palette = {
  bg: '#0F0F1A', surface: '#1A1A2E', surfaceAlt: '#1E1E36',
  surfaceContainer: '#1E1E36', surfaceContainerLow: '#1A1A2E', surfaceContainerHigh: '#2A2A45', surfaceContainerHighest: '#2A2A45',
  border: '#2A2A45', text: '#F7F8FC', textVariant: '#C7CBDE', muted: '#8F95B2',
  primary: '#E94560', primaryDark: '#B4324A', primarySoft: 'rgba(233,69,96,0.12)', onPrimary: '#FFFFFF',
  secondary: '#00C896', onSecondary: '#04140F', secondaryContainer: 'rgba(0,200,150,0.14)', onSecondaryContainer: '#00C896',
  error: '#EF4444', errorContainer: 'rgba(239,68,68,0.12)', success: '#00C896', successBg: 'rgba(0,200,150,0.14)',
  pending: '#F5A623', pendingBg: 'rgba(245,166,35,0.14)',
};

const green: Palette = {
  bg: '#F6F9F8', surface: '#FFFFFF', surfaceAlt: '#EEF4F2',
  surfaceContainer: '#EEF4F2', surfaceContainerLow: '#FFFFFF', surfaceContainerHigh: '#E6F6F0', surfaceContainerHighest: '#DCF0E8',
  border: '#DBE7E2', text: '#10231D', textVariant: '#33463F', muted: '#5C7268',
  primary: '#00B589', primaryDark: '#00916E', primarySoft: 'rgba(0,181,137,0.12)', onPrimary: '#FFFFFF',
  secondary: '#059669', onSecondary: '#FFFFFF', secondaryContainer: 'rgba(5,150,105,0.12)', onSecondaryContainer: '#059669',
  error: '#DC2626', errorContainer: 'rgba(220,38,38,0.10)', success: '#059669', successBg: 'rgba(5,150,105,0.12)',
  pending: '#D97706', pendingBg: 'rgba(217,119,6,0.12)',
};

const blue: Palette = {
  bg: '#F6F8FC', surface: '#FFFFFF', surfaceAlt: '#EEF2F9',
  surfaceContainer: '#EEF2F9', surfaceContainerLow: '#FFFFFF', surfaceContainerHigh: '#E8EEFB', surfaceContainerHighest: '#DEE9FB',
  border: '#DEE5F1', text: '#0F1729', textVariant: '#33405A', muted: '#5F6B83',
  primary: '#2563EB', primaryDark: '#1D4ED8', primarySoft: 'rgba(37,99,235,0.12)', onPrimary: '#FFFFFF',
  secondary: '#059669', onSecondary: '#FFFFFF', secondaryContainer: 'rgba(5,150,105,0.12)', onSecondaryContainer: '#059669',
  error: '#DC2626', errorContainer: 'rgba(220,38,38,0.10)', success: '#059669', successBg: 'rgba(5,150,105,0.12)',
  pending: '#D97706', pendingBg: 'rgba(217,119,6,0.12)',
};

export const PALETTES: Record<ThemeName, Palette> = { dark, green, blue };

export const THEME_OPTIONS: { key: ThemeName; label: string; swatch: string; bg: string }[] = [
  { key: 'dark', label: 'Dark corail', swatch: '#E94560', bg: '#0F0F1A' },
  { key: 'green', label: 'Vert / Blanc', swatch: '#00B589', bg: '#FFFFFF' },
  { key: 'blue', label: 'Bleu / Blanc', swatch: '#2563EB', bg: '#FFFFFF' },
];

/** Palette par défaut (dark). Les écrans non encore convertis l'utilisent directement. */
export const C: Palette = dark;

export const STATUS = {
  SUCCESSFUL: { label: 'Confirmé',   color: dark.success, bg: dark.successBg },
  PENDING:    { label: 'En attente', color: dark.pending, bg: dark.pendingBg },
  FAILED:     { label: 'Échoué',     color: dark.error,   bg: dark.errorContainer },
  REJECTED:   { label: 'Rejeté',     color: dark.error,   bg: dark.errorContainer },
} as const;

const STORAGE_KEY = 'alphapay_theme';

type ThemeCtx = { name: ThemeName; C: Palette; isDark: boolean; setTheme: (t: ThemeName) => void };
const Ctx = createContext<ThemeCtx>({ name: 'dark', C: dark, isDark: true, setTheme: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [name, setName] = useState<ThemeName>('dark');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v === 'dark' || v === 'green' || v === 'blue') setName(v);
    });
  }, []);

  const setTheme = (t: ThemeName) => {
    setName(t);
    AsyncStorage.setItem(STORAGE_KEY, t).catch(() => {});
  };

  const value = useMemo<ThemeCtx>(
    () => ({ name, C: PALETTES[name], isDark: name === 'dark', setTheme }),
    [name],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
