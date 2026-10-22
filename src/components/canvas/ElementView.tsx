import type { CSSProperties } from 'react'
import type { SlideElement } from '../../model/types'

interface ElementViewProps {
  element: SlideElement
}

// Rendu en lecture seule d'un élément, dans l'espace logique de la diapositive.
export function ElementView({ element }: ElementViewProps) {
  const box: CSSProperties = {
    position: 'absolute',
    left: element.x,
    top: element.y,
    width: element.width,
    height: element.height,
  }

  switch (element.type) {
    case 'text':
      return (
        <div
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
      return <div style={{ ...box, backgroundColor: element.fill }} />
    case 'image':
      return (
        <img
          src={element.src}
          alt={element.alt}
          draggable={false}
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
