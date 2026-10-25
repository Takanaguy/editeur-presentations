import { useEffect, useRef, useState } from 'react'
import { addBlockReason } from '../../editor/addLimits'
import { canRedo, canUndo } from '../../editor/history'
import type { ElementChanges, ReorderTarget } from '../../editor/types'
import { useEditor } from '../../hooks/useEditor'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { downloadTextFile } from '../../io/download'
import { createImageElementFitted } from '../../io/imageElement'
import { measureImage } from '../../io/imageSize'
import { altFromImageUrl } from '../../io/imageUrl'
import {
  checkImportFileSize,
  parsePresentation,
  prepareExport,
} from '../../io/presentationJson'
import { ImageImportError, readImageFile } from '../../io/readImageFile'
import { TextFileReadError, readTextFile } from '../../io/readTextFile'
import { createRectElement, createTextElement } from '../../model/factories'
import { MAX_ELEMENTS_PER_SLIDE, MAX_SLIDES } from '../../model/limits'
import type { Slide, SlideElement } from '../../model/types'
import { SlideCanvas } from '../canvas/SlideCanvas'
import { PresentationMode } from '../presentation/PresentationMode'
import { PrintView } from '../print/PrintView'
import { PropertiesPanel } from '../properties/PropertiesPanel'
import { ElementToolbar } from '../toolbar/ElementToolbar'
import { FileActions } from '../toolbar/FileActions'
import { UndoRedoButtons } from '../toolbar/UndoRedoButtons'
import { SlideToolbar } from '../thumbnails/SlideToolbar'
import { ThumbnailPanel } from '../thumbnails/ThumbnailPanel'
import { NoticeBanner, type Notice } from './NoticeBanner'
import { TitleField } from './TitleField'

// Durée d'affichage d'un message de succès avant fermeture automatique.
const SUCCESS_NOTICE_MS = 5000

// Attente maximale du décodage des images avant d'imprimer quand même.
const IMAGE_DECODE_CAP_MS = 5000
// Si afterprint n'arrive jamais, la vue d'impression est démontée après ce délai.
const PRINT_FALLBACK_MS = 60_000
const PRINT_STARTED_MESSAGE =
  'La fenêtre d\'impression s\'ouvre : choisissez « Enregistrer au format PDF » comme imprimante.'

