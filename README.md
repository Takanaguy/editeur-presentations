# Éditeur de présentations

Éditeur de présentations dans le navigateur, dans l'esprit de PowerPoint : on compose des diapositives avec du texte, des rectangles et des images, on les réorganise, on les présente en plein écran, et on les enregistre dans un fichier JSON ou on les exporte en PDF ou en PowerPoint. Tout tourne côté client, sans serveur ni compte.

Ce projet fait partie du dépôt du portfolio de Tanguy Horard, dans le sous-dossier `slide-editor/`. Il est indépendant du portfolio (son propre `package.json`).

## Capture d'écran

> **Capture à ajouter : `docs/screenshots/editeur.png`**
>
> Le dossier `docs/screenshots/` est prêt (il contient un fichier `.gitkeep`). Quand les images existeront, on les ajoutera ici avec la syntaxe Markdown habituelle. Captures à prévoir :
>
> 1. Vue d'ensemble de l'éditeur (vignettes à gauche, diapositive au centre, propriétés à droite) : `docs/screenshots/editeur.png`
> 2. Panneau de propriétés avec un élément sélectionné (poignées visibles) : `docs/screenshots/proprietes.png`
> 3. Mode présentation en plein écran : `docs/screenshots/presentation.png`
> 4. Glisser d'une vignette, avec la barre d'insertion visible : `docs/screenshots/glisser-vignette.png`

## Fonctionnalités

