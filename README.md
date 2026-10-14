# AutoSuivi

PWA de suivi de véhicules pensée pour l'iPhone (Safari, installée sur l'écran d'accueil) : factures et
documents (PDF / photo avec OCR), historique, entretiens et rappels, carburant, statistiques, sauvegarde.

**Deux modes, au choix :**

- **Sans compte (par défaut)** : 100 % local et gratuit. Les données restent dans le navigateur (IndexedDB), aucun
  serveur, aucune clé API, aucune télémétrie. L'app fonctionne hors ligne.
- **Avec un compte** : les données se synchronisent entre vos appareils et un véhicule peut être partagé avec d'autres
  personnes. L'app reste *local d'abord* : elle fonctionne hors ligne et synchronise dès que le réseau revient.
  Le serveur est un Cloudflare Worker de votre propre compte (base **D1** + stockage **R2**), sans service tiers.

## Installation et lancement

Prérequis : Node.js 20+.

```bash
npm install
npm run dev        # serveur de développement (http://localhost:5173)
npm test           # tests unitaires (Vitest)
npm run build      # vérification TypeScript + build de production dans dist/
npm run preview    # sert le build (http://localhost:4173), nécessaire pour tester le mode hors ligne
```

`npm run dev` et `npm run build` copient d'abord les ressources OCR (moteur Tesseract et langue française)
dans `public/tesseract/` (dossier généré, non versionné), pour que l'OCR n'appelle aucun CDN.

## Déploiement sur Cloudflare (gratuit)

`wrangler.jsonc` déclare le Worker (`worker/index.ts`), les fichiers statiques (`dist/`, en application monopage),
la base **D1** `autosuivi` (binding `DB`) et le bucket **R2** `autosuivi-blobs` (binding `BLOBS`).

1. Poussez le dépôt sur GitHub.
2. Cloudflare → **Workers & Pages → Create → Import a repository**, puis choisissez le dépôt.
   Réglages : *Build command* `npm run build`, *Deploy command* `npx wrangler deploy` (valeur par défaut).
   Le nom du Worker doit correspondre à `name` dans `wrangler.jsonc`.
3. Ressources (une seule fois) :
   - **R2** : activez-le dans le tableau de bord (R2 Object Storage ; l'offre gratuite donne 10 Go, une carte bancaire
     peut être demandée) puis créez le bucket : `npx wrangler r2 bucket create autosuivi-blobs`.
   - **D1** : `npx wrangler d1 create autosuivi`, puis copiez le `database_id` obtenu dans `wrangler.jsonc`.
   - Les tables sont créées **automatiquement** au premier appel de l'API (migrations versionnées dans `worker/db.ts`).
4. Déployez : chaque push sur `main` redéploie. Le site est servi en HTTPS sur `*.workers.dev` ;
   le HTTPS est **obligatoire** pour le service worker, l'installation et les cookies de session.

En ligne de commande : `npm run build && npx wrangler deploy` (après `npx wrangler login`).

### Développer avec l'API en local

```bash
npm run dev:api      # build + wrangler dev : app + API sur http://localhost:8787 (D1 et R2 simulés, données dans .wrangler/state)
npm run test:api     # tests d'intégration de l'API (le serveur ci-dessus doit tourner : API_URL=http://localhost:8787)
```

Sans compte, `npm run dev` suffit (l'API est alors proxifiée vers `localhost:8787` si elle tourne).

> Changer d'adresse (ou d'hébergeur) change l'origine : IndexedDB repart de zéro. Exportez une sauvegarde
> depuis l'ancienne adresse (Réglages) et importez-la sur la nouvelle, ou connectez-vous à votre compte.

## Installer sur l'écran d'accueil de l'iPhone

1. Ouvrez l'adresse du site dans **Safari** (pas dans une autre app).
2. Touchez **Partager** → **Sur l'écran d'accueil** → **Ajouter**.
3. Lancez AutoSuivi depuis l'icône : l'app s'ouvre en plein écran.
4. Ouvrez-la une fois avec du réseau et faites une première analyse de document : les ressources OCR (~4 Mo)
   sont alors mises en cache et l'OCR fonctionne ensuite hors ligne.

## Structure

