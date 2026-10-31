# Rapport : état du projet et chemin vers la production

État au 31 octobre 2026, branche `v1`, commit `c2defa6`. Livraison prévue le 27 décembre 2026.

## 1. Où en est le projet

Le code de la V1 (cahier des charges, modules M1 à M12) est terminé et fonctionne de
bout en bout avec les fournisseurs factices.

| Module | État |
|---|---|
| M1 Comptes (mot de passe + code, sessions révocables) | Fait |
| M2 KYB / KYC (dossier, pièces, revue au back-office) | Fait, KYC factice tant que Sumsub n'est pas signé |
| M3 Encaissement MTN / Airtel (statuts unifiés, relances, callbacks sécurisés) | Fait, sur sandbox et factice |
| M4 Liens de paiement, M5 QR de caisse, M6 Gérer (boutiques, caisses, cash, rapprochement, exports) | Fait |
| M7 Recouvrer (factures, relances, reçus), M8 Pack École | Fait |
| M9 Messages (SMS, WhatsApp, email, OTP, crédits) | Fait, fournisseurs factices |
| M10 Développeurs (clés, webhooks signés, journal, OpenAPI) | Fait |
| M11 Facturation (paliers, quota Gratuit, verrouillage serveur) | Fait, prix à saisir |
| M12 Back-office (rôles, OTP, KYB, marchands, assistance, santé, audit, personnel) | Fait |
| **M13 Carte bancaire** | **Squelette seulement, à construire (voir §3)** |

Qualité, vérifiée le 31 octobre :
- 321 tests unitaires et 103 tests d'intégration verts ;
- couverture de 88 % des lignes ;
- recette Playwright de deux parcours en CI ;
- `pnpm audit` sans alerte haute ni critique.

## 2. Ce qui manque pour la production

### 2.1 Bloquant, hors code (Miche)

1. **Avis juridique sur le modèle** : AlphaPay ne détient jamais les fonds. Sans cet
   avis, aucun mode live n'est ouvert au public.
2. **Accès production MTN MoMo Congo**, puis **Airtel Money** (sandbox, puis
   production) :
   - confirmer le modèle d'accès : un compte API par marchand, ou un compte partenaire
     avec sous-comptes (D-006) ;
   - valider les chemins d'API Airtel (D-022).
3. **VPS OVH** de préproduction et de production, avec :
   - le DNS des quatre domaines (`api`, `pay`, `app`, `admin`) ;
   - le stockage objet pour les sauvegardes.
4. **Révoquer les identifiants MTN sandbox** publiés dans l'historique du dépôt
   public.
5. **Contrats des fournisseurs** :
   - Sumsub (KYC) ;
   - Infobip (SMS et nom d'expéditeur) ;
   - Meta (vérification de l'entreprise et approbation des 8 modèles WhatsApp) ;
   - un fournisseur email (SPF, DKIM, DMARC) ;
   - Sentry.
6. **Partenaire d'acceptation carte** : voir §3.

### 2.2 Exploitation, à faire au déploiement (avec moi)

- Premier déploiement en préproduction, puis recette Playwright sur la préproduction.
- Sauvegardes :
  - clés `age` générées hors du serveur ;
  - cron installé ;
  - **première restauration vérifiée**.
- Premier agent du back-office et liste d'IP autorisées (`ADMIN_ALLOWED_IPS`).
- Prix des paliers et des packs saisis.
- Compte marchand d'AlphaPay (`ALPHAPAY_BILLING_MERCHANT_ID`).
- Sonde externe sur `/ready`.
- Mesures sur un vrai téléphone : QR en moins de 30 s, Vérif en moins de 5 s, web push.
- Test d'intrusion de base après la livraison.

### 2.3 Manques dans le code (en dehors de la carte)

| Manque | Pourquoi c'est important | Effort |
|---|---|---|
| **Remboursements** (total et partiel) | Inexistants pour tous les moyens de paiement. Indispensables pour la carte, et attendus pour MTN et Airtel (API de décaissement) | 4 à 6 j |
| **Litiges et rétrofacturations** (chargebacks) | Obligatoire avec la carte : suivi, pièces, délais, impact sur le marchand | 3 à 4 j |
| **Routage et frais branchés dans le flux réel** | Le choix de l'opérateur est codé en dur dans `payments.service` ; le moteur de routage et de frais existe mais n'est pas branché | 3 j |
| **Rapprochement des règlements carte** | Le rapprochement actuel ne lit que les relevés MTN et Airtel | 3 j |
| **Rotation des clés de chiffrement** (PII, secrets opérateurs) | Prévue après la V1 ; à faire avant un volume réel | 2 à 3 j |
| **Alertes d'exploitation** (paiements bloqués, files en échec, taux d'échec) envoyées à l'équipe | L'écran Santé les montre, mais personne n'est prévenu la nuit | 1 à 2 j |
| `joi@17` à passer en `^17.13.9` (ancien backend gelé) | Dernière exception de l'audit | 10 min, après le 1er novembre |
| Crédits consommés par les relances et les reçus (D-054) | Décision tarifaire en attente | 0,5 j après décision |

## 3. Carte bancaire : à prévoir dès l'ouverture

Les gens doivent payer en ligne : la carte doit donc être disponible dès le lancement.
Aujourd'hui, elle **n'est pas prête**. Le cahier des charges ne demandait qu'une
« préparation désactivée » (M13), et même cette préparation est incomplète.

### 3.1 Ce qui existe dans le code

- Une interface `CardAcquirer`, conçue autour d'une **page de paiement hébergée par
  le partenaire** : aucun numéro de carte chez AlphaPay, donc hors du gros de la norme
  PCI DSS.
- Un service et une page de test très sommaires, derrière `FEATURE_CARD_PAYMENTS=false`.

### 3.2 Ce qui ne va pas dans l'existant

- La carte n'est **pas un moyen de paiement du modèle** : l'énumération `Operator` ne
  contient pas `CARD`. Un paiement carte ne crée aucune transaction et n'apparaît ni
  dans les statistiques, ni dans Vérif, ni dans les reçus, les webhooks ou le
  rapprochement. Le critère d'acceptation M13 n'est donc pas rempli.
- La carte n'est proposée ni par `POST /v1/payments`, ni sur la page de paiement
  (liens, QR, factures).
- Le service n'implémente pas l'interface `CardAcquirer` :
  - aucune session n'est enregistrée ;
  - aucun webhook du partenaire n'est reçu ni vérifié ;
  - aucun statut n'est relu chez le partenaire ;
  - la « signature » est un simple hachage maison.
- La page de test insère des paramètres d'URL dans le HTML sans échappement (injection
  de script possible) et divise le montant par 100, ce qui est faux en XAF.

