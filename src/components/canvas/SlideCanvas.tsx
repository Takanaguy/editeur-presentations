import { useElementSize } from '../../hooks/useElementSize'
import { SLIDE_HEIGHT, SLIDE_WIDTH, type Slide } from '../../model/types'
import { SlideView } from './SlideView'

interface SlideCanvasProps {
  slide: Slide
  selectedElementId?: string | null
  onSelectElement?: (elementId: string | null) => void
}

// Zone centrale : affiche la diapositive à la plus grande taille qui tient
// entièrement dans l'espace disponible, en gardant le 16:9.
export function SlideCanvas({ slide, selectedElementId, onSelectElement }: SlideCanvasProps) {
  const { ref, size } = useElementSize<HTMLDivElement>()
  const scale = Math.min(size.width / SLIDE_WIDTH, size.height / SLIDE_HEIGHT)

  return (
    <main aria-label="Zone d'édition" className="flex min-h-0 min-w-0 flex-1 bg-slate-100 p-6">
      {/* On mesure ce conteneur et non le main : le padding n'entre pas dans l'espace disponible. */}
      <div
        ref={ref}
        className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden"
      >
        <SlideView
          slide={slide}
          scale={scale}
          selectedElementId={selectedElementId}
          onSelectElement={onSelectElement}
        />
      </div>
    </main>
  )
}
