import { useEffect, useRef, useState } from 'react'
import { canRedo, canUndo } from '../../editor/history'
import type { ElementChanges } from '../../editor/types'
import { useEditor } from '../../hooks/useEditor'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { createImageElementFitted } from '../../io/imageElement'
import { measureImage } from '../../io/imageSize'
import { altFromImageUrl } from '../../io/imageUrl'
import { ImageImportError, readImageFile } from '../../io/readImageFile'
import { createRectElement, createTextElement } from '../../model/factories'
import { SlideCanvas } from '../canvas/SlideCanvas'
import { PresentationMode } from '../presentation/PresentationMode'
import { PropertiesPanel } from '../properties/PropertiesPanel'
import { ElementToolbar } from '../toolbar/ElementToolbar'
import { UndoRedoButtons } from '../toolbar/UndoRedoButtons'
import { SlideToolbar } from '../thumbnails/SlideToolbar'
import { ThumbnailPanel } from '../thumbnails/ThumbnailPanel'

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
  const { presentation, selectedSlideId, selectedElementId } = history.editor

  // Id de la diapositive sélectionnée MAINTENANT, lisible depuis un import asynchrone
  // (même motif que useKeyboardShortcuts : écrit dans un effet, pas pendant le rendu).
  const currentSlideIdRef = useRef(selectedSlideId)
  useEffect(() => {
    currentSlideIdRef.current = selectedSlideId
  })

  const { slides } = presentation
  const slideIndex = slides.findIndex((s) => s.id === selectedSlideId)
  const slide = slides[slideIndex]
  // Ne devrait jamais arriver : le reducer garantit une sélection valide.
  if (!slide) throw new Error('La diapositive sélectionnée est introuvable')
  const element = slide.elements.find((e) => e.id === selectedElementId) ?? null

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

  function deleteSelection() {
    if (element) dispatch({ type: 'element/delete', elementId: element.id })
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
    // Pendant la présentation, Suppr, Retour arrière et Ctrl+Z ne doivent rien toucher.
    enabled: !presenting,
  })

  // Rend le focus au bouton Présenter à la sortie, pas au premier rendu.
  const wasPresenting = useRef(false)
  useEffect(() => {
    if (wasPresenting.current && !presenting) presentButtonRef.current?.focus()
    wasPresenting.current = presenting
  }, [presenting])

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
      dispatch({ type: 'element/add', element: createImageElementFitted(src, alt, natural) })
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
      <div className="flex h-screen flex-col bg-slate-50 text-slate-900" inert={presenting}>
        <header className="flex h-10 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold">{presentation.title}</h1>
            <UndoRedoButtons
              canUndo={canUndo(history)}
              canRedo={canRedo(history)}
              onUndo={undo}
              onRedo={redo}
            />
          </div>
          <div className="flex items-center gap-3">
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
        <div className="flex min-h-0 flex-1">
          <div className="flex min-h-0 w-48 shrink-0 flex-col border-r border-slate-200 bg-white">
            <SlideToolbar
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
              canDelete={element !== null}
              error={importError}
              onAddText={() => {
                setImportError(null)
                dispatch({ type: 'element/add', element: createTextElement() })
              }}
              onAddRect={() => {
                setImportError(null)
                dispatch({ type: 'element/add', element: createRectElement() })
              }}
              onAddImageFromUrl={(url) => void addImage(() => Promise.resolve(url), altFromImageUrl(url))}
              onAddImageFromFile={(file) => void addImage(() => readImageFile(file), file.name)}
              onDelete={deleteSelection}
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
    </>
  )
}
