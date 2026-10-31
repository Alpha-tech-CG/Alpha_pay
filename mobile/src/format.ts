// Formats d'affichage (fr-FR, Brazzaville) et libellés des statuts publics de l'API.
import type { PaymentStatus } from '@/api';

export function money(amount: number | null | undefined, currency = 'XAF'): string {
  const n = Math.round(Number(amount ?? 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return currency ? `${n} ${currency}` : n;
}

export function dateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ago(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return dateTime(iso);
}

export const STATUS_LABEL: Record<PaymentStatus, string> = {
  en_attente: 'En attente',
  réussi: 'Réussi',
  échoué: 'Échoué',
  expiré: 'Expiré',
  annulé: 'Annulé',
};

export function statusTone(s: string): 'ok' | 'bad' | 'muted' {
  if (s === 'réussi') return 'ok';
  if (s === 'échoué' || s === 'expiré' || s === 'annulé') return 'bad';
  return 'muted';
}

export const OPERATOR_LABEL: Record<string, string> = { mtn: 'MTN MoMo', airtel: 'Airtel Money', card: 'Carte' };

export const LINK_STATE_LABEL: Record<string, string> = {
  actif: 'Actif',
  utilisé: 'Payé',
  expiré: 'Expiré',
  désactivé: 'Désactivé',
};
