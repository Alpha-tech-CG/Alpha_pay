// Catégories et enveloppes par défaut de l'espace particulier (D-065), adaptées au
// contexte local : marché, taxi, E2C / SNDE, frais scolaires, achats en ligne.

export interface CategoryDef {
  key: string;
  name: string;
  icon: string;
  /** Part du revenu proposée au premier budget (somme = 100). */
  share: number;
  keywords: string[];
}

export const CATEGORIES: CategoryDef[] = [
  { key: 'food', name: 'Nourriture', icon: 'shopping-cart', share: 25, keywords: ['supermarche', 'marche', 'restaurant', 'resto', 'boulangerie', 'alimentation', 'epicerie', 'courses', 'casino', 'park n shop', 'boucherie', 'poissonnerie', 'maquis', 'snack'] },
  { key: 'transport', name: 'Transport', icon: 'car', share: 10, keywords: ['taxi', 'bus', 'carburant', 'essence', 'gasoil', 'station', 'total', 'moto', 'yango', 'transport', 'parking', 'peage'] },
  { key: 'bills', name: 'Loyer et factures', icon: 'home', share: 20, keywords: ['loyer', 'electricite', 'e2c', 'snde', 'eau', 'internet', 'canal', 'facture', 'abonnement', 'wifi', 'credit telephone'] },
  { key: 'health', name: 'Santé', icon: 'shield-check', share: 5, keywords: ['pharmacie', 'clinique', 'hopital', 'medicament', 'consultation', 'laboratoire', 'docteur', 'sante'] },
  { key: 'school', name: 'École', icon: 'calendar', share: 10, keywords: ['ecole', 'scolarite', 'lycee', 'college', 'universite', 'fournitures', 'inscription', 'frais scolaires', 'cours'] },
  { key: 'leisure', name: 'Loisirs', icon: 'shapes', share: 5, keywords: ['cinema', 'bar', 'sortie', 'concert', 'jeu', 'boite', 'match', 'loisir', 'netflix', 'spotify'] },
  { key: 'online', name: 'Achats en ligne', icon: 'shopping-bag', share: 5, keywords: ['aliexpress', 'amazon', 'jumia', 'shein', 'temu', 'ebay', 'en ligne'] },
  { key: 'transfers', name: 'Transferts', icon: 'send', share: 5, keywords: ['envoi', 'transfert', 'famille', 'aide'] },
  { key: 'savings', name: 'Épargne', icon: 'piggy-bank', share: 15, keywords: ['epargne', 'tontine'] },
];

/** Catégories d'entrées d'argent (hors enveloppes). */
export const INCOME_CATEGORIES = [
  { key: 'income', name: 'Revenus' },
  { key: 'refund', name: 'Remboursement' },
  { key: 'transfer_in', name: 'Transfert reçu' },
];

export const CATEGORY_KEYS = new Set([...CATEGORIES.map((c) => c.key), ...INCOME_CATEGORIES.map((c) => c.key), 'other']);

export function categoryName(key: string): string {
  return CATEGORIES.find((c) => c.key === key)?.name ?? INCOME_CATEGORIES.find((c) => c.key === key)?.name ?? 'Autre';
}

/** Libellé normalisé : minuscules, sans accents ni ponctuation (clé des règles apprises). */
export function normalizeLabel(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

/** Catégorie proposée par mots-clés ; `other` si rien ne correspond. */
export function guessCategory(label: string, direction: 'IN' | 'OUT'): string {
  const n = normalizeLabel(label);
  if (direction === 'IN') return /rembours/.test(n) ? 'refund' : /transfert|envoi|recu de/.test(n) ? 'transfer_in' : 'income';
  // Mots entiers (ou début de mot) : « plateau » ne doit pas déclencher « eau ».
  const words = n.split(' ');
  const padded = ` ${n} `;
  for (const c of CATEGORIES) {
    if (c.keywords.some((k) => (k.includes(' ') ? padded.includes(` ${k} `) : words.some((w) => w.startsWith(k))))) return c.key;
  }
  return 'other';
}

/** Premier budget proposé à partir du revenu (arrondi à 500 F). */
export function suggestBudget(income: number) {
  return CATEGORIES.map((c) => ({ key: c.key, name: c.name, icon: c.icon, planned: Math.round((income * c.share) / 100 / 500) * 500 }));
}
