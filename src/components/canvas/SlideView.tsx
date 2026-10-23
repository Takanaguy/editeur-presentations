import type { PointerEvent as ReactPointerEvent } from 'react'
import type { ResizeHandle } from '../../editor/geometry'
import type { GestureMode, GesturePreview } from '../../hooks/useElementGesture'
import {
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  type Slide,
  type SlideElement,
  type TextElement,
} from '../../model/types'
import { ElementView } from './ElementView'
import { TextEditor } from './TextEditor'

interface SlideViewProps {
  slide: Slide
  // Facteur entre l'espace logique (1280x720) et les pixels affichés.
  scale: number
  // Sélection : sans onSelectElement, la vue reste inerte (vignettes).
  selectedElementId?: string | null
  onSelectElement?: (elementId: string | null) => void
  // Geste : sans onStartGesture, pas de déplacement ni de poignées.
  onStartGesture?: (event: ReactPointerEvent, element: SlideElement, mode: GestureMode) => void
  // Brouillon du geste en cours : remplace la géométrie de l'élément concerné.
  preview?: GesturePreview | null
  // Édition du texte : sans onEditElement, le double clic ne fait rien (vignettes).
  editingElementId?: string | null
  onEditElement?: (elementId: string) => void
  onCommitText?: (elementId: string, text: string) => void
  onCancelEdit?: () => void
}

// Épaisseur visuelle voulue du cadre de sélection, en pixels écran.
const SELECTION_OUTLINE_PX = 2
// Taille visuelle d'une poignée, en pixels écran.
const HANDLE_SIZE_PX = 10
const SELECTION_COLOR = '#2563eb'

// Les 8 poignées : position sur le cadre (0 = bord gauche/haut, 0.5 = milieu, 1 = bord
// droite/bas) et curseur adapté à la direction du redimensionnement.
const HANDLES: { handle: ResizeHandle; fx: number; fy: number; cursor: string }[] = [
  { handle: 'nw', fx: 0, fy: 0, cursor: 'nwse-resize' },
  { handle: 'n', fx: 0.5, fy: 0, cursor: 'ns-resize' },
  { handle: 'ne', fx: 1, fy: 0, cursor: 'nesw-resize' },
  { handle: 'e', fx: 1, fy: 0.5, cursor: 'ew-resize' },
  { handle: 'se', fx: 1, fy: 1, cursor: 'nwse-resize' },
  { handle: 's', fx: 0.5, fy: 1, cursor: 'ns-resize' },
  { handle: 'sw', fx: 0, fy: 1, cursor: 'nesw-resize' },
  { handle: 'w', fx: 0, fy: 0.5, cursor: 'ew-resize' },
]

export function SlideView({
  slide,
  scale,
  selectedElementId,
  onSelectElement,
  onStartGesture,
  preview,
  editingElementId,
  onEditElement,
  onCommitText,
  onCancelEdit,
}: SlideViewProps) {
  // Les deux couches (éléments, superposition) ont la même mise à l'échelle.
  const layerStyle = {
    width: SLIDE_WIDTH,
    height: SLIDE_HEIGHT,
    transform: `scale(${scale})`,
    transformOrigin: 'top left',
  }
  // Une échelle nulle donnerait une division par zéro : on se rabat sur 1.
  const safeScale = scale > 0 ? scale : 1

  // Géométrie à afficher : le brouillon remplace celle du modèle pendant le geste.
  function displayed(element: SlideElement): SlideElement {
    return preview && preview.elementId === element.id ? { ...element, ...preview.bounds } : element
  }

  // Seul un texte s'édite : un id qui vise un autre type d'élément est ignoré.
  const editedText = slide.elements.find(
    (e): e is TextElement => e.type === 'text' && e.id === editingElementId,
  )

  const selected = slide.elements.find((e) => e.id === selectedElementId)
  const frame = selected && displayed(selected)

  return (
    // transform ne change pas la place prise dans la page : ce conteneur a donc
    // la taille réduite, et la diapositive 1280x720 à l'intérieur est réduite visuellement.
    // Pas d'overflow-hidden ici : le cadre et les poignées d'un élément au bord doivent
    // pouvoir dépasser. Ce sont les éléments, dans leur couche, qui sont rognés.
    <div
      className="relative bg-white shadow-md"
      style={{ width: SLIDE_WIDTH * scale, height: SLIDE_HEIGHT * scale }}
      // Un clic qui arrive jusqu'ici n'a touché aucun élément : on désélectionne.
      onPointerDown={onSelectElement && (() => onSelectElement(null))}
    >
      {/* Couche des éléments : overflow-hidden s'applique dans l'espace 1280x720,
          donc rogne exactement aux bords de la diapositive. */}
      <div className="absolute top-0 left-0 overflow-hidden" style={layerStyle}>
        {/* Ordre du tableau = ordre d'empilement : le dernier est dessiné au-dessus. */}
        {slide.elements.map((element) =>
          // Pendant l'édition, la zone de saisie remplace l'élément (le brouillon de geste
          // ne s'applique pas).
          editedText && element.id === editedText.id ? (
            <TextEditor
              key={element.id}
              element={editedText}
              onCommit={(text) => onCommitText?.(editedText.id, text)}
              onCancel={() => onCancelEdit?.()}
            />
          ) : (
            <ElementView
              key={element.id}
              element={displayed(element)}
              onPointerDown={
                onSelectElement &&
                ((event) => {
                  // Empêche le fond de recevoir le clic et de désélectionner aussitôt.
                  event.stopPropagation()
                  onSelectElement(element.id)
                  onStartGesture?.(event, element, 'move')
                })
              }
              onDoubleClick={
                onEditElement && element.type === 'text' ? () => onEditElement(element.id) : undefined
              }
            />
          ),
        )}
      </div>
      {frame && (
        // Couche de superposition, sœur de la précédente et sans overflow-hidden.
        // Elle laisse passer la souris : seules les poignées la reçoivent.
        <div
          className="absolute top-0 left-0"
          style={{ ...layerStyle, pointerEvents: 'none' }}
        >
          {/* On divise les tailles par l'échelle pour garder environ 2 px et 10 px à l'écran. */}
          <div
            data-testid="selection-frame"
            style={{
              position: 'absolute',
              left: frame.x,
              top: frame.y,
              width: frame.width,
              height: frame.height,
              outline: `${SELECTION_OUTLINE_PX / safeScale}px solid ${SELECTION_COLOR}`,
            }}
          />
          {/* Pas de poignées pendant l'édition du texte, le cadre suffit. */}
          {onStartGesture &&
            selected &&
            !editedText &&
            HANDLES.map(({ handle, fx, fy, cursor }) => {
              const size = HANDLE_SIZE_PX / safeScale
              return (
                <div
                  key={handle}
                  data-handle={handle}
                  onPointerDown={(event) => {
                    // Ni déplacement de l'élément, ni désélection par le fond.
                    event.stopPropagation()
                    onStartGesture(event, selected, handle)
                  }}
                  style={{
                    position: 'absolute',
                    // Centré sur le point du cadre : on recule d'une demi-poignée.
                    left: frame.x + fx * frame.width - size / 2,
                    top: frame.y + fy * frame.height - size / 2,
                    width: size,
                    height: size,
                    boxSizing: 'border-box',
                    backgroundColor: '#ffffff',
                    border: `${SELECTION_OUTLINE_PX / safeScale}px solid ${SELECTION_COLOR}`,
                    cursor,
                    pointerEvents: 'auto',
                    touchAction: 'none',
                    userSelect: 'none',
                  }}
                />
              )
            })}
        </div>
      )}
    </div>
  )
}
