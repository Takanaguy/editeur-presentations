import type { CSSProperties, MouseEventHandler, PointerEventHandler } from 'react'
import type { SlideElement, TextElement } from '../../model/types'

interface ElementViewProps {
  element: SlideElement
  // Fourni seulement quand l'élément est interactif (zone d'édition, pas vignettes).
  onPointerDown?: PointerEventHandler
  // Utilisé pour entrer en édition du texte ; ignoré par les rectangles et les images.
  onDoubleClick?: MouseEventHandler
}

// Marge intérieure d'un texte (unités logiques) : sans elle, le texte touche les bords
// de sa boîte. Partagée avec TextEditor pour que l'édition ressemble au rendu.
export const TEXT_PADDING = 8
export const TEXT_LINE_HEIGHT = 1.25

// Style du texte partagé avec TextEditor : l'édition doit ressembler au rendu.
export function textStyle(element: TextElement): CSSProperties {
  return {
    fontWeight: element.bold ? 700 : 'normal',
    fontStyle: element.italic ? 'italic' : 'normal',
    textAlign: element.align,
  }
}

// Rendu en lecture seule d'un élément, dans l'espace logique de la diapositive.
export function ElementView({ element, onPointerDown, onDoubleClick }: ElementViewProps) {
  const box: CSSProperties = {
    position: 'absolute',
    left: element.x,
    top: element.y,
    width: element.width,
    height: element.height,
    cursor: onPointerDown ? 'move' : undefined,
    // Interactif : le doigt déplace l'élément au lieu de faire défiler la page,
    // et la souris ne sélectionne pas le texte pendant le glisser.
    touchAction: onPointerDown ? 'none' : undefined,
    userSelect: onPointerDown ? 'none' : undefined,
    // Seul l'élément est transparent : le cadre et les poignées vivent dans une autre couche.
    opacity: element.opacity,
  }

  switch (element.type) {
    case 'text':
      return (
        <div
          onPointerDown={onPointerDown}
          onDoubleClick={onDoubleClick}
          style={{
            ...box,
            padding: TEXT_PADDING,
            boxSizing: 'border-box',
            lineHeight: TEXT_LINE_HEIGHT,
            fontSize: element.fontSize,
            color: element.color,
            ...textStyle(element),
            backgroundColor: element.fill ?? undefined,
            // Respecte les retours à la ligne saisis, et coupe les mots trop longs.
            whiteSpace: 'pre-wrap',
            overflowWrap: 'break-word',
            overflow: 'hidden',
          }}
        >
          {element.text}
        </div>
      )
    case 'rect':
      return <div onPointerDown={onPointerDown} style={{ ...box, backgroundColor: element.fill }} />
    case 'image':
      return (
        <img
          src={element.src}
          alt={element.alt}
          draggable={false}
          onPointerDown={onPointerDown}
          style={{ ...box, objectFit: 'contain', userSelect: 'none' }}
        />
      )
    default: {
      // Si on ajoute un type d'élément sans le gérer ici, le build échoue.
      const unreachable: never = element
      return unreachable
    }
  }
}
