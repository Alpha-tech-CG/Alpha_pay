// Tokens du design « banque » (inspiré de l'app UniCredit) pour les écrans client.
// Rouge de marque, liens/états actifs en teal, typo condensée, listes à séparateurs.
import { Platform } from 'react-native';
import type { Palette } from '@/theme';

export const UC = {
  red: '#E2001A',
  redDark: '#B30015',
  teal: '#00798C',
  tealSoft: '#C7DFE5', // bouton « Confirmer » désactivé
  ink: '#262626',
  inkSoft: '#4D4D4D',
  muted: '#6E6E6E',
  line: '#BDBDBD',
  lineSoft: '#E3E3E3',
  bg: '#FFFFFF',
  bgGrey: '#F4F4F4',
  dark: '#2B2B2B',
  green: '#3A7D44',
  white: '#FFFFFF',
  // Couleurs des tuiles du carrousel d'accueil.
  slate: '#93AFB9',
  taupe: '#7B6B63',
  sage: '#8FA58C',
  sand: '#C9B8A3',
} as const;

// Police condensée (Roboto Condensed sur Android) : donne le look « banque » des titres.
export const ucFont = {
  condensed: Platform.select({ android: 'sans-serif-condensed', ios: 'AvenirNextCondensed-DemiBold', default: undefined }),
  regular: Platform.select({ android: 'sans-serif-condensed', ios: 'AvenirNextCondensed-Regular', default: undefined }),
};

// Découpe un montant (centimes) en partie entière groupée + décimales, format fr.
export function splitAmount(cents: number): { sign: string; int: string; dec: string } {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.trunc(abs / 100);
  const dec = String(abs % 100).padStart(2, '0');
  const int = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return { sign, int, dec };
}

// Palette du design banque au format du thème commutable (écrans d'authentification).
export const UC_PALETTE: Palette = {
  bg: UC.bg, surface: UC.white, surfaceAlt: UC.bgGrey,
  surfaceContainer: UC.bgGrey, surfaceContainerLow: UC.bgGrey, surfaceContainerHigh: UC.lineSoft, surfaceContainerHighest: UC.line,
  border: UC.line, text: UC.ink, textVariant: UC.inkSoft, muted: UC.muted,
  primary: UC.teal, primaryDark: '#005E6D', primarySoft: 'rgba(0,121,140,0.10)', onPrimary: UC.white,
  secondary: UC.ink, onSecondary: UC.white, secondaryContainer: UC.bgGrey, onSecondaryContainer: UC.ink,
  error: UC.red, errorContainer: 'rgba(226,0,26,0.08)', success: UC.green, successBg: 'rgba(58,125,68,0.10)',
  pending: '#B7791F', pendingBg: 'rgba(183,121,31,0.12)',
};
