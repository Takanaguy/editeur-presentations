import { SLIDE_WIDTH, type Slide } from '../../model/types'
import { SlideView } from '../canvas/SlideView'

export const THUMBNAIL_WIDTH = 176

interface ThumbnailItemProps {
  slide: Slide
  // Numéro affiché, à partir de 1.
  number: number
  selected: boolean
  onSelect: (slideId: string) => void
}

export function ThumbnailItem({ slide, number, selected, onSelect }: ThumbnailItemProps) {
  return (
    <button
      type="button"
      aria-label={`Diapositive ${number}`}
      aria-current={selected ? 'true' : undefined}
      onClick={() => onSelect(slide.id)}
      className={`relative block cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
        selected ? 'ring-2 ring-blue-500' : 'ring-1 ring-slate-300 hover:ring-slate-400'
      }`}
    >
      {/* Le nom accessible vient de l'aria-label : le contenu visuel est masqué aux lecteurs d'écran. */}
      <div aria-hidden="true">
        <SlideView slide={slide} scale={THUMBNAIL_WIDTH / SLIDE_WIDTH} />
      </div>
      <span
        aria-hidden="true"
        className="absolute bottom-1 left-1 rounded-sm bg-slate-800/70 px-1.5 text-xs font-medium text-white"
      >
        {number}
      </span>
    </button>
  )
}
