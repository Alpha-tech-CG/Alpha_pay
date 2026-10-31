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
4. Téléphone perdu : un super-administrateur réinitialise la double
   authentification de l'agent (écran **Personnel**) ; ses sessions sont fermées et
   il s'enrôle de nouveau à sa prochaine connexion.
5. Départ d'un agent : **Désactiver** dans l'écran Personnel (ses sessions sont
   fermées aussitôt). Les agents suivants se créent aussi depuis cet écran.

## Rôles

| Rôle | Peut |
|---|---|
| Support | Tout lire. Dépanner sans toucher à la configuration du client : vérifier un paiement auprès de l'opérateur, relancer une demande opérateur, renvoyer ou tester un webhook, écrire une note d'assistance. Aucune autre modification (refusée par l'API) |
| Conformité | Support + traiter les dossiers KYB, suspendre et réactiver un marchand, révoquer une clé API, couper un endpoint de webhook, déconnecter un membre |
| Super-administrateur | Tout : paliers, prix, packs de crédits, crédits d'un marchand, comptes du personnel, relance des files de tâches |

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

## Assistance client

Écran **Assistance** : une seule recherche à partir de ce que donne le client au
téléphone : référence de commande, numéro du payeur, identifiant de paiement ou de
webhook, préfixe de clé API (`ap_live_…`), nom du marchand. Un seul paiement trouvé
s'ouvre directement.

Le **parcours d'un paiement** montre : statut, montant, opérateur, référence
opérateur, motif d'échec ; l'historique des statuts (avec leur origine : callback,
relance du worker, back-office) ; les demandes envoyées à l'opérateur ; les callbacks
reçus ; les webhooks envoyés au marchand avec leur réponse HTTP.

Cas fréquents :

- **« Mon client a payé mais c'est encore en attente »** : *Vérifier auprès de
  l'opérateur*. Le statut confirmé par l'opérateur est appliqué (jamais un statut
  saisi à la main) ; le marchand et ses webhooks sont notifiés.
- **« La demande n'est jamais arrivée sur le téléphone »** : une demande opérateur en
  échec définitif (`DEAD`) se *relance* avec un motif.
- **« Le client a été remboursé ? »** : le parcours montre les remboursements (par
  la banque partenaire pour la carte, déclarés par le marchand pour le Mobile Money)
  et les litiges carte avec les preuves envoyées. Le remboursement se fait par le
  marchand, jamais par un agent : l'argent est sur son compte.
- **« Mon serveur n'a pas reçu le webhook »** : *Renvoyer* la livraison (même
  événement, même identifiant) ; dans l'onglet Développeurs, *Tester* l'endpoint. La
  réponse HTTP du serveur du client s'affiche.

## Fiche marchand

Depuis **Marchands** ou une recherche : un écran par marchand, à onglets.

- **Aperçu** : palier, crédits, volumes, opérateurs, dossier KYB ; suspension,
  palier et crédits (voir plus bas).
- **Paiements** : tous les paiements, filtrables par statut et par mode.
- **Développeurs** : appels API et taux d'erreur sur 24 h, clés (préfixe seulement,
  jamais le secret), endpoints de webhook, dernières livraisons, journal des 100
  derniers appels avec leur `Request-Id` (à demander au développeur du client).
  Conformité : *Révoquer* une clé publiée par erreur, *Couper* un endpoint qui
  boucle.
- **Messages** : SMS, WhatsApp et emails envoyés, destinataire masqué, erreur du
  fournisseur.
- **Équipe** : membres, rôle, dernière connexion, sessions actives (emails et
  numéros masqués). Conformité : *Déconnecter* un membre partout (téléphone perdu,
  compte compromis).
- **Journal** : notes d'assistance et toutes les actions sur ce marchand. Écrire une
  note après chaque appel (diagnostic, solution).

L'agent voit tout mais n'agit jamais à la place du client : pas de connexion « en tant
que » marchand.

## Marchands

Écran **Marchands** : recherche, puis **Fiche** (onglet Aperçu) : palier et statut d'abonnement,
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

## Santé de la plateforme

Écran **Santé plateforme**, rafraîchi toutes les 30 s : base de données, files de
tâches (en attente, en cours, programmées, en échec), demandes opérateur en échec
définitif, paiements live en attente depuis plus de 15 minutes, webhooks et messages
en souffrance, connexions opérateur, derniers rapprochements. Après une panne d'un
fournisseur, le super-administrateur *relance les échecs* d'une file (motif
obligatoire). Conduite à tenir : `RUNBOOK.md`.

## Journal d'audit

Écran **Journal d'audit** : toutes les actions de tous les auteurs (personnel,
utilisateurs marchands, clés API, système), filtrables par début d'action
(`support.`, `merchant.`, `auth.`…) et par auteur.

## Alertes d'exploitation

Toutes les 5 minutes, les indicateurs de l'écran Santé sont comparés à des seuils
(`OPS_ALERT_*`) ; ce qui dépasse part par email à `OPS_EMAIL`, une fois par heure au
plus pour un même problème : paiements live bloqués, demandes opérateur en échec,
files de tâches en échec ou Redis injoignable, taux d'échec d'un opérateur sur
l'heure, webhooks et messages en échec, litiges carte proches de l'échéance.
