# Avancement — AlphaPay V1

> Mis à jour à chaque fin de session. Plan détaillé : `docs/PLAN.md`. Branche de travail : `v1`.

## Session du 27 octobre 2026 (2) — Socle S1

### Fait
- **T-02** Nettoyage : anciennes docs → `docs/archive/`, prototypes `paybrain/` et `securite/` retirés, `tmp/` désindexé, `app.json`/`eas.json` parasites retirés.
- **T-03** Retrait du code qui détient ou fait transiter des fonds (D-003 validée par Miche) : modules `wallet`, `ledger`, `settlement`, `fees`, `partners`, `routing`, `currency`, `ussd` ; migration `18_remove_fund_holding` (+ `down.sql`) ; pages admin wallets/settlements ; variables d'environnement associées. Tests `apps/api` : 51 suites, 279 tests verts.
- **T-04** Gel : `alphapay-backend` et `prototype` exclus de build/lint/test ; `mobile/` et `apps/checkout` marqués gelés (`FROZEN.md`).
- **T-05** `packages/providers` : interfaces `MobileMoneyProvider`, `KycProvider`, `SmsProvider`, `WhatsAppProvider`, `EmailProvider`, `CardAcquirer` ; adaptateurs réels **MTN** et **Airtel** (identifiants par marchand, jetons en cache, anti-doublon par référence, retries) ; mocks pour chaque interface ; **suites de contrat communes** ; faux serveurs MTN/Airtel pour tester les adaptateurs réels sans réseau.
- Décisions D-019 à D-024.

### En cours
- Rien d'entamé au-delà de T-05.

### Bloqué / en attente de Miche
- D-006 : modèle d'accès API par marchand, à confirmer avec MTN et Airtel.
- D-022 : URL/chemins Airtel et environnement prod MTN Congo à valider dès réception des accès.

### Prochaine étape
T-06 (registre de fournisseurs piloté par la config, branchement des paiements, suppression de `packages/connectors`) → T-07 (BullMQ) → T-08 (erreurs, logs JSON, `/health` `/ready`) → T-09/T-10 (montants, téléphones) → T-11 (`livemode`) → T-12/T-13/T-14 (compose, CI, `.env.example`).

## Session du 27 octobre 2026 (1)
- Audit (`docs/AUDIT.md`), plan (`docs/PLAN.md`), décisions D-001 à D-018.

## Tableau de bord des jalons

| Jalon | Échéance | État |
|---|---|---|
| S1 Socle | 2 nov. | En cours — T-01 à T-05 faits ; T-06 à T-14 restants |
| S3 M1, M9, M3 | 16 nov. | À faire |
| S5 M4, M5, M10, M2 | 30 nov. | À faire |
| S7 M6, M7, M8, M11 | 14 déc. | À faire |
| S8 M12, M13, gel | 21 déc. | À faire |
| S9 Recette, livraison | 27 déc. | À faire |
