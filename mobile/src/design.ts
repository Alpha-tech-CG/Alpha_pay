// Tokens des écrans marchand / développeur, alignés sur le design « banque » (src/uc.ts) :
// blanc, encre, teal pour l'action, rouge de marque, rayons serrés, ombres plates.
// Utilisés par les écrans client restylés — indépendant du système de thèmes
// commutables (@/theme) pour une reproduction fidèle des maquettes.
import { Platform } from 'react-native';

export const AP = {
  bg: '#FFFFFF',
  foreground: '#262626',
  primary: '#00798C',
  primaryForeground: '#FFFFFF',
  secondary: '#262626',
  secondaryForeground: '#ffffff',
  muted: '#E3E3E3',
  mutedForeground: '#6E6E6E',
  accent: '#00798C',
  destructive: '#E2001A',
  card: '#ffffff',
  cardForeground: '#262626',
  border: '#E3E3E3',
  input: '#ffffff',
  ring: '#00798C',
  chart1: '#00798C',
  chart2: '#262626',
  chart3: '#3A7D44', // succès (vert)
  chart4: '#E2001A', // échec (rouge)
  chart5: '#C98A2B', // orange
  // Marques opérateurs mobile money.
  mtn: '#ffcc00',
  airtel: '#E11900',
} as const;

// Variantes « douces » (équivalent des /10 /20 Tailwind, alpha appliqué).
export const soft = {
  primary10: 'rgba(0,121,140,0.10)',
  primary20: 'rgba(0,121,140,0.20)',
  primary05: 'rgba(0,121,140,0.05)',
  secondary10: 'rgba(38,38,38,0.08)',
  secondary20: 'rgba(38,38,38,0.16)',
  chart3_10: 'rgba(58,125,68,0.10)',
  chart4_10: 'rgba(226,0,26,0.08)',
  chart4_20: 'rgba(226,0,26,0.16)',
  chart5_10: 'rgba(246,173,85,0.10)',
  destructive10: 'rgba(226,0,26,0.08)',
  mtn10: 'rgba(255,204,0,0.10)',
  mtn20: 'rgba(255,204,0,0.20)',
  muted50: '#F4F4F4',
} as const;

// Rayons (base --radius = 0.75rem = 12).
export const radius = {
  xs: 3, sm: 4, md: 6, lg: 6, xl: 8, xxl: 10, xxxl: 12, full: 999,
};

// Espacements courants (rem → px, 1rem = 16).
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40 };

export const font = {
  sans: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }),
  // Pas de police mono embarquée : on garde la police monospace système pour les montants.
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
};

// Ombres portées (iOS shadow* + Android elevation).
// Design banque : surfaces plates, l'ombre reste à peine perceptible.
export const shadow = (elevation = 4, color = '#000000', opacity = 0.12) => ({
  shadowColor: color,
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: Math.min(opacity, 0.06),
  shadowRadius: 2,
  elevation: Math.min(elevation, 1),
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
