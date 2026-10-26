# Choix techniques et difficultés rencontrées

Ce document explique les décisions importantes de l'éditeur de présentations et les problèmes réels rencontrés en le construisant. Chaque décision suit le même plan : contexte, décision, pourquoi, compromis ou alternative écartée. Les noms de fichiers et de fonctions cités existent dans le code (dossier `src/`).

Pour l'usage du projet (lancement, tests, déploiement), voir le [README](../README.md).

## Méthode de travail

Le projet a été réalisé étape par étape avec l'assistance de Claude Code, avec des agents de développement et de relecture : chaque étape a son commit, ses tests et sa relecture. La section suivante est réservée à Tanguy.

## Ma part et ce que j'en retiens

À compléter par Tanguy.

- Ce que j'ai décidé :
- Ce que j'ai appris :
- Ce que je referais autrement :

## Les décisions

### 1. Le modèle de données

**Contexte.** Il faut représenter une présentation en mémoire, la sauvegarder dans un fichier et l'afficher, sans mélanger ces trois besoins.

**Décision.** Le modèle (`src/model/types.ts`) est un ensemble de types sans aucune dépendance à l'interface : `Presentation` contient des `Slide`, qui contiennent des `SlideElement`. `SlideElement` est une union discriminée par le champ `type` (`TextElement | RectElement | ImageElement`). Les champs communs (`id`, `x`, `y`, `width`, `height`, `opacity`) sont dans `BaseElement`, les champs propres au texte (`text`, `fontSize`, `color`, `fill`, `bold`, `italic`, `align`, `fontFamily`) uniquement dans `TextElement`. Des fabriques (`createTextElement`, `createRectElement`, `createImageElement`, `createSlide`, `duplicateSlide`, `createPresentation` dans `factories.ts`) construisent les objets avec des valeurs par défaut, et des type guards (`isTextElement` et ses deux équivalents dans `guards.ts`) affinent le type. `Presentation` porte un champ `version: 1`.

**Pourquoi.**
- L'union discriminée fait que TypeScript refuse d'accéder à `text` sur un rectangle : après un test sur `type`, il connaît le type exact.
- L'ordre du tableau `elements` est l'ordre d'empilement (le dernier est au premier plan). Il n'y a donc pas de champ `z-index` à garder cohérent : changer l'ordre revient à déplacer un élément dans un tableau, et le fichier JSON reste simple.
- `version: 1` ne sert à rien aujourd'hui, mais il permettra de reconnaître et de migrer un ancien fichier le jour où le format changera. L'ajouter après coup aurait été plus difficile : les anciens fichiers n'auraient pas eu de numéro.
- Les fabriques posent `id` et `type` après les valeurs passées en paramètre, pour qu'un appelant ne puisse pas les écraser.

**Compromis.** Une seule interface avec des champs optionnels aurait été plus courte, mais elle aurait permis des états impossibles (un rectangle avec du texte). L'union demande un peu plus de code et un `switch` par type, en échange de vérifications à la compilation.

### 2. Un espace de coordonnées logique de 1280 x 720

**Contexte.** La diapositive s'affiche à trois tailles : une vignette de 176 pixels de large, la zone d'édition (taille variable) et le plein écran. Les positions des éléments ne doivent pas dépendre de ces tailles.

**Décision.** Toutes les coordonnées du modèle sont exprimées dans un espace logique de 1280 x 720 (`SLIDE_WIDTH`, `SLIDE_HEIGHT`). L'affichage met cet espace à l'échelle avec `transform: scale(...)` en CSS. Un seul composant, `SlideView`, dessine la diapositive : les vignettes, la zone d'édition et le mode présentation l'utilisent avec un `scale` différent. Pour les gestes, `useElementGesture` convertit les pixels écran en unités logiques en divisant le déplacement du pointeur par l'échelle.

**Pourquoi.** Le fichier JSON est le même quelle que soit la taille de la fenêtre. Un seul composant de rendu évite que la vignette, l'édition et la présentation divergent visuellement. Le cadre de sélection et les poignées sont dessinés dans une couche à part, dont les épaisseurs sont divisées par l'échelle pour garder environ 2 et 10 pixels à l'écran.

**Compromis.** Une mise à l'échelle CSS rend aussi le texte à l'échelle (pas de retour à la ligne différent selon la taille, ce qui est voulu). En contrepartie, tout calcul de souris doit penser à convertir. Une échelle nulle ou non finie ferait des divisions par zéro : `applyMove` et `applyResize` ignorent un déplacement non fini, et `SlideView` se rabat sur une échelle de 1 pour les épaisseurs.

### 3. La logique d'édition isolée dans un reducer pur

**Contexte.** L'état de l'éditeur (présentation, diapositive sélectionnée, élément sélectionné) change par de nombreuses actions. On veut pouvoir les tester sans interface et brancher un historique dessus.

