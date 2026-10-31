/**
 * Préproduction (§10.5) : même image et NODE_ENV=production que la production,
 * déclarée par DEPLOYMENT_ENV=preproduction. Elle seule peut servir les pages
 * des fournisseurs factices (KYC, carte) pour la recette ; jamais la production.
 */
export function isPreproduction(): boolean {
  return process.env.DEPLOYMENT_ENV === 'preproduction';
}

/** Pages de test des fournisseurs factices : hors production, ou en préproduction. */
export function mockPagesAllowed(): boolean {
  return process.env.NODE_ENV !== 'production' || isPreproduction();
}