// Seul composant connecté au store : il lit l'état et passe des props aux autres.
export function EditorLayout() {
  const { history, dispatch } = useEditor()
  // Erreur du dernier import d'image, effacée à la prochaine tentative.
  const [importError, setImportError] = useState<string | null>(null)
  // Texte en cours d'édition : un état d'interface, hors historique.
  const [editingId, setEditingId] = useState<string | null>(null)
  // Mode présentation ouvert : état d'interface, hors historique.
  const [presenting, setPresenting] = useState(false)
  const presentButtonRef = useRef<HTMLButtonElement>(null)
  // Diapositives figées au clic sur PDF (null = pas d'impression en cours) : état d'interface,
  // hors historique. Les diapositives sont immuables, la référence suffit comme instantané.
  const [printSlides, setPrintSlides] = useState<Slide[] | null>(null)
  const printing = printSlides !== null
  const printViewRef = useRef<HTMLDivElement>(null)
  // Message d'export ou d'import sous l'en-tête : un état d'interface, hors historique.
  const [notice, setNotice] = useState<Notice | null>(null)
  // Titre en cours de saisie. Le store garde le titre nettoyé (espaces retirés) : sans ce
  // brouillon, l'espace tapé après un mot serait effacé aussitôt. null = on affiche le store.
  const [titleDraft, setTitleDraft] = useState<string | null>(null)
  // Numéro du dernier import lancé : un import plus lent ne doit pas écraser un plus récent.
  const importToken = useRef(0)
  // Boutons Exporter et Importer, et lequel a produit le message affiché : à la fermeture du
  // bandeau, le focus retourne à ce bouton (sinon il serait perdu avec le bouton Fermer).
  const exportButtonRef = useRef<HTMLButtonElement>(null)
  const importButtonRef = useRef<HTMLButtonElement>(null)
  const lastFileAction = useRef<'import' | 'export'>('import')
  const { presentation, selectedSlideId, selectedElementId } = history.editor

  // Id de la diapositive sélectionnée MAINTENANT, lisible depuis un import asynchrone
  // (même motif que useKeyboardShortcuts : écrit dans un effet, pas pendant le rendu).
  const currentSlideIdRef = useRef(selectedSlideId)
  // Idem pour la présentation et le mode présentation : un import asynchrone doit relire
  // l'état ACTUEL après ses await, pas celui du rendu où il a démarré.
  const currentPresentationRef = useRef(presentation)
  const presentingRef = useRef(presenting)
  useEffect(() => {
    currentSlideIdRef.current = selectedSlideId
    currentPresentationRef.current = presentation
    presentingRef.current = presenting
  })

  const { slides } = presentation
  const slideIndex = slides.findIndex((s) => s.id === selectedSlideId)
  const slide = slides[slideIndex]
  // Ne devrait jamais arriver : le reducer garantit une sélection valide.
  if (!slide) throw new Error('La diapositive sélectionnée est introuvable')
  // Les fonctions ci-dessous sont déclarées plus bas : TypeScript n'y garde pas le test
  // précédent sur `slide`, d'où cet alias de type Slide.
  const activeSlide: Slide = slide
  const elementIndex = slide.elements.findIndex((e) => e.id === selectedElementId)
  const element = slide.elements[elementIndex] ?? null

  // L'édition ne vaut que pour le texte sélectionné de la diapositive affichée : si
  // l'élément disparaît, change de type, est désélectionné ou si la diapositive change,
  // elle se ferme d'elle-même.
  const editingElementId = element?.type === 'text' && element.id === editingId ? element.id : null
  // On remet aussi l'état à null : sinon, resélectionner plus tard cet élément
  // rouvrirait l'éditeur tout seul. (Ajustement pendant le rendu, sans effet.)
  if (editingId !== null && editingElementId === null) setEditingId(null)

  function commitText(elementId: string, text: string) {
    // Une seule action normale : une session d'édition = une entrée d'historique.
    dispatch({ type: 'element/update', elementId, changes: { text } })
    setEditingId(null)
  }

  function updateSelection(changes: ElementChanges) {
    if (!element) return
    // Les modifications successives du même champ forment une seule entrée d'historique.
    dispatch({
      type: 'history/coalesced',
      key: `update:${element.id}:${Object.keys(changes).join(',')}`,
      action: { type: 'element/update', elementId: element.id, changes },
    })
  }

  function reorderSelection(to: ReorderTarget) {
    if (element) dispatch({ type: 'element/reorder', elementId: element.id, to })
  }

  function deleteSelection() {
    if (element) dispatch({ type: 'element/delete', elementId: element.id })
  }

  // Ajoute un élément neuf, sauf si une limite l'interdit : le message s'affiche alors dans
  // la barre d'outils au lieu de laisser le clic sans effet apparent.
  function addChecked(newElement: SlideElement) {
    const reason = addBlockReason(presentation, activeSlide, newElement)
    setImportError(reason)
    if (!reason) dispatch({ type: 'element/add', element: newElement })
  }

  function duplicateSelection() {
    if (!element) return
    const reason = addBlockReason(presentation, activeSlide, element)
    setImportError(reason)
    if (!reason) dispatch({ type: 'element/duplicate', elementId: element.id })
  }

  // Flèches : position calculée depuis l'élément actuel (le hook relit la dernière valeur à
  // chaque touche). Une rafale ou un maintien de touche = une seule entrée d'historique ;
  // au bord de la diapositive le reducer borne et ne crée rien si rien ne bouge.
  function nudgeSelection(dx: number, dy: number) {
    if (!element) return
    dispatch({
      type: 'history/coalesced',
      key: `nudge:${element.id}`,
      action: { type: 'element/move', elementId: element.id, x: element.x + dx, y: element.y + dy },
    })
  }

  function changeTitle(title: string) {
    setTitleDraft(title)
    // Une frappe continue forme UNE seule entrée d'historique.
    dispatch({
      type: 'history/coalesced',
      key: 'rename-title',
      action: { type: 'presentation/rename', title },
    })
  }

  function endTitleEdit() {
    setTitleDraft(null)
    dispatch({ type: 'history/seal' })
  }

  function exportPresentation() {
    if (presenting || printing) return
    lastFileAction.current = 'export'
    const result = prepareExport(presentation)
    if (!result.ok) {
      setNotice({ kind: 'error', title: 'Export impossible', messages: [result.message] })
      return
    }
    if (downloadTextFile(result.fileName, result.text)) {
      setNotice({ kind: 'success', title: `Présentation exportée : ${result.fileName}`, messages: [] })
    } else {
      setNotice({
        kind: 'error',
        title: 'Export impossible',
        messages: ['Le navigateur a refusé le téléchargement.'],
      })
    }
  }

  // Fige les diapositives et monte la vue d'impression ; l'effet plus bas attend les images
  // puis ouvre l'impression. Tant que printSlides n'est pas null, un second export est ignoré :
  // c'est ce qui garantit un seul appel à print() par export.
  function exportPdf() {
    if (presenting || printing) return
    lastFileAction.current = 'export'
    setNotice(null)
    setPrintSlides(presentation.slides)
  }

  function closeNotice() {
    setNotice(null)
    const button = lastFileAction.current === 'export' ? exportButtonRef : importButtonRef
    button.current?.focus()
  }

  async function importFile(file: File) {
    if (presenting) return
    // Changer la présentation pendant l'impression n'a pas de sens : on refuse l'import.
    if (printing) {
      setNotice({
        kind: 'error',
        title: 'Import impossible',
        messages: ["Import impossible pendant l'impression."],
      })
      return
    }
    lastFileAction.current = 'import'
    const token = ++importToken.current
    const failure = (messages: string[]): Notice => ({
      kind: 'error',
      title: 'Import impossible',
      messages,
    })
    setNotice(null)

    const sizeError = checkImportFileSize(file.size)
    if (sizeError) {
      setNotice(failure([sizeError]))
      return
    }
    try {
      const text = await readTextFile(file)
      // Un import plus récent a été lancé pendant la lecture : ce résultat est périmé.
      if (token !== importToken.current) return
      // La présentation a pu s'ouvrir pendant la lecture : l'éditeur est alors inerte, on
      // n'y touche pas.
      if (presentingRef.current) {
        setNotice(failure(['Import annulé : la présentation est en cours.']))
        return
      }
      const result = parsePresentation(text)
      if (!result.ok) {
        setNotice(failure(result.errors))
        return
      }
      setTitleDraft(null)
      dispatch({ type: 'presentation/load', presentation: result.presentation })
      const count = result.presentation.slides.length
      setNotice({
        kind: 'success',
        // Un titre vide reste vide dans le modèle ; on affiche le repli, pas des guillemets vides.
        title: `Présentation « ${result.presentation.title || 'Sans titre'} » importée : ${count} ${count > 1 ? 'diapositives' : 'diapositive'}.`,
        messages: [],
      })
    } catch (error) {
      if (token !== importToken.current) return
      setNotice(
        failure([
          error instanceof TextFileReadError ? error.message : 'Impossible de lire le fichier.',
        ]),
      )
    }
  }

  function undo() {
    dispatch({ type: 'history/undo' })
  }

  function redo() {
    dispatch({ type: 'history/redo' })
  }

  useKeyboardShortcuts({
    hasSelection: element !== null,
    onDeleteSelection: deleteSelection,
    onUndo: undo,
    onRedo: redo,
    onDuplicate: duplicateSelection,
    onNudge: nudgeSelection,
    // Au relâchement, l'appui suivant formera une nouvelle entrée d'historique.
    onNudgeEnd: () => dispatch({ type: 'history/seal' }),
    // Pendant la présentation ou l'impression, Suppr, Retour arrière et Ctrl+Z ne doivent
    // rien toucher.
    enabled: !presenting && !printing,
  })

  // Rend le focus au bouton Présenter à la sortie, pas au premier rendu.
  const wasPresenting = useRef(false)
  useEffect(() => {
    if (wasPresenting.current && !presenting) presentButtonRef.current?.focus()
    wasPresenting.current = presenting
  }, [presenting])

  // Le succès se ferme tout seul ; l'erreur reste jusqu'à fermeture ou prochaine action.
  // Le minuteur est nettoyé au démontage et à chaque nouveau message.
  useEffect(() => {
    if (notice?.kind !== 'success') return
    const timer = setTimeout(() => setNotice(null), SUCCESS_NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice])

  // Impression : attend les images de la vue d'impression, ouvre la fenêtre d'impression, puis
  // démonte la vue à la fin (afterprint) ou après un délai de secours. Tout vit dans un seul
  // effet, qui ne dépend que des diapositives figées : il repart donc à chaque export et pas
  // autrement. Son nettoyage retire minuteurs et écouteur, y compris au démontage. En
  // StrictMode (développement) l'effet est annulé puis relancé : la première attente est
  // abandonnée par `cancelled`, seule la seconde arrive jusqu'à print().
  useEffect(() => {
    if (!printSlides) return
    let cancelled = false
    let capTimer: ReturnType<typeof setTimeout> | undefined
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined

    function finish() {
      window.removeEventListener('afterprint', finish)
      clearTimeout(fallbackTimer)
      setPrintSlides(null)
    }

    function startPrint() {
      // Installés avant print() : certains navigateurs bloquent dedans et envoient afterprint
      // avant de rendre la main.
      window.addEventListener('afterprint', finish)
      // Repli : certains navigateurs n'envoient jamais afterprint.
      fallbackTimer = setTimeout(finish, PRINT_FALLBACK_MS)
      setNotice({ kind: 'success', title: PRINT_STARTED_MESSAGE, messages: [] })
      try {
        if (typeof window.print !== 'function') throw new Error('print indisponible')
        window.print()
      } catch {
        finish()
        setNotice({
          kind: 'error',
          title: 'Export impossible',
          messages: ["L'impression n'est pas disponible dans ce navigateur."],
        })
      }
    }

    const images = Array.from(printViewRef.current?.querySelectorAll('img') ?? [])
    // Une image cassée ne doit pas bloquer l'export : l'erreur de decode() est ignorée.
    const decoded = Promise.all(
      images.map((img) => (typeof img.decode === 'function' ? img.decode() : Promise.resolve()).catch(() => {})),
    )
    const cap = new Promise<void>((resolve) => {
      capTimer = setTimeout(resolve, IMAGE_DECODE_CAP_MS)
    })
    void Promise.race([decoded, cap]).then(() => {
      clearTimeout(capTimer)
      if (!cancelled) startPrint()
    })

    return () => {
      cancelled = true
      clearTimeout(capTimer)
      clearTimeout(fallbackTimer)
      window.removeEventListener('afterprint', finish)
    }
  }, [printSlides])

  // Mesure l'image puis l'ajoute. Toute erreur d'import est affichée dans la barre d'outils.
  async function addImage(getSrc: () => Promise<string>, alt: string) {
    // element/add vise la diapositive sélectionnée au moment du dispatch : on retient
    // celle de départ pour ne pas poser l'image ailleurs si l'utilisateur change pendant l'import.
    const startSlideId = selectedSlideId
    setImportError(null)
    try {
      const src = await getSrc()
      const natural = await measureImage(src)
      if (!natural) throw new ImageImportError("Impossible de charger l'image.")
      if (currentSlideIdRef.current !== startSlideId) {
        throw new ImageImportError(
          "L'image n'a pas été ajoutée : la diapositive a changé pendant l'import.",
        )
      }
      // La limite a pu être atteinte pendant le chargement : on vérifie APRÈS les await, sur
      // l'état actuel (le reducer refuserait sinon sans rien dire).
      const latest = currentPresentationRef.current
      const target = latest.slides.find((s) => s.id === startSlideId)
      const imageElement = createImageElementFitted(src, alt, natural)
      const reason = target ? addBlockReason(latest, target, imageElement) : null
      if (reason) throw new ImageImportError(reason)
      dispatch({ type: 'element/add', element: imageElement })
    } catch (error) {
      setImportError(
        error instanceof ImageImportError ? error.message : "Impossible d'ajouter l'image.",
      )
    }
  }

  return (
    <>
      {/* inert pendant la présentation : rien derrière n'est focalisable ni cliquable, et les
          lecteurs d'écran l'ignorent. Le mode présentation est son frère, donc non concerné. */}
      <div
        className="flex h-screen flex-col bg-slate-50 text-slate-900 print:hidden"
        inert={presenting}
      >
        <header className="flex h-10 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
          <div className="flex items-center gap-3">
            {/* Le champ ci-dessous est le titre visible ; ce titre de page reste pour la structure. */}
            <h1 className="sr-only">{presentation.title}</h1>
            <TitleField
              value={titleDraft ?? presentation.title}
              onChange={changeTitle}
              onBlur={endTitleEdit}
            />
            <UndoRedoButtons
              canUndo={canUndo(history)}
              canRedo={canRedo(history)}
              onUndo={undo}
              onRedo={redo}
            />
          </div>
          <div className="flex items-center gap-3">
            <FileActions
              onExportJson={exportPresentation}
              onExportPdf={exportPdf}
              onImportFile={(file) => void importFile(file)}
              disabled={presenting || printing}
              exportRef={exportButtonRef}
              importRef={importButtonRef}
            />
            <span className="text-xs text-slate-500">Éditeur de présentations</span>
            <button
              ref={presentButtonRef}
              type="button"
              aria-label="Présenter"
              title="Présenter en plein écran"
              onClick={() => setPresenting(true)}
              className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" />
              </svg>
              Présenter
            </button>
          </div>
        </header>
        <NoticeBanner notice={notice} onClose={closeNotice} />
        <div className="flex min-h-0 flex-1">
          <div className="flex min-h-0 w-48 shrink-0 flex-col border-r border-slate-200 bg-white">
            <SlideToolbar
              canAddSlide={slides.length < MAX_SLIDES}
              canDelete={slides.length > 1}
              canMoveUp={slideIndex > 0}
              canMoveDown={slideIndex < slides.length - 1}
              onAdd={() => dispatch({ type: 'slide/add' })}
              onDuplicate={() => dispatch({ type: 'slide/duplicate', slideId: selectedSlideId })}
              onDelete={() => dispatch({ type: 'slide/delete', slideId: selectedSlideId })}
              onMoveUp={() =>
                dispatch({ type: 'slide/move', slideId: selectedSlideId, toIndex: slideIndex - 1 })
              }
              onMoveDown={() =>
                dispatch({ type: 'slide/move', slideId: selectedSlideId, toIndex: slideIndex + 1 })
              }
            />
            <ThumbnailPanel
              slides={slides}
              selectedSlideId={selectedSlideId}
              onSelect={(slideId) => dispatch({ type: 'slide/select', slideId })}
              onMoveSlide={(slideId, toIndex) => dispatch({ type: 'slide/move', slideId, toIndex })}
            />
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <ElementToolbar
              canAddElement={slide.elements.length < MAX_ELEMENTS_PER_SLIDE}
              canDelete={element !== null}
              error={importError}
              onAddText={() => addChecked(createTextElement())}
              onAddRect={() => addChecked(createRectElement())}
              onAddImageFromUrl={(url) => void addImage(() => Promise.resolve(url), altFromImageUrl(url))}
              onAddImageFromFile={(file) => void addImage(() => readImageFile(file), file.name)}
              onDelete={deleteSelection}
              onDuplicate={duplicateSelection}
            />
            <SlideCanvas
              slide={slide}
              selectedElementId={selectedElementId}
              onSelectElement={(elementId) => dispatch({ type: 'element/select', elementId })}
              onMoveElement={(elementId, x, y) => dispatch({ type: 'element/move', elementId, x, y })}
              onResizeElement={(elementId, bounds) =>
                dispatch({ type: 'element/resize', elementId, bounds })
              }
              editingElementId={editingElementId}
              onEditElement={setEditingId}
              onCommitText={commitText}
              onCancelEdit={() => setEditingId(null)}
            />
          </div>
          <PropertiesPanel
            element={element}
            onUpdate={updateSelection}
            onSeal={() => dispatch({ type: 'history/seal' })}
            onReorder={reorderSelection}
            canReorder={{
              front: elementIndex >= 0 && elementIndex < slide.elements.length - 1,
              back: elementIndex > 0,
            }}
          />
        </div>
      </div>
      {presenting && (
        <PresentationMode
          slides={slides}
          startIndex={slideIndex}
          onExit={() => setPresenting(false)}
        />
      )}
      {printSlides && <PrintView slides={printSlides} containerRef={printViewRef} />}
    </>
  )
}