**Décision.** Le dossier `src/editor/` ne dépend pas de React. `editorReducer` (`reducer.ts`) est un simple aiguillage vers `slideOps.ts` (diapositives), `elementOps.ts` (éléments), `presentationOps.ts` (charger, renommer) et `geometry.ts` (bornes, déplacement, redimensionnement). Le reducer est pur et immuable : il ne modifie jamais un objet, il recrée seulement les parties qui changent. Le `switch` se termine par `assertNever(action)` avec un paramètre de type `never` : si on ajoute une action au type sans la traiter, TypeScript refuse de compiler. Règle commune à toutes les opérations : **une action sans effet retourne la MÊME référence de state**.

Les limites (`MAX_SLIDES`, `MAX_ELEMENTS_PER_SLIDE`, etc.) sont dans `model/limits.ts`, partagées entre l'éditeur et l'import. `addBlockReason` (`addLimits.ts`) est l'unique règle qui dit si un élément peut être ajouté : le reducer s'en sert pour refuser, et l'interface l'appelle avant d'envoyer l'action pour afficher le message d'explication.

**Pourquoi.**
- La règle de la même référence est ce qui permet à l'historique de ne rien enregistrer quand rien n'a changé (voir décision 4), et à React de ne pas redessiner.
- La partager par construction (et la tester avec `toBe(state)`) est plus fiable que de comparer des contenus.
- Le partage de structure (les diapositives non touchées gardent leur référence) rend les snapshots de l'historique presque gratuits.
- Une règle unique pour les ajouts évite que l'interface autorise ce que le reducer refuserait en silence, ou l'inverse.

**Compromis.** Écrire à la main des copies immuables est plus verbeux qu'une bibliothèque comme Immer. Ici le modèle est plat (les éléments n'ont pas d'objets imbriqués), donc des copies superficielles suffisent, et les tests gèlent les objets en profondeur (`deepFreeze` dans `editor/testHelpers.ts`) pour qu'une mutation accidentelle lève une erreur.

### 4. L'historique annuler / rétablir

**Contexte.** Il faut pouvoir annuler et rétablir jusqu'à 50 actions, sans enregistrer des clics de sélection ni des milliers d'événements pendant qu'on déplace un curseur.

**Décision.** `history.ts` enveloppe l'éditeur : `HistoryState` contient `editor`, un tableau `past` et un tableau `future` de snapshots immuables de la présentation, plus une `coalesceKey`. La limite est `HISTORY_LIMIT = 50` (`pushCapped`).
- **Une entrée naît si et seulement si la référence de `presentation` change.** Pas de liste d'actions à maintenir à la main : si on ajoute une action, l'historique la gère déjà.
- **La sélection est hors de l'historique** : annuler n'annule pas un clic. Après un undo ou un redo, `reconcileSelection` ramène la sélection sur quelque chose de valide (la diapositive qui occupe la même place si la sienne a disparu, l'élément seulement s'il existe encore).
- **Saut vers la diapositive modifiée** : si la diapositive affichée n'a pas changé mais qu'une autre oui, la sélection saute à la première diapositive modifiée, repérée par comparaison de références (`firstModifiedSlide`). Sinon l'utilisateur annulerait sans rien voir bouger.
- **Fusion des saisies continues** : l'action `history/coalesced` porte une clé. Si la modification suivante a la même clé et que rien d'autre n'est arrivé, elle s'ajoute à la même entrée de passé. `history/seal` coupe la chaîne (perte de focus d'un champ, relâchement d'une flèche). Utilisé pour le curseur d'opacité, le sélecteur de couleur, la taille de police, les flèches du clavier et la saisie du titre.

**Pourquoi des snapshots plutôt que des actions inverses.** Une action inverse doit être écrite et testée pour chaque action, et une erreur dans l'une d'elles corrompt l'historique. Un snapshot est l'état entier : annuler consiste à le remettre. Grâce au partage de structure, un snapshot ne coûte presque rien (seules les diapositives modifiées sont de nouveaux objets).

**Alternatives écartées.**
- Les actions inverses (voir ci-dessus).
- Un undo par événement : déplacer un curseur de couleur émet des dizaines d'événements, il aurait fallu appuyer autant de fois sur Ctrl+Z pour revenir en arrière. La fusion par clé garde une seule entrée par intention.

**Compromis.** Les snapshots gardent en mémoire jusqu'à 50 versions de la présentation (partagées pour l'essentiel). Une image ajoutée reste dans les snapshots tant qu'ils existent.

### 5. Le glisser-déposer en événements de pointeur natifs

**Contexte.** Il faut déplacer et redimensionner les éléments, et réordonner les vignettes à la souris.

