import type { Ref } from 'react'
import { createPortal } from 'react-dom'
import { SLIDE_HEIGHT, SLIDE_WIDTH, type Slide } from '../../model/types'
import { SlideView } from '../canvas/SlideView'

interface PrintViewProps {
  slides: Slide[]
  // Pour que le parent retrouve les images à attendre avant d'imprimer.
  containerRef?: Ref<HTMLDivElement>
}

// Présentationnel : une page par diapositive, visible seulement à l'impression.
// Le portail l'envoie dans body, hors de la racine de l'éditeur (masquée à l'impression).
export function PrintView({ slides, containerRef }: PrintViewProps) {
  return createPortal(
    <div
      ref={containerRef}
      data-testid="print-view"
      aria-hidden="true"
      className="print-root hidden print:block"
    >
      {slides.map((slide, index) => {
        // Pas de saut après la dernière page : il ajouterait une page blanche à la fin.
        const isLast = index === slides.length - 1
        return (
          <div
            key={slide.id}
            data-testid="print-page"
            style={{
              width: SLIDE_WIDTH,
              height: SLIDE_HEIGHT,
              overflow: 'hidden',
              breakInside: 'avoid',
              // Ancienne et nouvelle propriété : les navigateurs ne lisent pas toutes les deux.
              breakAfter: isLast ? undefined : 'page',
              pageBreakAfter: isLast ? undefined : 'always',
            }}
          >
            {/* Échelle 1 et aucune prop d'interaction : un rendu fixe. */}
            <SlideView slide={slide} scale={1} />
          </div>
        )
      })}
    </div>,
    document.body,
  )
}
