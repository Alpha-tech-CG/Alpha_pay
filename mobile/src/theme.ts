// Identité « Lumina » émeraude, alignée sur le dashboard web.
export const C = {
  bg: '#f7f9f8',
  surface: '#ffffff',
  surfaceAlt: '#ecf6f1',
  border: '#e6ece9',
  text: '#151c27',
  muted: '#5c6b63',
  primary: '#059669',
  primaryDark: '#047857',
  primaryText: '#ffffff',
  successBg: '#ecfdf5',
  success: '#047857',
  pending: '#b45309',
  pendingBg: '#fef3c7',
  error: '#e11d48',
  errorBg: '#ffe4e6',
};

export const STATUS = {
  SUCCESSFUL: { label: 'Réussi', color: C.success, bg: C.successBg },
  PENDING: { label: 'En attente', color: C.pending, bg: C.pendingBg },
  FAILED: { label: 'Échoué', color: C.error, bg: C.errorBg },
  REJECTED: { label: 'Rejeté', color: C.error, bg: C.errorBg },
} as const;