**Décision.** Deux hooks (`useElementGesture.ts`, `useThumbnailDrag.ts`) utilisent `pointerdown`, `pointermove` et `pointerup`, sans bibliothèque ni API HTML5 `draggable`.
- **Un brouillon local, une seule action.** Pendant le geste, seul un état local (`preview` ou `drag`) change : l'élément est dessiné à sa position provisoire. Le store n'est appelé qu'au relâchement, avec une seule action. Un geste donne donc une entrée d'historique, pas une par mouvement.
- **Écouteurs sur `window`**, installés au début du geste et retirés à sa fin : le geste continue même si le pointeur sort de l'élément.
- **Annulation propre** : Échap, `pointercancel`, perte de focus de la fenêtre (`blur`), ou `pointermove` avec `buttons === 0` (le bouton a été relâché ailleurs et le `pointerup` s'est perdu).
- **Seuil de 5 pixels** (`DRAG_THRESHOLD`) pour les vignettes : en dessous, c'est un clic de sélection. Après un vrai glisser, un garde-clic avale le `click` que le navigateur envoie encore, sinon la vignette serait resélectionnée.
- **Redimensionnement raisonné en bords** (`applyResize`) : on calcule les bords gauche, haut, droit, bas ; seuls les bords de la poignée bougent, chacun borné par la diapositive et par le bord opposé moins la taille minimale (`MIN_ELEMENT_SIZE`, 20). Le coin opposé reste fixe, même à la taille minimale (voir difficulté c).
- **`dropIndexFromPointer`** : l'index d'arrivée d'une vignette glissée est le nombre de centres des AUTRES vignettes situés au dessus du pointeur. C'est directement le `toIndex` de `slide/move`.
- **Pas de glisser tactile pour les vignettes** : le doigt garde le défilement de la liste, et les boutons Monter / Descendre servent d'alternative.

**Pourquoi.** Une bibliothèque de glisser-déposer ajouterait une dépendance pour un besoin précis, et l'API `draggable` du HTML5 ne se prête pas au redimensionnement ni au rendu d'un brouillon à la position exacte. Écrire les gestes soi-même permet de les comprendre et de les tester (`firePointer` envoie des événements de pointeur dans les tests).

**Compromis.** Le code est plus long, avec beaucoup de cas limites à gérer (les quatre causes d'annulation ci-dessus). Le redimensionnement n'a pas d'alternative au clavier.

### 6. L'import JSON : un fichier est une entrée non fiable

**Contexte.** Un fichier importé peut être corrompu, écrit à la main ou piégé. Il ne doit jamais casser l'application ni injecter quoi que ce soit dans la page.

**Décision.** `parsePresentation` et `validatePresentation` (`io/presentationJson.ts`) procèdent en plusieurs temps :
1. Contrôle de la taille avant lecture (`checkImportFileSize`, 25 Mo), puis `JSON.parse` dans un `try/catch`.
2. Validation structurelle stricte, puis **reconstruction champ par champ** d'un objet neuf. L'objet d'entrée n'est jamais copié ni injecté tel quel : aucun champ inconnu, aucune référence ne passe.
3. Lecture des propriétés avec `Object.hasOwn` seulement (fonction `own`), jamais par la chaîne de prototypes. Seuls les objets « simples » sont acceptés (`isPlainObject`). Cela évite la pollution de prototype et l'héritage de champs.
4. `isValidImageUrl` (`io/imageUrl.ts`) n'accepte que `http:`, `https:` et `data:image/`. Pas de `javascript:`, de `file:` ni de `data:text/html`.
5. `isSafeColor` n'accepte que trois formes : hexadécimal (3, 4, 6 ou 8 chiffres), un mot de 1 à 30 lettres (sans vérifier que c'est une vraie couleur CSS : le navigateur ignore une valeur inconnue), ou fonction `rgb`, `rgba`, `hsl`, `hsla` avec des caractères limités. Une couleur finit dans un attribut de style : `url(...)` ou `var(...)` doivent être refusés.
6. Limites de nombre et de taille (`model/limits.ts`, `MAX_IMAGE_SRC_LENGTH`, `MAX_ID_LENGTH`...). Identifiants dupliqués refusés.
7. **Normalisation plutôt que rejet pour la géométrie** : `x`, `y`, `width`, `height` sont arrondis puis ramenés dans la diapositive (`clampBounds`), l'opacité dans [0, 1], la taille de police entre 8 et 400. Un fichier légèrement hors bornes reste utilisable. Les erreurs de **structure** (mauvais type, champ manquant) sont en revanche refusées.
8. **Messages d'erreur humains avec chemin** (« Diapositive 2, élément 3 : la largeur doit être un nombre. »), plafonnés à 20 (`MAX_ERRORS`).
9. L'import passe par l'action normale `presentation/load` : une seule entrée d'historique, donc **annulable**.

**Symétrie export / import.** `prepareExport` re-valide le texte produit avec `parsePresentation` avant de lancer le téléchargement, et refuse un fichier de plus de 25 Mo. Ainsi, l'éditeur ne produit jamais un fichier qu'il refuserait de relire (voir difficulté f).

**Pourquoi.** Valider sans reconstruire laisse passer des champs inattendus. Reconstruire sans valider donne des objets silencieusement faux. Les deux ensemble donnent un résultat sûr et des erreurs lisibles.

**Compromis.** Le code de validation est long (il décrit chaque champ). Le plafond de 15 Mo d'images cumulées est vérifié à l'ajout d'une image, pas à l'import : un fichier importé est borné par ses 25 Mo et par 4 Mo de `src` par image.

### 7. Le mode présentation

**Contexte.** Présenter en plein écran, avec navigation au clavier, sans risquer de modifier la présentation.

**Décision.** `PresentationMode` est une superposition qui couvre toute la fenêtre (`fixed inset-0`), avec `role="dialog"` et `aria-modal`. L'API Fullscreen du navigateur est un **confort** : `requestFullscreen` est appelé de façon protégée (absent dans jsdom, parfois refusé), et si le plein écran échoue le mode reste un plein fenêtre fonctionnel. L'éditeur situé derrière reçoit l'attribut `inert` (plus rien n'est focalisable ni cliquable, les lecteurs d'écran l'ignorent), et les raccourcis de l'éditeur sont suspendus (`enabled: !presenting`). Le composant est présentationnel : il reçoit les diapositives et ne modifie rien.

