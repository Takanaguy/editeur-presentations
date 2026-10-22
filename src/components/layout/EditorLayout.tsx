import { useEditor } from '../../hooks/useEditor'
import { SlideCanvas } from '../canvas/SlideCanvas'
import { PropertiesPanel } from '../properties/PropertiesPanel'
import { ThumbnailPanel } from '../thumbnails/ThumbnailPanel'

// Seul composant connecté au store : il lit l'état et passe des props aux autres.
export function EditorLayout() {
  const { history, dispatch } = useEditor()
  const { presentation, selectedSlideId, selectedElementId } = history.editor

  const slide = presentation.slides.find((s) => s.id === selectedSlideId)
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
        <ThumbnailPanel
          slides={presentation.slides}
          selectedSlideId={selectedSlideId}
          onSelect={(slideId) => dispatch({ type: 'slide/select', slideId })}
        />
        <SlideCanvas slide={slide} />
        <PropertiesPanel element={element} />
      </div>
    </div>
  )
}
