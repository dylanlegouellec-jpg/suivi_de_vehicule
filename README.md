# AutoSuivi

PWA de suivi de véhicules pensée pour l'iPhone (Safari, installée sur l'écran d'accueil) : factures et
documents (PDF / photo avec OCR), historique, entretiens et rappels, carburant, statistiques, sauvegarde.

**100 % local et gratuit** : les données restent dans le navigateur (IndexedDB), aucun serveur, aucune clé API,
aucune télémétrie. L'app fonctionne hors ligne.

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

## Déploiement sur Vercel (gratuit)

1. Poussez le dépôt sur GitHub.
2. Sur [vercel.com](https://vercel.com) : **Add New → Project**, importez le dépôt.
3. Les réglages sont détectés (Vite) : *Build Command* `npm run build`, *Output Directory* `dist`.
   `vercel.json` ajoute la réécriture vers `index.html`.
4. Déployez. Le HTTPS est fourni par Vercel : il est **obligatoire** pour le service worker et l'installation.

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
src/screens/       écrans ; src/components/ composants partagés
```

La logique métier est séparée de l'UI et couverte par les tests (`*.test.ts`) : `parseInvoice` (24 cas),
échéances et contrôle technique, consommation, statistiques, sauvegarde/fusion/CSV.

## Limites connues

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
- **Un seul appareil** : pas de synchronisation entre appareils ; utilisez la sauvegarde/import pour transférer.