En plein écran, le navigateur consomme Échap pour sortir du plein écran : l'application ne reçoit pas toujours le `keydown`. Elle écoute donc `fullscreenchange` et ferme le mode quand l'utilisateur a quitté le plein écran qu'il avait obtenu. Si le plein écran arrive après la fermeture du mode (réponse tardive du navigateur), il est défait.

**Pourquoi.** Une superposition fonctionne partout, même sans API Fullscreen. L'attribut `inert` est plus fiable que de masquer l'éditeur ou de piéger le focus à la main. La navigation (`navigationTarget`, fonction pure testée) renvoie toujours un déplacement borné pour une touche reconnue, ce qui permet à l'appelant de bloquer le défilement de la page avec Espace.

**Compromis.** `inert` est ignoré par jsdom, et le vrai plein écran aussi : ces deux comportements ne sont pas vérifiés par les tests automatiques (voir décision 9).

### 8. Accessibilité et clavier

**Contexte.** Un éditeur très visuel peut vite devenir inutilisable au clavier ou au lecteur d'écran. Le projet vise un niveau raisonnable, sans prétendre à une conformité complète.

**Décision.**
- Des rôles et des noms accessibles : `toolbar` et `aria-label` sur les barres d'outils, `aria-label` sur les boutons-icônes, `aria-current` sur la vignette sélectionnée, `aria-pressed` sur les boutons à bascule (gras, italique, alignement), `aria-valuetext` sur le curseur d'opacité (« 40 % »), régions `aria-live` pour les messages et l'annonce de diapositive en mode présentation.
- Dans `useKeyboardShortcuts.ts`, trois fonctions décident quand laisser la touche au navigateur : `isTypingTarget` (Suppr et Retour arrière ne suppriment pas un élément quand on tape), `isTextEntryTarget` (Ctrl+Z reste le annuler natif du champ quand on tape du texte, mais agit sur l'éditeur si le focus est sur un sélecteur de couleur ou un bouton), `isArrowKeyTarget` (les flèches restent à un champ ou à un curseur, mais déplacent l'élément si le focus est sur un bouton).
- Gestion du focus : à la fermeture du mode présentation, le focus revient sur le bouton Présenter ; à la fermeture d'un message d'import ou d'export, il revient sur le bouton qui l'a produit.
- `preventDefault` n'est appelé que quand l'application agit, pour ne pas bloquer le comportement du navigateur sans raison.

**Pourquoi.** Les raccourcis qui volent des touches à un champ de texte sont une source classique de frustration. Distinguer « champ qui saisit du texte » et « champ qui n'utilise que certaines touches » règle les deux cas.

**Compromis.** Le redimensionnement n'est pas faisable au clavier, et aucune annonce n'est faite aux lecteurs d'écran après un annuler. L'accessibilité a été traitée au fil des composants, pas auditée avec un outil dédié.

### 9. La stratégie de tests

**Contexte.** Le projet doit pouvoir changer sans régression, et chaque comportement doit être démontré.

