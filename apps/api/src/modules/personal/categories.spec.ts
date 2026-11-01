import { guessCategory, normalizeLabel, suggestBudget } from './categories';

describe('catégorisation de l’espace particulier', () => {
  it('reconnaît les mots entiers, sans faux positif dans un mot plus long', () => {
    expect(guessCategory('Pharmacie du Plateau', 'OUT')).toBe('health');
    expect(guessCategory('Facture SNDE eau', 'OUT')).toBe('bills');
    expect(guessCategory('Supermarché Casino', 'OUT')).toBe('food');
    expect(guessCategory('Taxi Moungali', 'OUT')).toBe('transport');
    expect(guessCategory('Commande AliExpress', 'OUT')).toBe('online');
    expect(guessCategory('Médicaments', 'OUT')).toBe('health');
    expect(guessCategory('Kiosque Ndeko', 'OUT')).toBe('other');
  });

  it('classe les entrées : revenu, remboursement, transfert reçu', () => {
    expect(guessCategory('Salaire octobre', 'IN')).toBe('income');
    expect(guessCategory('Remboursement Marie', 'IN')).toBe('refund');
    expect(guessCategory('Transfert reçu', 'IN')).toBe('transfer_in');
  });

  it('normalise accents, casse et ponctuation', () => {
    expect(normalizeLabel('  Épicerie   CHEZ Mama-Ngoma ! ')).toBe('epicerie chez mama ngoma');
  });

  it('propose un budget de départ dont la somme reste proche du revenu', () => {
    const plan = suggestBudget(200000);
    expect(plan.find((p) => p.key === 'food')?.planned).toBe(50000);
    expect(plan.reduce((a, p) => a + p.planned, 0)).toBe(200000);
  });
});