```
src/db/            Dexie : schéma versionné, enregistrements, sauvegarde/import
src/lib/parsing/   parseInvoice(text) : extraction par règles (regex) + confiance par champ
src/lib/extract/   pipeline PDF (pdf.js) / image (redimensionnement, contraste) / OCR (tesseract.js, lazy)
src/lib/reminders/ échéances par date et km, règle du contrôle technique
src/lib/stats/     consommation L/100 km, coûts, répartitions
src/lib/backup/    format de sauvegarde, validation, fusion, rappel
src/lib/export/    CSV, carnet d'entretien PDF (jsPDF), partage de fichier
src/sync/          client de synchronisation : API, moteur (envoi/réception/conflits), session et compte
worker/            API Cloudflare Worker : comptes, synchronisation (D1), pièces jointes (R2), partage
src/screens/       écrans ; src/components/ composants partagés
```

La logique métier est séparée de l'UI et couverte par les tests (`*.test.ts`) : `parseInvoice` (24 cas),
échéances et contrôle technique, consommation, statistiques, sauvegarde/fusion/CSV.

## Comptes, synchronisation et partage

- **Compte** : e-mail + mot de passe (haché PBKDF2, jamais stocké en clair). Aucun e-mail n'est envoyé : à la création,
  un **code de récupération** est affiché une seule fois ; il sert à réinitialiser le mot de passe. Sessions par cookie
  `HttpOnly`/`Secure`/`SameSite=Lax`, protection CSRF par contrôle de l'origine, limitation des tentatives.
- **Synchronisation** : chaque enregistrement a un identifiant global et une date de modification ; en cas de
  modification simultanée, **la plus récente gagne** (les horloges des appareils doivent être à peu près justes).
  Les suppressions sont propagées. Les photos et documents sont envoyés séparément (15 Mo max par fichier, 300 Mo par compte)
  et téléchargés à la demande sur les autres appareils.
- **Partage** : le propriétaire d'un véhicule crée un **code d'invitation** à usage unique (7 jours) avec le droit
  « peut modifier » ou « lecture seule ». Le code se transmet par n'importe quel canal et se saisit dans
  Réglages → Compte → Rejoindre un véhicule. Le propriétaire peut retirer un membre ; un membre peut quitter.
  (Pas d'invitation par e-mail : les adresses ne sont pas vérifiées, un code évite qu'un tiers ne reçoive l'accès à votre place.)
- **Données de l'appareil** : si un autre compte se connecte sur un appareil qui contient encore les données d'un compte
  précédent, l'app demande d'effacer l'appareil au lieu de mélanger les données.
- **Suppression du compte** : efface les données en ligne ; les véhicules partagés sont transférés à un autre membre s'il y en a un.

## Limites connues

- **Avec un compte** : pas de vérification d'adresse e-mail, pas de « mot de passe oublié » par e-mail (code de
  récupération uniquement). Si vous perdez à la fois le mot de passe et le code, le compte n'est pas récupérable.
- **Conflits** : la dernière modification gagne, sans fusion champ par champ.
- **Un fichier non téléchargé** (document venu d'un autre appareil) nécessite du réseau la première fois.

- **Stockage iOS** : Safari peut vider les données des sites peu utilisés. L'app demande le stockage persistant
  (non garanti sur iOS) et rappelle de **sauvegarder au moins tous les 30 jours** (Réglages → Exporter).
- **Pas d'accès aux fichiers de l'iPhone** : import uniquement via le sélecteur de fichiers ou l'appareil photo.
  Pas de Web Share Target, de surveillance de dossier ni de tâche en arrière-plan.
- **Pas de notifications push** : les rappels s'affichent à l'ouverture de l'app (bandeau « À faire » et badge).
- **OCR** : la qualité dépend de la photo (bien éclairée, à plat, nette). Tout champ extrait doit être vérifié ;
  rien n'est enregistré sans validation. Seul le français est reconnu. Les PDF scannés : seule la 1re page passe à l'OCR.
- **Première utilisation de l'OCR** : nécessite du réseau (téléchargement des ressources depuis votre propre site, une seule fois).
- **Contrôle technique** : règle des véhicules particuliers (4 ans puis tous les 2 ans). Utilitaires, motos et
  véhicules de collection ont des règles différentes, non gérées.
- **Coût au km** : calculé sur l'écart entre le plus petit et le plus grand kilométrage relevé dans la période.
- **Sauvegarde JSON** : les pièces jointes sont encodées en base64 (fichier ~35 % plus lourd). Avec beaucoup de
  photos, l'export peut être lent ou limité par la mémoire de l'appareil.
- **Sans compte** : pas de synchronisation entre appareils ; utilisez la sauvegarde/import pour transférer.
