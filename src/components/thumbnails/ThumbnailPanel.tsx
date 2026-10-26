import { useCallback, useRef } from 'react'
import { useThumbnailDrag } from '../../hooks/useThumbnailDrag'
import type { Slide } from '../../model/types'
import { ThumbnailItem } from './ThumbnailItem'

interface ThumbnailPanelProps {
  slides: Slide[]
  selectedSlideId: string
  onSelect: (slideId: string) => void
  // Réordonner en glissant (toIndex : index après retrait de la diapositive déplacée).
  // Absent : la liste ne se glisse pas, seuls les boutons Monter et Descendre réordonnent.
  onMoveSlide?: (slideId: string, toIndex: number) => void
}

// Épaisseur de la barre d'insertion, en pixels.
const INDICATOR_HEIGHT = 4

export function ThumbnailPanel({ slides, selectedSlideId, onSelect, onMoveSlide }: ThumbnailPanelProps) {
  // Conteneur défilant et éléments des vignettes : le hook les mesure pendant le glisser.
  const navRef = useRef<HTMLElement | null>(null)
  const itemElements = useRef(new Map<string, HTMLElement>())
  const registerItem = useCallback((slideId: string, element: HTMLElement | null) => {
    if (element) itemElements.current.set(slideId, element)
    else itemElements.current.delete(slideId)
  }, [])
  const getItemElement = useCallback(
    (slideId: string) => itemElements.current.get(slideId) ?? null,
    [],
  )

  const { drag, startDrag } = useThumbnailDrag({
    slideIds: slides.map((slide) => slide.id),
    onSelect,
    onMoveSlide: onMoveSlide ?? (() => {}),
    getItemElement,
    scrollContainerRef: navRef,
  })

  // Pas de barre si la diapositive retomberait à sa place actuelle.
  const draggedIndex = drag ? slides.findIndex((slide) => slide.id === drag.slideId) : -1
  const showIndicator = drag !== null && drag.indicatorTop !== null && drag.toIndex !== draggedIndex

  return (
    // La largeur, la bordure et le fond viennent du conteneur (EditorLayout) qui porte aussi la barre d'actions.
    // `relative` : la barre d'insertion se positionne dans ce conteneur défilant.
    <nav
      ref={navRef}
      aria-label="Vignettes des diapositives"
      className={`relative flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden p-2 ${
        drag ? 'select-none [&_button]:cursor-grabbing' : ''
      }`}
    >
      {slides.map((slide, index) => (
        <ThumbnailItem
          key={slide.id}
          slide={slide}
          number={index + 1}
          selected={slide.id === selectedSlideId}
          onSelect={onSelect}
          onPointerDown={onMoveSlide ? startDrag : undefined}
          onElement={registerItem}
          dragging={drag?.slideId === slide.id}
        />
      ))}
      {showIndicator && drag.indicatorTop !== null && (
        <div
          aria-hidden="true"
          data-testid="drop-indicator"
          className="pointer-events-none absolute inset-x-2 rounded-full bg-blue-500"
          style={{ top: drag.indicatorTop - INDICATOR_HEIGHT / 2, height: INDICATOR_HEIGHT }}
        />
      )}
    </nav>
  )
}
