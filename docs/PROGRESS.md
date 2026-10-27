# Avancement — AlphaPay V1

> Mis à jour à chaque fin de session. Plan détaillé : `docs/PLAN.md`.

## Session du 27 octobre 2026

### Fait
- Lecture du cahier des charges V1.
- Audit du dépôt → `docs/AUDIT.md` (suite `apps/api` : 68 suites, 405 tests verts).
- Plan par jalons → `docs/PLAN.md` (T-01 à T-105).
- Décisions initiales → `docs/DECISIONS.md` (D-001 à D-018).

### En cours
- S1 Socle : T-02 (nettoyage) et T-03 (retrait des modules hors périmètre) sont les prochaines tâches.

### Bloqué / en attente de Miche
- Rien de bloquant. Points à confirmer quand possible :
  - D-003 : suppression du code wallet/ledger/settlement/fees/partners/routing/currency/ussd.
  - D-005 : retrait de Clerk.
  - D-006 : modèle d'accès API par marchand (à valider avec MTN et Airtel).

### Prochaine étape
T-02 → T-03 → T-05 (interfaces fournisseurs + mocks) → T-07 (BullMQ) → T-08 (socle erreurs/logs/santé).

## Tableau de bord des jalons

| Jalon | Échéance | État |
|---|---|---|
| S1 Socle | 2 nov. | En cours (T-01 fait) |
| S3 M1, M9, M3 | 16 nov. | À faire |
| S5 M4, M5, M10, M2 | 30 nov. | À faire |
| S7 M6, M7, M8, M11 | 14 déc. | À faire |
| S8 M12, M13, gel | 21 déc. | À faire |
| S9 Recette, livraison | 27 déc. | À faire |
