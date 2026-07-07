export const C = {
  // Surfaces
  bg: '#f8f9ff',
  surface: '#ffffff',
  surfaceAlt: '#eff4ff',
  surfaceContainer: '#e5eeff',
  surfaceContainerLow: '#eff4ff',
  surfaceContainerHigh: '#dce9ff',
  surfaceContainerHighest: '#d3e4fe',
  border: '#c4c5da',

  // Text
  text: '#0b1c30',
  textVariant: '#434657',
  muted: '#747688',

  // Primary (bleu océan)
  primary: '#0035c5',
  primaryDark: '#001257',
  onPrimary: '#ffffff',

  // Secondary (teal)
  secondary: '#006a62',
  onSecondary: '#ffffff',
  secondaryContainer: '#57fae9',
  onSecondaryContainer: '#007168',

  // States
  error: '#ba1a1a',
  errorContainer: '#ffdad6',
  success: '#006a62',
  successBg: '#d2faf5',
  pending: '#b45309',
  pendingBg: '#fef3c7',
};

export const STATUS = {
  SUCCESSFUL: { label: 'Réussi',    color: C.success,  bg: C.successBg },
  PENDING:    { label: 'En attente', color: C.pending,  bg: C.pendingBg },
  FAILED:     { label: 'Échoué',    color: C.error,    bg: C.errorContainer },
  REJECTED:   { label: 'Rejeté',    color: C.error,    bg: C.errorContainer },
} as const;
