import { SLIDE_HEIGHT, SLIDE_WIDTH, type Slide } from '../../model/types'
import { ElementView } from './ElementView'

interface SlideViewProps {
  slide: Slide
  // Facteur entre l'espace logique (1280x720) et les pixels affichés.
  scale: number
}

export function SlideView({ slide, scale }: SlideViewProps) {
  return (
    // transform ne change pas la place prise dans la page : ce conteneur a donc
    // la taille réduite, et la diapositive 1280x720 à l'intérieur est réduite visuellement.
    <div
      className="relative overflow-hidden bg-white shadow-md"
      style={{ width: SLIDE_WIDTH * scale, height: SLIDE_HEIGHT * scale }}
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
          <ElementView key={element.id} element={element} />
        ))}
      </div>
    </div>
  )
}
