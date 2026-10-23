import type { Bounds } from '../../editor/geometry'
import { useElementGesture } from '../../hooks/useElementGesture'
import { useElementSize } from '../../hooks/useElementSize'
import { SLIDE_HEIGHT, SLIDE_WIDTH, type Slide } from '../../model/types'
import { SlideView } from './SlideView'

interface SlideCanvasProps {
  slide: Slide
  selectedElementId?: string | null
  onSelectElement?: (elementId: string | null) => void
  // Fournis ensemble pour activer le déplacement et le redimensionnement.
  onMoveElement?: (elementId: string, x: number, y: number) => void
  onResizeElement?: (elementId: string, bounds: Bounds) => void
}

const noop = () => {}

// Zone centrale : affiche la diapositive à la plus grande taille qui tient
// entièrement dans l'espace disponible, en gardant le 16:9.
export function SlideCanvas({
  slide,
  selectedElementId,
  onSelectElement,
  onMoveElement,
  onResizeElement,
}: SlideCanvasProps) {
  const { ref, size } = useElementSize<HTMLDivElement>()
  const scale = Math.min(size.width / SLIDE_WIDTH, size.height / SLIDE_HEIGHT)
  // Le même `scale` sert à l'affichage et à la conversion pixels écran vers logique.
  const { preview, startGesture } = useElementGesture({
    scale,
    onMove: onMoveElement ?? noop,
    onResize: onResizeElement ?? noop,
  })
  const canEdit = onMoveElement !== undefined && onResizeElement !== undefined

  return (
    <main aria-label="Zone d'édition" className="flex min-h-0 min-w-0 flex-1 bg-slate-100 p-6">
      {/* On mesure ce conteneur et non le main : le padding n'entre pas dans l'espace disponible.
          Pas d'overflow-hidden : les poignées d'un élément au bord de la diapositive
          dépassent un peu, dans le padding du main. */}
      <div ref={ref} className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
        <SlideView
          slide={slide}
          scale={scale}
          selectedElementId={selectedElementId}
          onSelectElement={onSelectElement}
          onStartGesture={canEdit ? startGesture : undefined}
          preview={preview}
        />
      </div>
    </main>
  )
}
