import { useEffect, useRef, useState } from 'react'
import { useEditor } from '../../hooks/useEditor'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { createImageElementFitted } from '../../io/imageElement'
import { measureImage } from '../../io/imageSize'
import { altFromImageUrl } from '../../io/imageUrl'
import { ImageImportError, readImageFile } from '../../io/readImageFile'
import { createRectElement, createTextElement } from '../../model/factories'
import { SlideCanvas } from '../canvas/SlideCanvas'
import { PropertiesPanel } from '../properties/PropertiesPanel'
import { ElementToolbar } from '../toolbar/ElementToolbar'
import { SlideToolbar } from '../thumbnails/SlideToolbar'
import { ThumbnailPanel } from '../thumbnails/ThumbnailPanel'

// Seul composant connecté au store : il lit l'état et passe des props aux autres.
export function EditorLayout() {
  const { history, dispatch } = useEditor()
  // Erreur du dernier import d'image, effacée à la prochaine tentative.
  const [importError, setImportError] = useState<string | null>(null)
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

  function deleteSelection() {
    if (element) dispatch({ type: 'element/delete', elementId: element.id })
  }

  useKeyboardShortcuts({ hasSelection: element !== null, onDeleteSelection: deleteSelection })

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
    <div className="flex h-screen flex-col bg-slate-50 text-slate-900">
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
        <h1 className="text-sm font-semibold">{presentation.title}</h1>
        <span className="text-xs text-slate-500">Éditeur de présentations</span>
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
          />
        </div>
        <PropertiesPanel element={element} />
      </div>
    </div>
  )
}
