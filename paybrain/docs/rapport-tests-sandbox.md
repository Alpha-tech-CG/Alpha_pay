# Rapport de tests sandbox — PayBrain
Plan de travail, Phase 2, tâche 2.6 — Tests d'intégration sandbox

**Date** : 2026-06-16T13:05:22.396Z
**Total transactions simulées** : 50
**Réussies** : 33
**Échouées** : 17
**Taux de succès** : 66.0%
**Durée moyenne par requête** : 1508 ms

## Diagnostic des échecs

Tous les échecs concernent des numéros routés vers l'opérateur **Airtel** (préfixes 055/056/057/058/074/075/076/077).
Les transactions routées vers **MTN** réussissent à 100% (33/33 testées).

Cause racine identifiée dans les logs API : l'appel `POST /auth/oauth2/token` du connecteur Airtel
échoue avec `400 invalid_client — Invalid client authentication`. Les clés API Airtel sandbox
configurées sont donc invalides ou des valeurs de remplacement — le connecteur n'a jamais été
exercé contre un vrai compte sandbox Airtel Africa (cf. tâche 1.2 et 3.3 du plan de travail).

**Action requise avant de clôturer Phase 2/Phase 3** : générer de vraies clés sandbox sur
developers.airtel.africa et les renseigner dans `.env` (`AIRTEL_CLIENT_ID`, `AIRTEL_CLIENT_SECRET`
ou équivalent), puis relancer cette simulation pour confirmer 50/50.

## Détail des échecs
- #1 (242056100037) : Internal server error
- #5 (242075100185) : Internal server error
- #7 (242077100259) : Internal server error
- #11 (242058100407) : Internal server error
- #13 (242075100481) : Internal server error
- #17 (242056100629) : Internal server error
- #19 (242058100703) : Internal server error
- #23 (242077100851) : Internal server error
- #25 (242056100925) : Internal server error
- #29 (242075101073) : Internal server error
- #31 (242077101147) : Internal server error
- #35 (242058101295) : Internal server error
- #37 (242075101369) : Internal server error
- #41 (242056101517) : Internal server error
- #43 (242058101591) : Internal server error
- #47 (242077101739) : Internal server error
- #49 (242056101813) : Internal server error

## Échantillon des transactions réussies (10 premières)
- #2 — MTN — PENDING — réf. 9f01b5cf-1fe7-4986-b155-69b9733b1e4b
- #3 — MTN — PENDING — réf. ad175c11-3cc5-4260-8733-89fa0bb23909
- #4 — MTN — PENDING — réf. 1db4d143-6781-4e53-9ddd-aed70e28bcac
- #6 — MTN — PENDING — réf. 2946837f-35fd-4e9c-98fc-76d646250d2c
- #8 — MTN — PENDING — réf. cb6de985-e2dd-4f9d-b166-2b2c7693930b
- #9 — MTN — PENDING — réf. 8450dbce-04e6-40e3-83b6-654dd288602d
- #10 — MTN — PENDING — réf. 3971fe04-187c-4db0-9a8d-b03c30f2496b
- #12 — MTN — PENDING — réf. b6962628-2fd1-4947-98f5-444a7b000db9
- #14 — MTN — PENDING — réf. 34368a86-be2e-4de8-a05a-2abbd2755aa3
- #15 — MTN — PENDING — réf. aa0216d0-06ef-4dda-9d4e-4978e8627813

---
Critère de passage Phase 3 (extrait du plan) : *50 transactions sandbox réussies documentées + dashboard fonctionnel + zéro erreur sur les callbacks.*
