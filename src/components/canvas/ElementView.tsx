import type { CSSProperties, PointerEventHandler } from 'react'
import type { SlideElement } from '../../model/types'

interface ElementViewProps {
  element: SlideElement
  // Fourni seulement quand l'élément est interactif (zone d'édition, pas vignettes).
  onPointerDown?: PointerEventHandler
}

// Rendu en lecture seule d'un élément, dans l'espace logique de la diapositive.
export function ElementView({ element, onPointerDown }: ElementViewProps) {
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
  }

  switch (element.type) {
    case 'text':
      return (
        <div
          onPointerDown={onPointerDown}
          style={{
            ...box,
            fontSize: element.fontSize,
            color: element.color,
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
