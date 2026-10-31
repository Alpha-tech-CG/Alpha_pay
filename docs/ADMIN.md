# Guide du back-office AlphaPay

Le back-office sert au personnel d'AlphaPay : valider les dossiers des marchands,
suivre les marchands, gérer les paliers et les prix, surveiller la plateforme.
Production : `https://admin.alphapay.cg`, accessible seulement depuis les adresses
déclarées dans `ADMIN_ALLOWED_IPS`. Local : http://localhost:5180.

## Connexion

1. Un super-administrateur crée le compte (première fois, sur le serveur) :
   `docker compose -f docker-compose.prod.yml --env-file infra/vps/vps.env exec api node dist/scripts/staff-bootstrap agent@alphapay.cg COMPLIANCE "Prénom Nom"`.
   Le mot de passe provisoire s'affiche une seule fois : le transmettre de vive voix
   ou par un canal chiffré, jamais par email.
2. À la première connexion : mot de passe, puis enrôlement d'une application
   d'authentification (Google Authenticator, Aegis…) en scannant le QR code.
3. Ensuite, chaque connexion demande le mot de passe **et** le code à 6 chiffres.
   5 codes faux bloquent le compte 15 minutes. Session de 8 heures.
4. Téléphone perdu : un super-administrateur réinitialise l'authentification de
   l'agent (`POST /internal/staff/users/:id/reset-totp`, pas encore d'écran) ;
   l'agent s'enrôle de nouveau à sa prochaine connexion.

## Rôles

| Rôle | Peut |
|---|---|
| Support | Tout lire : dossiers, marchands, paliers, supervision. Aucune modification (refusée par l'API) |
| Conformité | Support + traiter les dossiers KYB, suspendre et réactiver un marchand |
| Super-administrateur | Tout : paliers, prix, packs de crédits, crédits d'un marchand, comptes du personnel |

Toute action est inscrite au journal d'audit (qui, quoi, quand, adresse IP), qui ne
peut être ni modifié ni supprimé.

## Traiter un dossier KYB

Écran **Dossiers KYB**. La file montre les dossiers `soumis` puis `en revue`.

1. **Prendre en revue** : le dossier passe `en revue`, à votre nom (le marchand est prévenu).
2. Vérifier les informations de l'entreprise : raison sociale, forme juridique,
   RCCM, NIU, adresse, secteur, dirigeant.
3. Ouvrir chaque pièce (**Voir**) : extrait RCCM, attestation NIU, pièce d'identité du
   dirigeant. Les liens expirent après 5 minutes ; chaque consultation est tracée.
   Contrôler la cohérence : même raison sociale et même RCCM partout, pièce
   d'identité lisible, en cours de validité, au nom du dirigeant déclaré.
4. Lire le résultat de la vérification d'identité (KYC) du fournisseur.
5. Décider, avec un motif écrit pour toute décision autre qu'une approbation :
   - **Approuver** : ouvre le mode live (clés `ap_live_`, paiements réels).
     Si le KYC n'est pas « approuvé » (par exemple sans contrat Sumsub), cocher la
     **dérogation** et écrire comment l'identité a été vérifiée à la main.
   - **Demander des compléments** : le marchand corrige et soumet de nouveau.
     Motif précis : « Extrait RCCM illisible, merci de déposer un scan net ».
   - **Refuser** : définitif pour ce dossier. Motif obligatoire.
6. Le marchand est notifié par email (à défaut SMS) de chaque changement d'état.

Ne jamais approuver un dossier dont le compte Mobile Money du marchand ne serait pas
à son nom : l'argent doit arriver sur **son** compte (contrainte fondatrice).

## Marchands

Écran **Marchands** : recherche, puis **Fiche** : palier et statut d'abonnement,
volumes (paiements live), crédits de messages, connexions opérateur, dossier KYB.

- **Suspendre** (Conformité) : motif obligatoire. Les clés API du marchand sont
  refusées, ses QR de caisse et ses liens de paiement n'encaissent plus ; son tableau
  de bord reste consultable et ses données sont conservées. **Réactiver** avec motif.
- **Changer de palier** (Super-administrateur) : immédiat, motif obligatoire (geste
  commercial, client « Établissement » sur devis…).
- **Ajuster les crédits** (Super-administrateur) : ajout ou retrait, motif
  obligatoire ; l'écriture s'ajoute au registre (jamais de modification en place).

## Paliers, prix et packs

Écran **Paliers et prix** (Super-administrateur) : prix mensuel, modules inclus,
limites de boutiques et de caisses, crédits inclus, et packs de crédits.

- Un changement de prix s'applique **sans déploiement** et vaut pour les factures
  suivantes ; les factures déjà émises gardent leur montant.
- Un palier payant à 0 XAF est affiché « Sur devis » et ne peut pas être souscrit par
  le marchand : fixer son prix avant de l'ouvrir.
- Un impayé d'abonnement passe en période de grâce (`BILLING_GRACE_DAYS`), puis les
  modules payants en lecture seule. Les paiements des clients du marchand ne sont
  **jamais** bloqués.

## Supervision

Écran **Supervision** : marchands actifs, paiements des dernières 24 h, taux
d'échec, dossiers KYB en attente ; paiements en échec par opérateur, messages en échec
par fournisseur, webhooks marchands en échec. Conduite à tenir : `RUNBOOK.md`,
sections 6 et 7.
