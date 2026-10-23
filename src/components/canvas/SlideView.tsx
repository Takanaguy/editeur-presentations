import { SLIDE_HEIGHT, SLIDE_WIDTH, type Slide } from '../../model/types'
import { ElementView } from './ElementView'

interface SlideViewProps {
  slide: Slide
  // Facteur entre l'espace logique (1280x720) et les pixels affichés.
  scale: number
  // Sélection : sans onSelectElement, la vue reste inerte (vignettes).
  selectedElementId?: string | null
  onSelectElement?: (elementId: string | null) => void
}

// Épaisseur visuelle voulue du cadre de sélection, en pixels écran.
const SELECTION_OUTLINE_PX = 2

export function SlideView({ slide, scale, selectedElementId, onSelectElement }: SlideViewProps) {
  const selected = slide.elements.find((e) => e.id === selectedElementId)

  return (
    // transform ne change pas la place prise dans la page : ce conteneur a donc
    // la taille réduite, et la diapositive 1280x720 à l'intérieur est réduite visuellement.
    <div
      className="relative overflow-hidden bg-white shadow-md"
      style={{ width: SLIDE_WIDTH * scale, height: SLIDE_HEIGHT * scale }}
      // Un clic qui arrive jusqu'ici n'a touché aucun élément : on désélectionne.
      onPointerDown={onSelectElement && (() => onSelectElement(null))}
    >
      <div
        className="absolute top-0 left-0"
        style={{
          width: SLIDE_WIDTH,
          height: SLIDE_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        {/* Ordre du tableau = ordre d'empilement : le dernier est dessiné au-dessus. */}
        {slide.elements.map((element) => (
          <ElementView
            key={element.id}
            element={element}
            onPointerDown={
              onSelectElement &&
              ((event) => {
                // Empêche le fond de recevoir le clic et de désélectionner aussitôt.
                event.stopPropagation()
                onSelectElement(element.id)
              })
            }
          />
        ))}
        {selected && (
          // Dans la couche mise à l'échelle : on divise l'épaisseur par l'échelle
          // pour garder environ 2 px à l'écran. Ignore la souris pour ne pas gêner les clics.
          <div
            data-testid="selection-frame"
            style={{
              position: 'absolute',
              left: selected.x,
              top: selected.y,
              width: selected.width,
              height: selected.height,
              outline: `${SELECTION_OUTLINE_PX / (scale > 0 ? scale : 1)}px solid #2563eb`,
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
    </div>
  )
}
