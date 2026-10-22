import type { Slide } from '../../model/types'
import { ThumbnailItem } from './ThumbnailItem'

interface ThumbnailPanelProps {
  slides: Slide[]
  selectedSlideId: string
  onSelect: (slideId: string) => void
}

export function ThumbnailPanel({ slides, selectedSlideId, onSelect }: ThumbnailPanelProps) {
  return (
    // La largeur, la bordure et le fond viennent du conteneur (EditorLayout) qui porte aussi la barre d'actions.
    <nav
      aria-label="Vignettes des diapositives"
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden p-2"
    >
      {slides.map((slide, index) => (
        <ThumbnailItem
          key={slide.id}
          slide={slide}
          number={index + 1}
          selected={slide.id === selectedSlideId}
          onSelect={onSelect}
        />
      ))}
    </nav>
  )
}