**Décision.** Vitest, React Testing Library et jsdom. À la rédaction : 58 fichiers de test, 1770 tests, tous verts. Principes :
- **La logique pure est testée sans React** : `model`, `editor`, `io`, `navigation.ts`. Ce sont les tests les plus nombreux et les plus rapides.
- **Des aides partagées** : `firePointer` (`src/test/pointer.ts`) envoie des événements de pointeur ; `mockThumbnailLayout` (`src/test/thumbnailLayout.ts`) simule la disposition de la liste de vignettes, car jsdom renvoie des rectangles vides ; `HistorySpy`, un petit composant défini dans les tests de `EditorLayout`, lit `history.past.length` pour prouver qu'une action crée exactement le nombre voulu d'entrées d'historique ; `deepFreeze` détecte les mutations.
- **Tests par mutation à la main des gardes critiques** : pour une garde importante (par exemple le test de l'id de diapositive après un `await`), on la retire ou on la casse dans le code, et on vérifie qu'au moins un test échoue. Un test qui reste vert sans la garde ne prouve rien. Cette pratique n'est pas outillée (il n'y a pas d'outil de mutation dans le projet).
- **Les limites de jsdom sont connues** : pas de mise en page (pas de vraies tailles), pas de support de `inert`, pas de plein écran, et le démontage d'un composant React n'y déclenche pas de `blur`. Ce qui dépend de ces points a été regardé à la main dans l'aperçu intégré à l'outil de développement : le clic sur le fond pendant l'édition du texte (cause de la difficulté (a)), la présence de l'attribut `inert` pendant la présentation et le retour du focus à la sortie. Le plein écran réel n'a pas été obtenu dans cet aperçu, et l'effet complet de `inert` (tabulation, lecteurs d'écran) n'a pas été vérifié : voir les limites connues.

**Pourquoi.** Tester la logique sans React rend les tests rapides et précis ; les tests de composants vérifient seulement le branchement. Les mutations répondent à la question « ce test prouve-t-il vraiment quelque chose ? ».

**Compromis.** Des tests qui simulent le navigateur (pointeur, plein écran) restent des simulations. Il n'y a pas de test de bout en bout dans un vrai navigateur (pas d'outil comme Playwright), donc certaines vérifications reposent sur le test manuel.

### 10. L'export PDF par l'impression du navigateur

**Contexte.** Le JSON ne se rouvre que dans cet éditeur. L'export PDF était hors périmètre au départ : ce périmètre a changé à la demande du propriétaire du projet, pour obtenir un format « présentable ».

**Décision.** Pas de bibliothèque : `window.print()`. Choisir PDF fige les diapositives (`printSlides`, une référence suffit car elles sont immuables) et monte `PrintView`, un portail vers `body` qui contient une page 1280 x 720 par diapositive, rendue par le même `SlideView` que l'éditeur. Le CSS d'impression (`@page`, `@media print` dans `src/index.css`) masque l'éditeur et fixe la page 16:9 sans marges. On attend le décodage des images (5 secondes au plus), on imprime une fois, et la vue disparaît sur `afterprint` (repli à 60 secondes). Pendant l'impression, import, export, second PDF et raccourcis sont suspendus.

**Pourquoi.** C'est le même rendu que l'éditeur (texte vectoriel, polices, opacité), donc la fidélité est parfaite, sans code de mise en page en double. Figer les diapositives évite qu'une modification faite pendant l'attente ne change ce qui est imprimé.

**Compromis.** Le résultat dépend du navigateur (l'utilisateur doit choisir « Enregistrer au format PDF »), et la pagination réelle n'est pas testable avec jsdom. Ctrl+P hors export n'imprime rien, car l'éditeur est masqué à l'impression.

### 11. Export PowerPoint avec PptxGenJS chargé à la demande

**Contexte.** Le PDF existe (décision 10) mais ne se modifie pas. Le propriétaire du projet veut un fichier PowerPoint (.pptx), qui s'ouvre aussi dans LibreOffice Impress, Google Slides et Keynote. Jusqu'ici, les seules dépendances d'exécution du projet étaient `react` et `react-dom` : tout le reste était écrit dans le projet.

**Décision.** Ajouter une seule dépendance d'exécution, PptxGenJS 4 (licence MIT), et la charger à la demande avec un import dynamique (`await import('pptxgenjs')`) au premier export. Le code d'export lui-même (`pptxExport.ts`, `pptxImages.ts`, `cssColor.ts`) est aussi chargé à ce moment, par un import dynamique dans `EditorLayout`. Au build, le bundle principal passe de 280,4 ko à 284,3 ko (86,1 ko à 87,6 ko en gzip) ; le code d'export (environ 10 ko) et PptxGenJS (environ 368 ko, 123 ko en gzip) sont deux fichiers séparés, téléchargés au premier clic sur « PowerPoint ». L'entrée par défaut du paquet convient pour Vite : son champ `browser` neutralise les modules Node (`fs`, `https`, `image-size`) que la bibliothèque n'utilise que côté serveur.

L'export est construit en deux couches :
- **Un plan pur** : `buildPptxPlan(presentation, images)` traduit la présentation en diapositives décrites avec les unités de PowerPoint (pouces, points, hexadécimal sans `#`, transparence en pourcentage). Elle n'appelle ni la bibliothèque ni le navigateur, donc elle se teste avec des nombres : 96 px font 1 pouce, une police de 48 px fait 36 points, une image de 200 x 100 dans une boîte de 400 x 400 occupe 400 x 200 centrée.
- **La colle** : `exportToPptx(presentation, deps)` charge les images, construit le plan, le confie à PptxGenJS et rend un `Blob` avec la liste des avertissements.

Deux protections avant d'écrire : `sanitizeForXml` retire les caractères que le XML 1.0 interdit (contrôles, U+FFFE, U+FFFF, moitiés de paire de substitution isolées) de tout texte qui part dans le fichier, car la bibliothèque ne les filtre pas ; et les images sont chargées trois à la fois au plus (`mapWithConcurrency`), pour ne pas saturer la mémoire avec plusieurs canvas géants.

Les accès au navigateur sont injectés : `loadImage` (lecture des images et conversion en PNG par un canvas, dans `pptxImages.ts`) et `loadLibrary` sont des paramètres de `exportToPptx`, et `pptxImages` reçoit lui-même un faux `Image` et un faux canvas dans les tests. On teste ainsi tout sauf le canvas réel sans navigateur, et la vraie bibliothèque est appelée dans un test d'intégration qui relit l'archive produite avec `jszip` (déclaré en devDependency : il ne sert qu'aux tests) pour vérifier les diapositives, les positions, les couleurs et les transparences.

Les choix de traduction à retenir : le texte reprend la police choisie, Arial sinon (voir décision 12) ; l'interligne est EXACT, 1,25 fois la taille en points, car un interligne « multiple » de PowerPoint part de l'interligne naturel de la police et ne retrouverait pas la valeur de l'écran ; la marge intérieure de 8 px devient 6 points ; l'opacité devient la transparence PowerPoint du fond, du texte (natif) et de l'image (natif aussi, pas besoin d'appliquer l'opacité dans le canvas) ; une image est placée dans le rectangle qu'occupe son `object-fit: contain` à l'écran ; une image illisible devient un cadre gris portant le texte alternatif, avec un avertissement qui nomme la diapositive.

**Pourquoi.** Un fichier .pptx est une archive de dizaines de fichiers XML (présentation, relations, types de contenu, thème, une page XML par diapositive). PptxGenJS sait les produire correctement, et le même fichier sert à PowerPoint et à LibreOffice. Le charger à la demande évite d'alourdir le chargement de l'application pour une fonction utilisée de temps en temps. Le plan pur rend la traduction vérifiable sans ouvrir PowerPoint. Injecter `loadImage` évite de simuler un canvas dans chaque test de la traduction.

**Compromis.** C'est la première dépendance d'exécution hors React, avec ce que cela suppose (mises à jour, taille : 368 ko au premier export). `npm audit` signalait deux alertes sur `image-size`, dépendance de PptxGenJS qui ne sert que sous Node et n'est pas dans le build navigateur (neutralisée par le champ `browser`, vérifié dans le fichier produit). Un `overrides` dans `package.json` impose `image-size` en version 2.0.3 ou plus : `npm audit` affiche 0 alerte, les tests avec la vraie bibliothèque passent et le fichier de PptxGenJS dans le build ne change pas de taille. Le risque est que cet override force une version majeure que PptxGenJS n'a pas testée ; il est sans effet dans le navigateur, mais à revoir si une mise à jour de PptxGenJS corrige le problème de son côté. Le rendu n'est pas identique à l'écran : polices, coupures de lignes et position de la première ligne dépendent du logiciel. Une image distante n'est incluse que si son site autorise la lecture (CORS) ; sinon un cadre gris la remplace. Le fichier produit n'est pas vérifié automatiquement dans PowerPoint ou LibreOffice : les tests contrôlent l'archive, pas l'affichage.

**Alternatives écartées.**
- **Écrire le XML OOXML à la main** : beaucoup de formats à respecter (un seul attribut faux et PowerPoint déclare le fichier corrompu), pour un résultat que PptxGenJS donne déjà. Hors de proportion pour ce projet.
- **Exporter une image par diapositive** : simple et fidèle visuellement, mais le fichier n'est plus modifiable (le texte devient une image, non sélectionnable ni recherchable) : on perd l'intérêt d'un format éditable, que le PDF couvre déjà.
- **Un export .odp natif** : un second format à écrire et à tester pour le même besoin. LibreOffice Impress ouvre le .pptx et sait l'enregistrer en .odp, ce qui suffit.

### 12. Polices : un nom de famille validé, pas une valeur CSS libre

**Contexte.** Le propriétaire veut choisir la police du texte, puis, dans un ticket suivant, ajouter sa propre police depuis un fichier. Une police finit à trois endroits : dans le style CSS de l'écran et de l'impression, dans le fichier JSON, et dans le fichier PowerPoint.

**Décision.** `TextElement.fontFamily` est un NOM de famille (`"Georgia"`) ou `null` (police par défaut de l'application), jamais une pile CSS. `src/model/fonts.ts` contient la liste des 8 polices courantes (`BUILT_IN_FONTS`, avec leur pile de repli), `isSafeFontName` et `cssFontFamily`. `isSafeFontName` n'accepte que 1 à 64 caractères (`MAX_FONT_NAME_LENGTH`) : lettres sans accent, chiffres, espace, tiret bas et tiret, en commençant ET en finissant par une lettre ou un chiffre, sans deux espaces de suite (un espace, un tiret ou un retour à la ligne final est refusé). Ce même test est appliqué aux trois endroits où un nom peut entrer : `updateElement` (l'éditeur), `validatePresentation` (l'import, avec un message en français et le chemin) et `cssFontFamily` (dernier filet avant d'écrire du CSS : un nom non sûr donne `undefined`, donc aucun style). Un nom de la liste donne sa pile, un autre nom sûr (une police installée chez l'utilisateur) donne `"Nom", sans-serif`. Dans le panneau, une police absente de la liste mais présente dans le fichier est affichée comme « Calibri (non listée) » pour que l'état soit visible. La comparaison avec la liste est sensible à la casse : `arial` n'est pas `Arial`, c'est une police « non listée » (CSS `"arial", sans-serif`, avertissement à l'export PowerPoint). Dans l'export PowerPoint, la police est écrite avec un avertissement (une fois par nom) pour toute police hors liste, et le nom passe par `escapeXmlAttr` avant d'être écrit : PptxGenJS ne l'échappe pas dans `typeface="..."`, et `sanitizeForXml` ne retire que les caractères de contrôle. C'est une défense en profondeur, au cas où la règle de `isSafeFontName` serait un jour assouplie.

**Pourquoi.**
- Un nom de police est écrit dans une valeur CSS entre guillemets. Si on acceptait n'importe quelle chaîne, un fichier piégé pourrait fermer les guillemets et injecter du CSS (`Arial"; background:url(x)`). Valider le nom à l'entrée, et pas seulement à la sortie, garde le modèle propre ; la validation à la sortie reste un second filet.
- Stocker un nom et pas une pile CSS permet au ticket suivant (police ajoutée par fichier) de se brancher sans changer le modèle : il suffira de déclarer la police sous ce nom.
- Des polices système d'abord : rien à télécharger, rien à héberger, aucun problème de licence, et le rendu est immédiat.
- `null` par défaut conserve le comportement d'avant et les anciens fichiers (sans `fontFamily`) restent valides.

**Compromis.** Les noms avec accents ou ponctuation (« Fira Code » passe, « Cambria Math » aussi, mais pas « Gill Sans (MT) ») sont refusés : on perd quelques polices rares en échange d'une règle simple et sûre. Le rendu d'une police système dépend de l'ordinateur (Arial et Georgia sont sur Windows et macOS, pas toujours sous Linux), et le fichier PowerPoint ne contient que le nom de la police, pas la police : elle doit être installée là où le fichier s'ouvre. Les piles de repli (`Helvetica`, `serif`...) limitent l'écart à l'écran, pas dans PowerPoint.

## Difficultés rencontrées

- **(a) La saisie de texte perdue en cliquant sur le fond.** Pendant l'édition d'un texte, un clic sur le fond de la diapositive faisait perdre ce qu'on venait de taper. Cause : React applique la désélection (au `pointerdown`) avant que le navigateur ne déplace le focus ; le `textarea` est démonté sans jamais recevoir de `blur`, donc `onBlur` ne valide rien. Invisible dans les tests jsdom, trouvé en test manuel dans un vrai navigateur. Correction : un écouteur `pointerdown` en phase de capture sur `document` (dans `TextEditor.tsx`) valide la saisie avant les gestionnaires de React.
- **(b) Inondation de l'historique par les saisies continues.** Déplacer le curseur d'opacité ou le sélecteur de couleur créait une entrée d'historique par événement. Correction : l'action `history/coalesced` fusionne les modifications de même clé, et `history/seal` coupe la chaîne quand le champ perd le focus.
- **(c) Le coin opposé dérivait à la taille minimale.** Un redimensionnement calculé sur (position, taille) laissait le coin opposé bouger une fois la taille minimale atteinte. Correction : `applyResize` raisonne en bords, chaque bord mobile étant borné par la diapositive et par le bord opposé moins la taille minimale ; le bord opposé ne bouge jamais.
- **(d) Une image importée atterrissait sur la mauvaise diapositive.** L'ajout d'une image est asynchrone (lecture du fichier, mesure de l'image). Si on changeait de diapositive pendant le chargement, l'action `element/add` visait la nouvelle diapositive. Correction : `addImage` retient l'id de départ et le compare à la diapositive courante après les `await` (lue via une ref, pas via la valeur figée du rendu), et refuse l'ajout avec un message sinon. Vérifié par mutation : sans la comparaison, un test échoue.
- **(e) La perte du `pointerup` bloquait les gestes suivants.** Après un alt-tab au milieu d'un geste, le `pointerup` n'arrivait jamais et le geste restait actif, empêchant d'en commencer un autre. Correction : `endGesture` sur `blur` de la fenêtre, et abandon du geste si un `pointermove` arrive avec `buttons === 0`.
- **(f) Asymétrie export / import.** L'éditeur pouvait produire un fichier que l'import refusait (texte très long, plus de 200 diapositives, images lourdes) : l'utilisateur aurait perdu son travail. Correction : les limites sont dans un fichier commun (`model/limits.ts`) appliquées aux deux endroits, `addBlockReason` refuse les ajouts qui dépasseraient, et `prepareExport` re-valide le fichier avant de le télécharger.
- **(g) Une expression régulière de couleur laissait passer `url(...)`.** Trouvé pendant une relecture orientée sécurité. La première version acceptait trop de caractères dans les fonctions de couleur. Correction : trois formes strictes seulement (hexadécimal, nom, `rgb`/`rgba`/`hsl`/`hsla` avec caractères limités et au moins un chiffre), avec des tests sur `url()`, `var()`, guillemets, point-virgule, accolades et retours à la ligne.
- **(h) Le cadre de sélection était rogné au bord de la diapositive.** La diapositive a `overflow: hidden` pour rogner ses éléments, ce qui coupait aussi le cadre et les poignées d'un élément placé au bord. Correction : une couche de superposition séparée, sans `overflow: hidden`, qui dessine le cadre et les poignées (`SlideView.tsx`).
- **(i) Après annuler, la modification pouvait être sur une autre diapositive.** On annulait et rien ne bougeait à l'écran, parce que l'action annulée concernait une autre diapositive que celle affichée. Correction : `reconcileSelection` saute à la première diapositive modifiée, repérée par comparaison de références.
- **(j) Le démontage de React ne déclenche pas de `blur`.** Même cause que (a) vue sous un autre angle : on ne peut pas compter sur `onBlur` quand c'est un changement d'état React qui retire le champ. La validation se fait donc au `pointerdown`, avant le démontage, et pas à la perte de focus seule.
- **(k) Un test qui semblait prouver quelque chose sans le prouver.** Exemple : un test censé vérifier l'usage de `Object.hasOwn` ne le vérifiait pas, car son jeu de données n'exerçait pas la différence avec l'héritage par prototype. Correction : relecture des tests et vérification par mutation (on retire la garde, le test doit échouer). Le test actuel (`ne lit que des propriétés propres`, dans `presentationJson.test.ts`) pollue volontairement `Object.prototype` avec des champs hérités, ce qui fait échouer l'import si la garde est retirée.
- **(l) Caractères de contrôle dans le texte.** Le XML devenait invalide et PowerPoint aurait refusé le fichier ; trouvé en relecture, corrigé par `sanitizeForXml`, vérifié avec la vraie bibliothèque.

## Ce que je ferais ensuite

- **Vérifier le vrai plein écran dans un navigateur.** Il n'a été vérifié que par des tests simulés, et l'aperçu intégré utilisé pendant le développement ne l'accorde pas.
- **Redimensionner et déplacer au clavier**, avec des poignées atteignables au clavier.
- **Annonces pour lecteurs d'écran** après annuler / rétablir.
- **Glisser tactile des vignettes.**
- **Ratio verrouillé avec Maj** pendant le redimensionnement, et **guides d'alignement**.
- **Mesurer la performance** avec de très grosses présentations (200 diapositives, images lourdes).
- **Rendre l'éditeur responsive** et prendre en charge le mobile.
- **Ajouter un test de bout en bout** dans un vrai navigateur, pour couvrir ce que jsdom ne peut pas simuler.

## Limites connues

- Ctrl+P (impression native du navigateur) n'imprime rien : utiliser Exporter puis PDF. Le rendu d'impression réel n'est pas couvert par les tests automatiques.
- Aucune sauvegarde automatique : recharger la page efface le travail non exporté.
- Mobile non pris en charge, et pas de responsive de l'éditeur (largeurs fixes pour les panneaux latéraux).
- Glisser des vignettes désactivé au toucher (boutons Monter / Descendre à la place).
- Redimensionnement uniquement à la souris.
- Le plein écran réel et l'attribut `inert` ne sont pas couverts par les tests automatiques.
- Une seule version de format (`version: 1`), sans migration pour l'instant.
- Export PowerPoint : rendu proche mais pas identique à l'écran (polices installées sur le poste qui ouvre le fichier, coupures de lignes, interligne), pas d'export .odp natif (ouvrir le .pptx dans LibreOffice Impress puis l'enregistrer en .odp). Le fichier n'est pas vérifié automatiquement dans PowerPoint ou LibreOffice.
- Les images par adresse dépendent du site distant : si l'adresse disparaît, l'image disparaît, et dans l'export PowerPoint elle n'est incluse que si le site autorise sa lecture (CORS), sinon un cadre gris la remplace. Les images de fichier alourdissent le JSON.
- Performance non mesurée sur de très grosses présentations.