**Diapositives**
- Mise en page en trois zones : vignettes à gauche, zone d'édition au centre, panneau de propriétés à droite.
- Ajouter, supprimer, dupliquer une diapositive.
- Réordonner : boutons Monter / Descendre, ou glisser une vignette à la souris (une barre indique la position d'arrivée).

**Éléments**
- Trois types : texte, rectangle, image.
- Une image s'ajoute par adresse (URL http ou https) ou depuis un fichier local (2 Mo au maximum, intégré au fichier de la présentation sous forme de data URL).
- Déplacement à la souris et redimensionnement par 8 poignées (4 coins, 4 côtés). L'élément reste toujours dans la diapositive.
- Édition du texte en ligne par double-clic.
- Dupliquer un élément (bouton ou Ctrl+D).
- Déplacer l'élément sélectionné aux flèches du clavier (1 unité, 10 avec Maj).

**Panneau de propriétés**
- Texte : gras, italique, alignement (gauche, centre, droite), taille de police, couleur du texte, fond optionnel et sa couleur.
- Rectangle : couleur de remplissage.
- Image : texte alternatif.
- Tous les éléments : opacité, ordre d'empilement (premier plan, avancer, reculer, arrière-plan).
- Rappel en lecture seule de la position et de la taille.

**Historique et fichiers**
- Annuler / rétablir, sur 50 actions.
- Mode présentation : diapositive plein écran, navigation au clavier ou au clic.
- Export de la présentation en fichier JSON, import d'un fichier JSON (validé, annulable).
- Export en PDF (via l'impression du navigateur : choisir « Enregistrer au format PDF »).
- Export PowerPoint (.pptx) : un vrai fichier modifiable (zones de texte, formes, images), qui s'ouvre dans PowerPoint, LibreOffice Impress, Google Slides et Keynote. Les images sont converties en PNG si besoin (PowerPoint ne lit pas le WebP), l'opacité devient la transparence PowerPoint, et les cas qui n'ont pas pu être traduits (image distante bloquée, couleur inconnue) sont listés dans le message de fin d'export.
- Titre de la présentation éditable (il donne aussi le nom du fichier exporté).

## Raccourcis clavier

Les raccourcis de l'éditeur sont lus dans `src/hooks/useKeyboardShortcuts.ts`. Sur macOS, Cmd remplace Ctrl. Ils sont suspendus en mode présentation, pendant l'impression du PDF, et ne volent pas les touches quand on tape dans un champ de texte (le navigateur garde alors son propre annuler).

| Touche | Action |
| --- | --- |
| Suppr ou Retour arrière | Supprimer l'élément sélectionné (pas quand on tape dans un champ, pas en touche maintenue) |
| Ctrl+Z | Annuler |
| Ctrl+Maj+Z ou Ctrl+Y | Rétablir |
| Ctrl+D | Dupliquer l'élément sélectionné (une copie par appui, pas par répétition) |
| Flèches | Déplacer l'élément sélectionné de 1 unité |
| Maj+flèches | Déplacer l'élément sélectionné de 10 unités |
| Ctrl+Entrée (dans l'édition du texte) | Valider le texte |
| Échap (dans l'édition du texte) | Annuler la saisie |
| Échap (pendant un déplacement, un redimensionnement ou un glisser de vignette) | Abandonner le geste |

Le texte en cours d'édition est aussi validé quand le champ perd le focus ou quand on clique ailleurs.

**Mode présentation** (`src/components/presentation/navigation.ts`) :

| Touche | Action |
| --- | --- |
| Flèche droite, flèche bas, Page suivante, Entrée, Espace | Diapositive suivante |
| Flèche gauche, flèche haut, Page précédente, Retour arrière, Maj+Espace | Diapositive précédente |
| Début | Première diapositive |
| Fin | Dernière diapositive |
| Échap | Quitter la présentation |
| Clic gauche | Diapositive suivante |

Aux bornes, la navigation s'arrête (pas de retour au début). Les combinaisons avec Ctrl, Alt ou Cmd sont laissées au navigateur.

## Stack

- React 19 et Vite 8
- TypeScript en mode strict (`strict`, `noUncheckedIndexedAccess`)
- Tailwind CSS 4 (plugin Vite)
- Vitest 5, React Testing Library, user-event et jsdom pour les tests
- ESLint 10 avec typescript-eslint et eslint-plugin-react-hooks
- PptxGenJS 4 (licence MIT) pour écrire le fichier .pptx

Aucune bibliothèque pour le glisser-déposer, l'état ou la validation : tout est écrit dans le projet. Les dépendances d'exécution sont `react`, `react-dom` et `pptxgenjs`. `jszip` est en devDependency (les tests relisent l'archive .pptx produite), et un `overrides` dans `package.json` impose `image-size` 2.0.3 ou plus (dépendance de PptxGenJS utilisée sous Node seulement, absente du navigateur) : `npm audit` affiche 0 alerte. Cette dernière est chargée à la demande (import dynamique, au premier export PowerPoint) : elle est dans un fichier à part et n'alourdit pas le chargement de l'application.

## Lancer en local

Prérequis : Node 22.12 ou plus (le projet est développé avec Node 24). Les versions installées de Vitest, jsdom et ESLint ne prennent pas en charge Node 20 pour les tests et le lint.

```bash
cd slide-editor
npm install
npm run dev
```

Vite sert l'application sur http://localhost:5173 (port par défaut, il en prend un autre s'il est occupé).

## Tests, lint, build

Depuis `slide-editor/` :

| Commande | Rôle | Résultat constaté à la rédaction |
| --- | --- | --- |
| `npm test` | Lance tous les tests une fois (`vitest run`) | 56 fichiers, 1608 tests, tous passent |
| `npm run test:watch` | Relance les tests à chaque modification | (mode interactif, non lancé pour ce relevé) |
| `npm run lint` | ESLint sur tout le projet | aucune erreur ni avertissement |
| `npm run build` | Vérification des types (`tsc -b`) puis build de production dans `dist/` | réussi, 68 modules. JavaScript principal d'environ 284 ko (88 ko en gzip), plus deux fichiers chargés seulement au premier export PowerPoint : le code d'export (environ 10 ko) et PptxGenJS (environ 368 ko, 123 ko en gzip) |
| `npm run preview` | Sert le contenu de `dist/` pour le vérifier avant déploiement | (serveur, non lancé pour ce relevé ; la commande est présente dans `package.json`) |

`npm run dev` et `npm run preview` sont des serveurs : leur présence a été vérifiée dans `package.json`, pas leur exécution.

## Architecture

```
slide-editor/
├── index.html
├── vite.config.ts          Vite, Tailwind et configuration de Vitest (jsdom)
├── eslint.config.js
├── docs/
│   ├── DECISIONS.md        choix techniques et difficultés
│   └── screenshots/        captures à ajouter
└── src/
    ├── model/              données pures : types, fabriques, ids, type guards, limites
    ├── editor/             logique d'édition pure : reducer, historique, géométrie
    │   ├── reducer.ts          aiguillage des actions (switch exhaustif)
    │   ├── slideOps.ts         opérations sur les diapositives
    │   ├── elementOps.ts       opérations sur les éléments
    │   ├── presentationOps.ts  charger une présentation, renommer
    │   ├── geometry.ts         bornes, déplacement, redimensionnement, index de dépôt
    │   ├── history.ts          annuler / rétablir (snapshots)
    │   ├── addLimits.ts        règle unique pour refuser un ajout
    │   └── state.ts, types.ts  état initial, types de l'état et des actions
    ├── io/                 entrées et sorties : JSON, images, téléchargement
    │   ├── presentationJson.ts   validation, import, export
    │   ├── pptxExport.ts         export PowerPoint : plan pur (pouces, points) puis écriture avec PptxGenJS
    │   ├── pptxImages.ts         images pour PowerPoint : conversion en PNG via un canvas
    │   ├── cssColor.ts           couleur CSS vers hexadécimal PowerPoint
    │   └── imageUrl.ts, imageSize.ts, imageElement.ts, readImageFile.ts, readTextFile.ts, download.ts
    ├── hooks/              branchement de la logique sur React
    │   ├── EditorProvider.tsx, EditorContext.ts, useEditor.ts   le store
    │   ├── useElementGesture.ts    déplacer et redimensionner
    │   ├── useThumbnailDrag.ts     glisser les vignettes
    │   ├── useKeyboardShortcuts.ts raccourcis
    │   └── useElementSize.ts       mesure de la zone d'édition
    ├── components/         interface
    │   ├── layout/             EditorLayout (seul composant relié au store), bandeau, titre
    │   ├── canvas/             SlideView, SlideCanvas, ElementView, TextEditor
    │   ├── thumbnails/         liste de vignettes et boutons de diapositives
    │   ├── toolbar/            ajout d'éléments, fichier (menu Exporter), annuler / rétablir
    │   ├── properties/         panneau de propriétés
    │   ├── presentation/       mode présentation et navigation
    │   └── print/              vue d'impression (une page par diapositive, export PDF)
    └── test/               aides de test partagées (fixtures, événements de pointeur, disposition simulée)
```

Les tests sont placés à côté du code qu'ils vérifient (`*.test.ts` et `*.test.tsx`).

**Règles de dépendances** (respectées dans le code actuel) :
- `model/`, `editor/` et `io/` n'importent jamais React. Leur logique se teste sans interface.
- Les composants de présentation (canvas, vignettes, barres d'outils, propriétés, mode présentation) reçoivent des données et des fonctions par leurs props, et ne contiennent pas de logique métier.
- Seul `EditorLayout` est connecté au store (`useEditor`). Il lit l'état, répartit des props et envoie les actions.

## Format du fichier JSON

L'export produit un fichier JSON indenté, de cette forme (exemple raccourci) :

```json
{
  "version": 1,
  "title": "Ma présentation",
  "slides": [
    {
      "id": "d4f1c2a0-0000-4000-8000-000000000001",
      "elements": [
        {
          "id": "d4f1c2a0-0000-4000-8000-000000000002",
          "type": "rect",
          "x": 440, "y": 240, "width": 400, "height": 240,
          "opacity": 1,
          "fill": "#2e5d7c"
        },
        {
          "id": "d4f1c2a0-0000-4000-8000-000000000003",
          "type": "text",
          "x": 340, "y": 300, "width": 600, "height": 120,
          "opacity": 1,
          "text": "Bonjour",
          "fontSize": 48,
          "color": "#ffffff",
          "fill": null,
          "bold": true,
          "italic": false,
          "align": "center"
        }
      ]
    }
  ]
}
```

(Le fichier réel n'a pas de commentaires, JSON n'en accepte pas. Les explications sont ci-dessous.)

- **`version`** : toujours `1`. Il sert à reconnaître le format pour pouvoir migrer d'anciens fichiers plus tard. Aujourd'hui, toute autre valeur est refusée.
- **`title`** : texte, nettoyé des espaces en début et fin, tronqué à 200 caractères (sans erreur). S'il est absent, l'import met « Sans titre ».
- **`slides`** : au moins 1 diapositive, 200 au maximum. Chacune a un `id` et une liste `elements`.
- **L'ordre de `elements` est l'ordre d'empilement** : le dernier élément est au premier plan. Il n'y a pas de champ `z-index`.
- **Champs communs** à tous les éléments : `id`, `type` (`"text"`, `"rect"` ou `"image"`), `x`, `y`, `width`, `height` (espace logique 1280 x 720) et `opacity` (de 0 à 1, facultatif, 1 par défaut).
- **Texte** : `text` (10 000 caractères au maximum), `fontSize` (de 8 à 400) et `color` sont obligatoires ; `fill` (couleur ou `null`), `bold`, `italic` et `align` (`"left"`, `"center"`, `"right"`) sont facultatifs, avec pour défauts `null`, `false`, `false` et `"left"`.
- **Rectangle** : `fill` (couleur, obligatoire).
- **Image** : `src` (obligatoire : adresse http, https ou data URL `data:image/`), `alt` (facultatif, 500 caractères au maximum, vide par défaut).
- **Couleurs** : hexadécimal (3, 4, 6 ou 8 chiffres), un mot de 1 à 30 lettres (par exemple `red`, sans vérification de la liste des couleurs CSS), ou `rgb()`, `rgba()`, `hsl()`, `hsla()`.

**Limites** (valeurs lues dans `src/model/limits.ts`, `src/io/presentationJson.ts` et `src/io/readImageFile.ts`) :

| Limite | Valeur |
| --- | --- |
| Taille du fichier à l'import et à l'export | 25 Mo |
| Diapositives par présentation | 200 |
| Éléments par diapositive | 500 |
| Caractères par texte | 10 000 |
| Poids cumulé des images de la présentation (appliqué à l'ajout ou à la copie d'un élément image) | 15 Mo de caractères de `src` |
| Image ajoutée depuis un fichier local | 2 Mo |
| Une image par fichier JSON importé | 4 Mo de caractères de `src` |

La géométrie hors limites (par exemple un élément qui dépasse de la diapositive) est ramenée dans les bornes à l'import plutôt que refusée. Les erreurs de structure sont refusées avec un message en français qui indique la diapositive et l'élément concernés. Détails dans `docs/DECISIONS.md`.

## Déploiement sur Vercel

Le projet est dans le sous-dossier `slide-editor` d'un dépôt qui contient aussi le portfolio (prévu pour Vercel à la racine). Il faut donc créer un projet Vercel distinct qui pointe sur ce sous-dossier.

1. Pousser le dépôt sur GitHub.
2. Sur vercel.com, cliquer sur « Add New » puis « Project », et importer le dépôt.
3. **Important : régler « Root Directory » sur `slide-editor`.** Sans cela, Vercel construirait le portfolio de la racine.
4. Vercel détecte le preset « Vite ». Vérifier : commande de build `npm run build`, dossier de sortie `dist`, commande d'installation par défaut. Version de Node : 22 ou plus (le projet est développé avec Node 24). Aucune variable d'environnement n'est nécessaire.
5. Cliquer sur « Deploy ». Ensuite, chaque push sur la branche principale redéploie.
6. Alternative en ligne de commande : `cd slide-editor`, puis `npx vercel` (une connexion est demandée), puis `npx vercel --prod` pour la production.

Le fichier `vercel.json` à la racine du dépôt concerne le portfolio. Il n'est pas utilisé quand le Root Directory est `slide-editor` (l'éditeur n'en a pas besoin : c'est une application d'une seule page, sans routage).

**URL de la démo : à renseigner après le déploiement.** Le déploiement n'a pas encore été fait.

## Hors périmètre volontaire

Ces points ne sont pas dans le projet, par choix de périmètre (l'export PDF en faisait partie au départ : le périmètre a changé à la demande du propriétaire du projet, voir `docs/DECISIONS.md`) :
- animations des éléments et transitions entre diapositives
- thèmes et modèles de mise en page
- collaboration en temps réel
- sauvegarde automatique (le travail n'est enregistré que par l'export JSON)
- comptes utilisateurs

## Limites connues

- Ctrl+P (impression native du navigateur) n'imprime rien : utiliser Exporter puis PDF.
- **Le rendu d'impression du PDF n'a pas pu être vérifié de façon automatique** : jsdom n'imprime pas. Les tests couvrent le déclenchement, pas la pagination ni les couleurs. À essayer à la main dans un navigateur.
- **Export PowerPoint : le rendu n'est pas garanti identique à l'écran.** Les polices doivent être installées sur l'ordinateur qui ouvre le fichier (le texte est en Arial, présente partout, mais l'éditeur affiche une police système différente). Les coupures de lignes et l'interligne peuvent différer légèrement : l'interligne est fixé à 1,25 fois la taille de police, comme à l'écran, mais chaque logiciel place la première ligne à sa façon. Un texte plus long que sa boîte déborde au lieu d'être coupé. L'opacité d'un texte devient la transparence du texte PowerPoint ; une ancienne version de LibreOffice peut l'ignorer (non vérifié).
- **Pas d'export .odp natif.** Pour obtenir un fichier OpenDocument, ouvrir le .pptx dans LibreOffice Impress puis « Enregistrer sous » au format .odp.
- **Le fichier .pptx produit n'est pas vérifié automatiquement dans PowerPoint ou LibreOffice** : les tests contrôlent le contenu de l'archive (diapositives, positions, couleurs, transparence), pas son affichage. À ouvrir à la main dans les logiciels visés.
- **Rien n'est conservé si on recharge la page** : l'état vit en mémoire. Il faut exporter en JSON pour garder son travail.
- **Pas d'adaptation au mobile ni aux petits écrans** : la mise en page à trois colonnes a des largeurs fixes pour les panneaux latéraux, et l'éditeur n'est pas responsive. Le glisser des vignettes est désactivé au toucher (les boutons Monter / Descendre servent d'alternative).
- **Le clavier ne couvre pas tout** : les flèches déplacent l'élément sélectionné, mais le redimensionnement ne se fait qu'à la souris (les poignées ne sont pas atteignables au clavier). Les lecteurs d'écran ne reçoivent pas d'annonce après un annuler / rétablir.
- **Le vrai plein écran du navigateur n'a pas pu être vérifié de façon automatique** : jsdom ne le gère pas, et l'aperçu intégré utilisé pendant le développement ne l'accorde pas. Les tests le simulent. À essayer à la main dans un navigateur.
- **Pas de test de performance** avec de très grosses présentations (200 diapositives très chargées, images lourdes).
- **Une seule version de format** : `version: 1` est la seule acceptée, aucune migration n'existe encore.
- **Les images par URL dépendent du site distant** : si l'adresse disparaît, l'image disparaît. Dans l'export PowerPoint, elle n'est incluse que si le site qui l'héberge autorise sa lecture (CORS) ; sinon elle est remplacée par un cadre gris portant le texte alternatif, et le message de fin d'export l'indique. Les images ajoutées depuis un fichier, elles, sont dans le JSON (donc alourdissent le fichier) et n'ont pas ce problème.
- Pas de ratio verrouillé au redimensionnement, pas de guides d'alignement.

## Pour aller plus loin

Les choix techniques et les difficultés rencontrées sont expliqués dans [docs/DECISIONS.md](docs/DECISIONS.md).
