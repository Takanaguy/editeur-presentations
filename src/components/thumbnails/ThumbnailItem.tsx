import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { SLIDE_WIDTH, type Slide } from '../../model/types'
import { SlideView } from '../canvas/SlideView'

export const THUMBNAIL_WIDTH = 176

interface ThumbnailItemProps {
  slide: Slide
  // Numéro affiché, à partir de 1.
  number: number
  selected: boolean
  onSelect: (slideId: string) => void
  // Démarre le glisser (absent : la vignette ne se glisse pas).
  onPointerDown?: (event: ReactPointerEvent, slideId: string) => void
  // Donne l'élément DOM au panneau, qui mesure les vignettes pendant le glisser.
  onElement?: (slideId: string, element: HTMLButtonElement | null) => void
  // Cette vignette est celle qu'on traîne en ce moment.
  dragging?: boolean
}

export function ThumbnailItem({
  slide,
  number,
  selected,
  onSelect,
  onPointerDown,
  onElement,
  dragging = false,
}: ThumbnailItemProps) {
  const ref = useRef<HTMLButtonElement | null>(null)
  const slideId = slide.id

  // Garde l'élément pour scrollIntoView et le transmet au panneau. useCallback pour que
  // React ne détache et rattache pas la ref à chaque rendu.
  const setRef = useCallback(
    (element: HTMLButtonElement | null) => {
      ref.current = element
      onElement?.(slideId, element)
    },
    [onElement, slideId],
  )

  // Garde la vignette sélectionnée visible (après ajout, duplication ou déplacement,
  // elle peut être hors champ). scrollIntoView n'existe pas dans jsdom : l'appel est protégé.
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView?.({ block: 'nearest' })
  }, [selected, number])

  return (
    <button
      ref={setRef}
      type="button"
      aria-label={`Diapositive ${number}`}
      aria-current={selected ? 'true' : undefined}
      onClick={() => onSelect(slide.id)}
      onPointerDown={onPointerDown ? (event) => onPointerDown(event, slide.id) : undefined}
      data-dragging={dragging ? 'true' : undefined}
      className={`relative block rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
        selected ? 'ring-2 ring-blue-500' : 'ring-1 ring-slate-300 hover:ring-slate-400'
      } ${dragging ? 'cursor-grabbing' : 'cursor-pointer'}`}
    >
      {/* Le nom accessible vient de l'aria-label : le contenu visuel est masqué aux lecteurs d'écran.
          Pendant le glisser, seul l'aperçu est atténué : le numéro reste opaque et lisible. */}
      <div aria-hidden="true" className={dragging ? 'opacity-60' : undefined}>
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
