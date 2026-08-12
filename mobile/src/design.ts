// Tokens de design « AlphaPay » (maquettes Sleek). Thème clair cyan / navy.
// Utilisés par les écrans client restylés — indépendant du système de thèmes
// commutables (@/theme) pour une reproduction fidèle des maquettes.
import { Platform } from 'react-native';

export const AP = {
  bg: '#f5f7fa',
  foreground: '#0b1e3d',
  primary: '#00b4d8',
  primaryForeground: '#0b1e3d',
  secondary: '#0b1e3d',
  secondaryForeground: '#ffffff',
  muted: '#e2e8f0',
  mutedForeground: '#64748b',
  accent: '#00b4d8',
  destructive: '#e53e3e',
  card: '#ffffff',
  cardForeground: '#0b1e3d',
  border: '#e2e8f0',
  input: '#ffffff',
  ring: '#00b4d8',
  chart1: '#00b4d8',
  chart2: '#0b1e3d',
  chart3: '#38a169', // succès (vert)
  chart4: '#e53e3e', // échec (rouge)
  chart5: '#f6ad55', // orange
  // Marques opérateurs mobile money.
  mtn: '#ffcc00',
  airtel: '#E11900',
} as const;

// Variantes « douces » (équivalent des /10 /20 Tailwind, alpha appliqué).
export const soft = {
  primary10: 'rgba(0,180,216,0.10)',
  primary20: 'rgba(0,180,216,0.20)',
  primary05: 'rgba(0,180,216,0.05)',
  secondary10: 'rgba(11,30,61,0.10)',
  secondary20: 'rgba(11,30,61,0.20)',
  chart3_10: 'rgba(56,161,105,0.10)',
  chart4_10: 'rgba(229,62,62,0.10)',
  chart4_20: 'rgba(229,62,62,0.20)',
  chart5_10: 'rgba(246,173,85,0.10)',
  destructive10: 'rgba(229,62,62,0.10)',
  mtn10: 'rgba(255,204,0,0.10)',
  mtn20: 'rgba(255,204,0,0.20)',
  muted50: 'rgba(226,232,240,0.5)',
} as const;

// Rayons (base --radius = 0.75rem = 12).
export const radius = {
  xs: 4, sm: 8, md: 10, lg: 12, xl: 16, xxl: 20, xxxl: 28, full: 999,
};

// Espacements courants (rem → px, 1rem = 16).
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40 };

export const font = {
  sans: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }),
  // Pas de police mono embarquée : on garde la police monospace système pour les montants.
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
};

// Ombres portées (iOS shadow* + Android elevation).
export const shadow = (elevation = 4, color = '#0b1e3d', opacity = 0.12) => ({
  shadowColor: color,
  shadowOffset: { width: 0, height: Math.round(elevation / 2) },
  shadowOpacity: opacity,
  shadowRadius: elevation,
  elevation,
});

// Format monétaire XAF : séparateur de milliers, sans décimales par défaut.
export function formatXAF(cents: number, withCents = false): string {
  const value = cents / 100;
  const whole = Math.trunc(value);
  const grouped = whole.toLocaleString('fr-FR').replace(/ /g, ',').replace(/\s/g, ',');
  if (!withCents) return grouped;
  const dec = Math.round((Math.abs(value) - Math.abs(whole)) * 100);
  return `${grouped}.${String(dec).padStart(2, '0')}`;
}
