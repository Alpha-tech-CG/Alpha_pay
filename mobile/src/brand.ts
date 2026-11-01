// Charte AlphaPay : bleu marine (confiance, fonds), jaune moutarde (action, mise en
// valeur), rouge bordeaux (marque, alertes). Contrastes vérifiés AA (4,5:1) pour le
// texte : moutarde seulement en fond (texte marine dessus), jamais en texte sur blanc.
import { Platform } from 'react-native';

export const B = {
  navy: '#0B1F3A',
  navy2: '#13294B',
  navy3: '#1E3A66',
  navySoft: '#E7ECF4',
  mustard: '#D4A017',
  mustardDeep: '#B8860B',
  mustardSoft: '#F7EBC6',
  burgundy: '#7A1F2B',
  burgundyDeep: '#5C1620',
  burgundySoft: '#F4E4E6',
  bg: '#F6F4EF',
  surface: '#FFFFFF',
  ink: '#0B1F3A',
  inkSoft: '#3A4A63',
  muted: '#667085',
  line: '#E4E1D9',
  lineSoft: '#EFEDE7',
  success: '#2E7D5B',
  successSoft: '#E3F2EA',
  warning: '#9A6B00',
  white: '#FFFFFF',
  onNavyMuted: 'rgba(255,255,255,0.72)',
} as const;

/** IBM Plex Sans embarquée (famille = nom du fichier, cf. app.config.js). */
export const F = {
  regular: 'IBMPlexSans_400Regular',
  medium: 'IBMPlexSans_500Medium',
  semibold: 'IBMPlexSans_600SemiBold',
  bold: 'IBMPlexSans_700Bold',
  mono: Platform.select({ ios: 'Menlo', default: 'monospace' }),
};

export const R = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };

/** Durées : courtes pour le retour tactile, plus longues pour les entrées d'écran. */
export const M = { press: 110, enter: 380, stagger: 55, hero: 650 };

export const shadow = (level: 1 | 2 | 3 = 1) => ({
  shadowColor: B.navy,
  shadowOffset: { width: 0, height: level * 2 },
  shadowOpacity: 0.06 + level * 0.03,
  shadowRadius: level * 5,
  elevation: level * 2,
});