### 3.3 Ce qu'il faut construire

**A. Faisable tout de suite, sans partenaire, avec un acquéreur factice réaliste**
(environ 8 à 10 jours de travail) :

1. Ajouter la **carte au modèle de paiement** :
   - `CARD` dans l'énumération `Operator` (migration) ;
   - champs de la transaction renvoyés par le partenaire, jamais le numéro de carte :
     référence de session, marque, 4 derniers chiffres, résultat 3-D Secure.
2. Exposer la carte dans **`POST /v1/payments`** (`method: "card"`), qui renvoie un
   `redirect_url`, et dans le **SDK** et l'OpenAPI.
3. Ajouter un **bouton « Payer par carte »** sur la page de paiement (liens, QR,
   factures, frais d'école), avec des pages de retour « réussi » et « annulé ».
4. Recevoir les **webhooks du partenaire**, signés et vérifiés. Le statut est toujours
   relu chez le partenaire avant de passer à « réussi », comme pour MTN (D-021).
   Ajouter une relance par le worker pour les sessions sans réponse.
5. Ajouter une **connexion carte par marchand** dans « Comptes opérateur » (identifiants
   chiffrés), sur le même registre que MTN et Airtel.
6. Gérer les **remboursements** et les **litiges** carte (voir §2.3), et les montrer au
   back-office (onglet Paiements, actions motivées et auditées).
7. Ajouter le **rapprochement** des fichiers de règlement de l'acquéreur.
8. Mettre en place les **garde-fous anti-fraude** :
   - 3-D Secure obligatoire (géré par la page du partenaire) ;
   - plafonds par paiement et par jour, réglables au back-office ;
   - limitation des tentatives par carte et par adresse IP.
9. Écrire les **tests de contrat** de l'adaptateur (comme pour MTN et Airtel) et un
   parcours Playwright de paiement par carte.
10. Supprimer l'ancienne page de test et la remplacer par un acquéreur factice sûr.

Avec cela, la carte fonctionne de bout en bout en test. Brancher le vrai partenaire
devient alors l'écriture d'un **seul adaptateur** (2 à 4 jours selon son API).

**B. Dépend du partenaire (Miche)**

- **Choisir l'acquéreur.** Il faut un partenaire qui accepte Visa et Mastercard pour
  des marchands du Congo-Brazzaville en XAF, avec une page de paiement hébergée et
  3-D Secure.
  - Pistes à vérifier : les banques acquéreuses locales et les prestataires régionaux
    de la zone CEMAC. Je ne peux pas confirmer lesquels proposent une API adaptée :
    c'est à vérifier auprès d'eux.
  - Point clé du modèle : les fonds doivent être réglés **directement au marchand**
    par l'acquéreur. AlphaPay reste prestataire technique et ne détient rien. Un
    agrégateur qui encaisse pour le compte du marchand (comme CinetPay, retiré pour
    cette raison, D-012) remettrait en cause le modèle juridique.
- **Questions à poser au partenaire :**
  - contrat par marchand, ou contrat-cadre AlphaPay avec sous-marchands ;
  - délai d'ouverture d'un marchand ;
  - commissions ;
  - délai de règlement ;
  - format des fichiers de règlement ;
  - API de remboursement ;
  - processus de litige ;
  - environnement de test disponible.
- **Conformité PCI DSS** : avec une page hébergée, questionnaire SAQ A chaque année
  (le plus léger).
- **Avis juridique** : il doit couvrir aussi la carte.

### 3.4 Calendrier proposé

| Quand | Quoi |
|---|---|
| Novembre, semaines 1 et 2 | Partie A (carte de bout en bout avec l'acquéreur factice, remboursements, litiges) |
| Dès la signature | Adaptateur du vrai partenaire, essais en environnement de test |
| Décembre, 2 semaines avant le 27 | Paiement réel de faible montant, recette en préproduction |

Le risque principal n'est pas le code : c'est le **délai de signature** de
l'acquéreur, souvent long. Le démarcher dès maintenant.

## 4. Résumé

- **Code de la V1 : terminé**, sauf la carte.
- **Carte : environ 2 semaines de code** pour qu'elle soit prête dès l'ouverture, plus
  la signature d'un acquéreur, qui est le chemin critique.
- **Autres manques de code à combler avant un vrai volume** : remboursements, litiges,
  routage branché, alertes, rotation des clés.
- **Bloquants hors code** :
  - avis juridique ;
  - accès production MTN et Airtel ;
  - VPS ;
  - contrats Sumsub, Infobip, Meta et email ;
  - révocation des clés MTN publiées.
