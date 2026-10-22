import { useEditor } from '../../hooks/useEditor'
import { SlideCanvas } from '../canvas/SlideCanvas'
import { PropertiesPanel } from '../properties/PropertiesPanel'
import { SlideToolbar } from '../thumbnails/SlideToolbar'
import { ThumbnailPanel } from '../thumbnails/ThumbnailPanel'

// Seul composant connecté au store : il lit l'état et passe des props aux autres.
export function EditorLayout() {
  const { history, dispatch } = useEditor()
  const { presentation, selectedSlideId, selectedElementId } = history.editor

  const { slides } = presentation
  const slideIndex = slides.findIndex((s) => s.id === selectedSlideId)
  const slide = slides[slideIndex]
  // Ne devrait jamais arriver : le reducer garantit une sélection valide.
  if (!slide) throw new Error('La diapositive sélectionnée est introuvable')
  const element = slide.elements.find((e) => e.id === selectedElementId) ?? null

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
        <SlideCanvas slide={slide} />
        <PropertiesPanel element={element} />
      </div>
    </div>
  )
}
